/* ------------------------------------------------------------------ */
/* Mocks — must come BEFORE any source imports                        */
/* ------------------------------------------------------------------ */

jest.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-key-at-least-32-chars!',
    JWT_EXPIRES_IN: '4h',
    CORS_ORIGIN: '*',
    TRUST_PROXY: '0',
    REGISTRO_ABIERTO: true,
    APP_URL: 'http://localhost:5173',
  },
  corsOrigins: '*',
  isProduction: false,
}));

jest.mock('../config/database', () => ({
  sequelize: {
    authenticate: jest.fn(),
    close: jest.fn(),
    define: jest.fn(),
    model: jest.fn(),
    models: {},
  },
}));

jest.mock('sequelize', () => {
  class MockModel {
    static init() {
      return this;
    }
    static findAll() {
      return [];
    }
    static findOne() {
      return null;
    }
    static findByPk() {
      return null;
    }
    static create() {
      return {};
    }
    static update() {
      return [0];
    }
    static destroy() {
      return 0;
    }
    static belongsTo() {
      return this as any;
    }
    static hasMany() {
      return this as any;
    }
    static belongsToMany() {
      return this as any;
    }
  }
  return {
    DataTypes: new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'ENUM') return (..._vals: any[]) => ({ type: 'ENUM' });
          if (prop === 'STRING') return (_len?: number) => ({ type: 'STRING' });
          return { type: String(prop) };
        },
      },
    ),
    Model: MockModel,
    Op: {
      in: Symbol('Op.in'),
      gt: Symbol('Op.gt'),
      lt: Symbol('Op.lt'),
      and: Symbol('Op.and'),
      or: Symbol('Op.or'),
    },
  };
});

jest.mock('../models', () => ({
  Wod: { findByPk: jest.fn() },
  Asignacion: { findOne: jest.fn() },
}));

jest.mock('../utils/monitoring', () => ({
  initMonitoring: jest.fn(),
  requestContext: (_req: any, _res: any, next: any) => next(),
  socketHealth: () => ({ stale: false }),
  noteBroadcast: jest.fn(),
}));

jest.mock('../middleware/rateLimiter', () => ({
  rateLimiter: () => (_req: any, _res: any, next: any) => next(),
  strictRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  rateLimitByRole: () => (_req: any, _res: any, next: any) => next(),
  throttleSocket: jest.fn().mockReturnValue(true),
}));

jest.mock('../services/scoring/leaderboard', () => ({
  getLeaderboard: jest.fn(),
}));

jest.mock('../services/scoringEngine', () => ({
  getLeaderboard: jest.fn(),
}));

jest.mock('../services/arranqueService', () => ({
  obtenerSnapshot: jest.fn(),
  estadoArranque: jest.fn(),
  armarCompetencia: jest.fn(),
  pausarArranque: jest.fn(),
  reanudarArranque: jest.fn(),
  finalizarArranque: jest.fn(),
  cancelarArranque: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  log: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

/* ------------------------------------------------------------------ */
/* Imports after mocks                                                 */
/* ------------------------------------------------------------------ */

import { Server } from 'socket.io';
import * as http from 'http';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { setupSocketHandlers, broadcastLeaderboard } from '../sockets/handlers';
import { Wod, Asignacion } from '../models';
import * as scoringEngine from '../services/scoringEngine';
import * as arranqueService from '../services/arranqueService';
import * as rateLimiter from '../middleware/rateLimiter';

const JWT_SECRET = 'test-secret-key-at-least-32-chars!';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function makeToken(payload: Record<string, any> = {}): string {
  return jwt.sign(
    { id: 1, cedula: '12345', rol: 'juez', tipo: 'usuario', ...payload },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

const mockLeaderboard = {
  competencia: { id: 1, nombre: 'Test Comp' },
  // Forma real de getLeaderboard (services/scoring/leaderboard.ts):
  // `leaderboard` con puesto y puntos_total (lo lee broadcastLeaderboard).
  leaderboard: [
    { participante_id: 10, nombre: 'Atleta 1', puntaje_total: 100, puesto: 1, puntos_total: 100 },
  ],
};

/* ------------------------------------------------------------------ */
/* Test suite                                                          */
/* ------------------------------------------------------------------ */

/* Presupuesto de espera de una condición. En el CI (2 núcleos, cobertura
   midiendo cada línea) un `setTimeout(50)` no garantiza nada: llega antes de
   que el servidor conteste y la prueba falla sola. Esperamos a que pase lo que
   tiene que pasar, con un techo que falla claro si de verdad no pasa. */
const PRESUPUESTO_MS = 5000;

async function esperarA(
  condicion: () => boolean | Promise<boolean>,
  descripcion: string,
  ms: number = PRESUPUESTO_MS,
): Promise<void> {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (await condicion()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`No se cumplió en ${ms} ms: ${descripcion}`);
}

/* Pausa corta para las comprobaciones de "esto NO debe pasar": ahí no hay nada
   que esperar, solo dar tiempo a que ocurriera si fuera a ocurrir. */
function pausa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* Pregunta el estado de un bloqueo desde otro cliente. Devuelve la respuesta
   del servidor, para poder esperarla con `esperarA` en vez de con un reloj. */
function consultarBloqueo(
  client: ClientSocket,
  participanteId: number,
  wodId: number,
): Promise<any> {
  return new Promise((resolve) => {
    client.emit(
      'check-participant-lock',
      { participante_id: participanteId, wod_id: wodId },
      (data: any) => resolve(data),
    );
  });
}

/* Todo servidor y cliente que abre una prueba queda registrado aquí, y el
   `afterEach` los cierra pase lo que pase. Un servidor olvidado deja un puerto
   escuchando: el proceso no termina y Jest se queda esperando al trabajador
   (o lo mata, que es el aviso "worker process has failed to exit"). */
const servidoresAbiertos: Array<{ server: http.Server; sio: Server }> = [];
const clientesAbiertos: ClientSocket[] = [];

function createServerAndConnect(
  auth?: Record<string, any> | null,
): Promise<{ client: ClientSocket; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const sio = new Server(server, { cors: { origin: '*' } });
    setupSocketHandlers(sio);
    servidoresAbiertos.push({ server, sio });

    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      const clientOpts: any = { transports: ['websocket'] };
      if (auth === null) {
        // no token
      } else if (auth) {
        clientOpts.auth = { token: makeToken(auth) };
      }

      const client = ioClient(`http://localhost:${port}`, clientOpts);
      clientesAbiertos.push(client);

      // Sin esto, un cliente que nunca conecta deja la prueba colgada hasta
      // que Jest la mata por tiempo: fallo sin nombre y sin causa.
      const plazo = setTimeout(() => {
        client.close();
        reject(new Error(`El cliente no conectó en ${PRESUPUESTO_MS} ms`));
      }, PRESUPUESTO_MS);
      plazo.unref?.();

      client.on('connect', () => {
        clearTimeout(plazo);
        resolve({ client, port });
      });
      client.on('connect_error', (err) => {
        clearTimeout(plazo);
        reject(err);
      });

      // Expose server for cleanup
      (client as any)._testServer = server;
      (client as any)._testIO = sio;
    });
  });
}

function closeServer(client: ClientSocket): Promise<void> {
  return new Promise((resolve) => {
    const server: http.Server | undefined = (client as any)._testServer;
    const sio: Server | undefined = (client as any)._testIO;
    client.disconnect();
    if (sio) sio.close();
    if (!server) return resolve();
    // Si quedara una conexión viva, `close()` no llama nunca al callback y la
    // prueba se cuelga. Se cortan las conexiones antes de cerrar.
    (server as any).closeAllConnections?.();
    server.close(() => resolve());
  });
}

/* Cierre de seguridad: repite lo que la prueba ya hizo, sin importar en qué
   punto se quedó. Es idempotente, así que no estorba a las que cierran bien. */
async function cerrarTodo(): Promise<void> {
  for (const cliente of clientesAbiertos) {
    try {
      cliente.removeAllListeners();
      cliente.disconnect();
      cliente.close();
    } catch {
      // ya estaba cerrado
    }
  }
  clientesAbiertos.length = 0;

  await Promise.all(
    servidoresAbiertos.map(
      ({ server, sio }) =>
        new Promise<void>((resolve) => {
          sio.close();
          (server as any).closeAllConnections?.();
          server.close(() => resolve());
          // Red de seguridad: si el cierre no llama al callback, no bloqueamos.
          const plazo = setTimeout(resolve, 1000);
          plazo.unref?.();
        }),
    ),
  );
  servidoresAbiertos.length = 0;
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  jest.clearAllMocks();
  (scoringEngine.getLeaderboard as jest.Mock).mockResolvedValue(mockLeaderboard);
  (arranqueService.obtenerSnapshot as jest.Mock).mockResolvedValue(null);
  (rateLimiter.throttleSocket as jest.Mock).mockReturnValue(true);
});

afterEach(async () => {
  await cerrarTodo();
});

describe('Socket.IO connection', () => {
  it('connects with valid token (authenticated)', async () => {
    const { client } = await createServerAndConnect();

    expect(client.connected).toBe(true);
    expect(client.id).toBeDefined();

    client.disconnect();
    await closeServer(client);
  });

  it('connects without token (anonymous/spectator)', async () => {
    const { client } = await createServerAndConnect(null);

    expect(client.connected).toBe(true);

    client.disconnect();
    await closeServer(client);
  });

  it('connects with invalid token (still connects as anonymous)', async () => {
    const { client } = await createServerAndConnect({});

    // Invalid token => verificarToken returns null => treated as anonymous
    expect(client.connected).toBe(true);

    client.disconnect();
    await closeServer(client);
  });
});

describe('join-competencia', () => {
  it('joins a room and receives leaderboard', async () => {
    const { client } = await createServerAndConnect();

    const received = new Promise<any>((res) => {
      client.once('leaderboard-update', (data) => res(data));
    });

    client.emit('join-competencia', 1);
    const data = await received;

    expect(data).toBeDefined();
    expect(data.competenciaId).toBe(1);
    expect(data.leaderboard).toBeDefined();
    expect(scoringEngine.getLeaderboard).toHaveBeenCalledWith(1);

    client.disconnect();
    await closeServer(client);
  });

  it('does not join room for invalid competenciaId (negative)', async () => {
    const { client } = await createServerAndConnect();

    const received = new Promise<any>((res) => {
      client.once('leaderboard-update', () => res('got'));
      setTimeout(() => res('timeout'), 300);
    });

    client.emit('join-competencia', -5);
    const result = await received;

    expect(result).toBe('timeout');
    expect(scoringEngine.getLeaderboard).not.toHaveBeenCalled();

    client.disconnect();
    await closeServer(client);
  });

  it('does not join room for non-integer competenciaId', async () => {
    const { client } = await createServerAndConnect();

    const received = new Promise<any>((res) => {
      client.once('leaderboard-update', () => res('got'));
      setTimeout(() => res('timeout'), 300);
    });

    client.emit('join-competencia', 1.5);
    const result = await received;

    expect(result).toBe('timeout');

    client.disconnect();
    await closeServer(client);
  });

  it('leaves previous room when joining a new competencia', async () => {
    const { client } = await createServerAndConnect();

    const updates: any[] = [];
    client.on('leaderboard-update', (d) => updates.push(d));

    // Join first competencia
    client.emit('join-competencia', 1);
    await esperarA(() => updates.length >= 1, 'la clasificación al entrar a la sala 1');

    // Join second competencia — should leave first room
    client.emit('join-competencia', 2);
    await esperarA(
      () => (scoringEngine.getLeaderboard as jest.Mock).mock.calls.some((c) => c[0] === 2),
      'la clasificación pedida para la competencia 2',
    );

    client.disconnect();
    await closeServer(client);
  });

  it('sends competencia:start if arranque snapshot exists', async () => {
    (arranqueService.obtenerSnapshot as jest.Mock).mockResolvedValue({
      competenciaId: 1,
      eventoId: 10,
      tipoArranque: 'directo',
      estado: 'corriendo',
      startTimeServer: Date.now() + 5000,
      serverNow: Date.now(),
      pausadoEnMs: null,
    });

    const { client } = await createServerAndConnect();

    const startPayload = new Promise<any>((res) => {
      client.once('competencia:start', (d) => res(d));
    });

    client.emit('join-competencia', 1);
    const payload = await startPayload;

    expect(payload).toBeDefined();
    expect(payload.competenciaId).toBe(1);
    expect(payload.tipoArranque).toBe('directo');

    client.disconnect();
    await closeServer(client);
  });
});

describe('leave-competencia', () => {
  it('leaves the room and stops receiving updates', async () => {
    const { client } = await createServerAndConnect();
    const sio = (client as any)._testIO as Server;

    const recibidas: any[] = [];
    client.on('leaderboard-update', (d) => recibidas.push(d));

    client.emit('join-competencia', 1);
    await esperarA(() => recibidas.length >= 1, 'la clasificación al entrar a la sala');

    client.emit('leave-competencia', 1);
    // Se espera al estado del servidor (la sala vacía), no a un reloj: así
    // la prueba no depende de que la máquina sea rápida.
    await esperarA(
      () => !sio.sockets.adapter.rooms.get('competencia-1')?.has(client.id as string),
      'que el cliente salga de la sala',
    );

    const antes = recibidas.length;
    // Puntaje distinto al ya difundido: `broadcastLeaderboard` no reenvía si la
    // firma no cambió, y aquí hace falta que el envío ocurra de verdad.
    (scoringEngine.getLeaderboard as jest.Mock).mockResolvedValue({
      ...mockLeaderboard,
      competencia: { id: 1, nombre: 'Comp leave' },
      leaderboard: [
        { participante_id: 10, nombre: 'Atleta 1', puntaje_total: 61, puesto: 1, puntos_total: 61 },
      ],
    });
    await broadcastLeaderboard(1);

    // Aserción negativa: solo se puede comprobar dejando pasar un rato. Si la
    // máquina va lenta, el fallo posible es que la prueba pase de más, nunca
    // que falle sin motivo.
    await pausa(300);
    expect(recibidas.length).toBe(antes);

    client.disconnect();
    await closeServer(client);
  });
});

describe('broadcastLeaderboard', () => {
  it('broadcasts leaderboard-update to room members', async () => {
    const { client } = await createServerAndConnect();

    const received = new Promise<any>((res) => {
      client.once('leaderboard-update', (d) => res(d));
    });

    client.emit('join-competencia', 1);
    await received; // wait for initial leaderboard

    // Now broadcast a second update
    const second = new Promise<any>((res) => {
      client.once('leaderboard-update', (d) => res(d));
    });

    await broadcastLeaderboard(1);
    const data = await second;

    expect(data).toBeDefined();
    expect(data.competenciaId).toBe(1);
    expect(data.leaderboard).toBeDefined();

    client.disconnect();
    await closeServer(client);
  });

  it('does not crash if ioRef is null (no server)', async () => {
    // broadcastLeaderboard with no server set up should be a no-op
    // We test the function in isolation — it should not throw
    await expect(broadcastLeaderboard(999)).resolves.toBeUndefined();
  });
});

describe('request-leaderboard (throttled)', () => {
  it('receives leaderboard on request-leaderboard event', async () => {
    const { client } = await createServerAndConnect();

    const received = new Promise<any>((res) => {
      client.once('leaderboard-update', (d) => res(d));
    });

    client.emit('join-competencia', 1);
    await received; // initial

    const second = new Promise<any>((res) => {
      client.once('leaderboard-update', (d) => res(d));
    });

    client.emit('request-leaderboard', 1);
    const data = await second;

    expect(data).toBeDefined();
    expect(data.competenciaId).toBe(1);

    client.disconnect();
    await closeServer(client);
  });

  it('ignores invalid competenciaId', async () => {
    (rateLimiter.throttleSocket as jest.Mock).mockReturnValue(true);

    const { client } = await createServerAndConnect();

    const received = new Promise<any>((res) => {
      client.once('leaderboard-update', () => res('got'));
      setTimeout(() => res('timeout'), 300);
    });

    client.emit('request-leaderboard', -1);
    const result = await received;

    expect(result).toBe('timeout');

    client.disconnect();
    await closeServer(client);
  });

  it('throttleSocket blocks excessive requests', async () => {
    const { client } = await createServerAndConnect();

    // Wait for initial leaderboard from join-competencia
    const initial = new Promise<any>((res) => {
      client.once('leaderboard-update', (d) => res(d));
    });
    client.emit('join-competencia', 1);
    await initial;

    // Now throttle the next request
    (rateLimiter.throttleSocket as jest.Mock).mockReturnValue(false);

    const received = new Promise<any>((res) => {
      client.once('leaderboard-update', () => res('got'));
      setTimeout(() => res('timeout'), 300);
    });

    client.emit('request-leaderboard', 1);
    const result = await received;

    expect(result).toBe('timeout');

    client.disconnect();
    await closeServer(client);
  });
});

describe('check-participant-lock', () => {
  it('returns locked: false when no lock exists', async () => {
    const { client } = await createServerAndConnect({ id: 5, rol: 'juez' });

    const result = await new Promise<any>((res) => {
      client.emit(
        'check-participant-lock',
        {
          participante_id: 10,
          wod_id: 1,
        },
        (data: any) => res(data),
      );
    });

    expect(result).toEqual({ locked: false, message: '' });

    client.disconnect();
    await closeServer(client);
  });

  it('returns locked: false for anonymous (no user)', async () => {
    const { client } = await createServerAndConnect(null);

    const result = await new Promise<any>((res) => {
      client.emit(
        'check-participant-lock',
        {
          participante_id: 10,
          wod_id: 1,
        },
        (data: any) => res(data),
      );
    });

    expect(result).toEqual({ locked: false, message: '' });

    client.disconnect();
    await closeServer(client);
  });

  it('returns locked: false for participant role', async () => {
    const { client } = await createServerAndConnect({ rol: 'participante' });

    const result = await new Promise<any>((res) => {
      client.emit(
        'check-participant-lock',
        {
          participante_id: 10,
          wod_id: 1,
        },
        (data: any) => res(data),
      );
    });

    expect(result).toEqual({ locked: false, message: '' });

    client.disconnect();
    await closeServer(client);
  });
});

describe('lock-participant / unlock-participant', () => {
  it('judge locks and then unlocks a participant', async () => {
    const { client } = await createServerAndConnect({ id: 5, rol: 'juez' });

    // El juez tiene asignacion en el WOD (gate de puedeBloquear).
    (Wod.findByPk as unknown as jest.Mock).mockResolvedValue({ id: 1, competencia_id: 1 });
    (Asignacion.findOne as unknown as jest.Mock).mockResolvedValue({ id: 1 });

    // Lock con ACK: confirma que el servidor ya lo registró. Antes se esperaba
    // 50 ms a ciegas y en el CI no siempre bastaban.
    const ackLock = await new Promise<any>((res) => {
      client.emit(
        'lock-participant',
        {
          participante_id: 10,
          wod_id: 1,
          judgeName: 'Juez Perez',
        },
        (data: any) => res(data),
      );
    });
    expect(ackLock).toEqual({ ok: true });

    // Check from another judge — should be locked
    const { client: client2 } = await createServerAndConnect({ id: 6, rol: 'juez' });

    const checkResult = await consultarBloqueo(client2, 10, 1);

    expect(checkResult.locked).toBe(true);
    expect(checkResult.message).toContain('Juez Perez');

    // Unlock
    client.emit('unlock-participant', {
      participante_id: 10,
      wod_id: 1,
    });

    // Check again — should be unlocked. Se espera a que el otro juez lo vea,
    // no a que pase un tiempo fijo.
    await esperarA(
      async () => (await consultarBloqueo(client2, 10, 1)).locked === false,
      'que el desbloqueo se vea desde el otro juez',
    );

    client.disconnect();
    client2.disconnect();
    await closeServer(client2);
    await closeServer(client);
  });

  it('judge without assignment cannot lock (cross-evento)', async () => {
    const { client } = await createServerAndConnect({ id: 7, rol: 'juez' });

    (Wod.findByPk as unknown as jest.Mock).mockResolvedValue({ id: 1, competencia_id: 1 });
    (Asignacion.findOne as unknown as jest.Mock).mockResolvedValue(null);

    const ack = await new Promise<any>((res) => {
      client.emit(
        'lock-participant',
        {
          participante_id: 11,
          wod_id: 1,
          judgeName: 'Juez Ajeno',
        },
        (data: any) => res(data),
      );
    });
    expect(ack).toEqual({ ok: false });

    const { client: client2 } = await createServerAndConnect({ id: 8, rol: 'juez' });
    const checkResult = await consultarBloqueo(client2, 11, 1);

    expect(checkResult.locked).toBe(false);

    client.disconnect();
    client2.disconnect();
    await closeServer(client2);
    await closeServer(client);
  });

  it('participant cannot lock', async () => {
    const { client } = await createServerAndConnect({ id: 10, rol: 'participante' });

    const ack = await new Promise<any>((res) => {
      client.emit(
        'lock-participant',
        {
          participante_id: 10,
          wod_id: 1,
          judgeName: 'Test',
        },
        (data: any) => res(data),
      );
    });
    expect(ack).toEqual({ ok: false });

    // A judge checks — should be unlocked (lock was ignored)
    const { client: client2 } = await createServerAndConnect({ id: 5, rol: 'juez' });

    const checkResult = await consultarBloqueo(client2, 10, 1);

    expect(checkResult.locked).toBe(false);

    client.disconnect();
    client2.disconnect();
    await closeServer(client2);
    await closeServer(client);
  });

  it('ignores invalid lock payload (negative ids)', async () => {
    const { client } = await createServerAndConnect({ id: 5, rol: 'juez' });

    const ack = await new Promise<any>((res) => {
      client.emit(
        'lock-participant',
        {
          participante_id: -1,
          wod_id: 1,
          judgeName: 'Test',
        },
        (data: any) => res(data),
      );
    });
    expect(ack).toEqual({ ok: false });

    // Check should still be unlocked
    const checkResult = await consultarBloqueo(client, 10, 1);

    expect(checkResult.locked).toBe(false);

    client.disconnect();
    await closeServer(client);
  });

  it('lock with ACK confirma el registro (ok:true)', async () => {
    const { client } = await createServerAndConnect({ id: 5, rol: 'juez' });

    (Wod.findByPk as unknown as jest.Mock).mockResolvedValue({ id: 1, competencia_id: 1 });
    (Asignacion.findOne as unknown as jest.Mock).mockResolvedValue({ id: 1 });

    const ack = await new Promise<any>((res) => {
      client.emit(
        'lock-participant',
        {
          participante_id: 20,
          wod_id: 1,
          judgeName: 'Juez ACK',
        },
        (data: any) => res(data),
      );
    });
    expect(ack).toEqual({ ok: true });

    client.disconnect();
    await closeServer(client);
  });

  it('lock with ACK denegado sin asignación (ok:false)', async () => {
    const { client } = await createServerAndConnect({ id: 7, rol: 'juez' });

    (Wod.findByPk as unknown as jest.Mock).mockResolvedValue({ id: 1, competencia_id: 1 });
    (Asignacion.findOne as unknown as jest.Mock).mockResolvedValue(null);

    const ack = await new Promise<any>((res) => {
      client.emit(
        'lock-participant',
        {
          participante_id: 21,
          wod_id: 1,
          judgeName: 'Juez Ajeno',
        },
        (data: any) => res(data),
      );
    });
    expect(ack).toEqual({ ok: false });

    client.disconnect();
    await closeServer(client);
  });

  it('re-lock tras reconnect con ACK (ventana de carrera cubierta)', async () => {
    const { client } = await createServerAndConnect({ id: 5, rol: 'juez' });

    (Wod.findByPk as unknown as jest.Mock).mockResolvedValue({ id: 1, competencia_id: 1 });
    (Asignacion.findOne as unknown as jest.Mock).mockResolvedValue({ id: 1 });

    const ack1 = await new Promise<any>((res) => {
      client.emit(
        'lock-participant',
        {
          participante_id: 22,
          wod_id: 1,
          judgeName: 'Juez Recon',
        },
        (data: any) => res(data),
      );
    });
    expect(ack1).toEqual({ ok: true });

    // Caída: el disconnect libera el bloqueo del juez. Se espera a verlo
    // liberado desde la reconexión, no a que pase un tiempo fijo.
    client.disconnect();
    const { client: recon } = await createServerAndConnect({ id: 5, rol: 'juez' });
    await esperarA(
      async () => (await consultarBloqueo(recon, 22, 1)).locked === false,
      'que el bloqueo se libere al caer el juez',
    );

    // Reconexión: el re-lock con ACK confirma que quedó registrado.
    const ack2 = await new Promise<any>((res) => {
      recon.emit(
        'lock-participant',
        {
          participante_id: 22,
          wod_id: 1,
          judgeName: 'Juez Recon',
        },
        (data: any) => res(data),
      );
    });
    expect(ack2).toEqual({ ok: true });

    recon.disconnect();
    await closeServer(recon);
    await closeServer(client);
  });

  it('cookie HttpOnly autentica igual que auth/query (frontend withCredentials)', async () => {
    const server = http.createServer();
    const sio = new Server(server, { cors: { origin: '*' } });
    setupSocketHandlers(sio);
    servidoresAbiertos.push({ server, sio });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    (Wod.findByPk as unknown as jest.Mock).mockResolvedValue({ id: 1, competencia_id: 1 });
    (Asignacion.findOne as unknown as jest.Mock).mockResolvedValue({ id: 1 });

    const soloCookie = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      extraHeaders: { cookie: `token=${makeToken({ id: 9, rol: 'juez' })}` },
    });
    clientesAbiertos.push(soloCookie);
    await new Promise<void>((resolve) => soloCookie.on('connect', () => resolve()));

    const ack = await new Promise<any>((res) => {
      soloCookie.emit(
        'lock-participant',
        {
          participante_id: 23,
          wod_id: 1,
          judgeName: 'Juez Cookie',
        },
        (data: any) => res(data),
      );
    });
    // ok:true prueba que la cookie autenticó (sin ella sería espectador → false).
    expect(ack).toEqual({ ok: true });

    soloCookie.disconnect();
    sio.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe('time:sync', () => {
  it('returns t1, t2, t3 in callback', async () => {
    const { client } = await createServerAndConnect();

    const result = await new Promise<any>((res) => {
      client.emit('time:sync', { t1: 1000 }, (data: any) => res(data));
    });

    expect(result).toBeDefined();
    expect(result.t1).toBe(1000);
    expect(typeof result.t2).toBe('number');
    expect(typeof result.t3).toBe('number');

    client.disconnect();
    await closeServer(client);
  });

  it('ignores invalid payload', async () => {
    const { client } = await createServerAndConnect();

    const result = await new Promise<any>((res) => {
      client.emit('time:sync', { t1: 'not-a-number' }, (data: any) => res(data));
      setTimeout(() => res('timeout'), 300);
    });

    // Should not get a callback response for invalid payload
    expect(result).toBe('timeout');

    client.disconnect();
    await closeServer(client);
  });

  it('ignores when no callback is provided', async () => {
    const { client } = await createServerAndConnect();

    // Should not throw
    client.emit('time:sync', { t1: 1000 });
    await pausa(100);

    expect(true).toBe(true);

    client.disconnect();
    await closeServer(client);
  });
});

describe('competencia:resync', () => {
  it('returns snapshot and emits competencia:start', async () => {
    const snapshot = {
      competenciaId: 1,
      eventoId: 10,
      tipoArranque: 'directo',
      estado: 'corriendo',
      startTimeServer: Date.now() + 5000,
      serverNow: Date.now(),
      pausadoEnMs: null,
    };
    (arranqueService.obtenerSnapshot as jest.Mock).mockResolvedValue(snapshot);

    const { client } = await createServerAndConnect();

    const startEvent = new Promise<any>((res) => {
      client.once('competencia:start', (d) => res(d));
    });

    const callbackResult = await new Promise<any>((res) => {
      client.emit('competencia:resync', { competenciaId: 1 }, (data: any) => res(data));
    });

    expect(callbackResult).toBeDefined();
    expect(callbackResult.competenciaId).toBe(1);

    const startPayload = await startEvent;
    expect(startPayload.competenciaId).toBe(1);

    client.disconnect();
    await closeServer(client);
  });

  it('ignores invalid competenciaId', async () => {
    const { client } = await createServerAndConnect();

    const result = await new Promise<any>((res) => {
      client.emit('competencia:resync', { competenciaId: -1 }, (data: any) => res(data));
      setTimeout(() => res('timeout'), 300);
    });

    expect(result).toBe('timeout');
    expect(arranqueService.obtenerSnapshot).not.toHaveBeenCalled();

    client.disconnect();
    await closeServer(client);
  });
});

describe('disconnect cleanup', () => {
  it('releases all locks held by the disconnecting judge', async () => {
    const { client } = await createServerAndConnect({ id: 5, rol: 'juez' });

    const ack = await new Promise<any>((res) => {
      client.emit(
        'lock-participant',
        {
          participante_id: 10,
          wod_id: 1,
          judgeName: 'Juez Cleanup',
        },
        (data: any) => res(data),
      );
    });
    expect(ack).toEqual({ ok: true });

    // Disconnect the judge
    client.disconnect();

    // Another judge should see the lock released (se espera a verlo, sin reloj)
    const { client: client2 } = await createServerAndConnect({ id: 6, rol: 'juez' });

    await esperarA(
      async () => (await consultarBloqueo(client2, 10, 1)).locked === false,
      'que el bloqueo se libere al desconectarse el juez',
    );

    client2.disconnect();
    await closeServer(client2);
  });

  it('anonymous disconnect does not throw', async () => {
    const { client } = await createServerAndConnect(null);

    expect(client.connected).toBe(true);
    client.disconnect();
    await esperarA(() => client.connected === false, 'que el cliente anónimo se desconecte');

    expect(client.connected).toBe(false);
  });
});

describe('room isolation', () => {
  it('two clients in different competencia rooms get separate updates', async () => {
    // Use a single shared server so ioRef is the same for both clients
    const sharedResult = await createServerAndConnect({ id: 1, rol: 'juez' });
    const c1 = sharedResult.client;
    const port = sharedResult.port;

    // Connect second client to the same server
    const c2 = ioClient(`http://localhost:${port}`, {
      auth: { token: makeToken({ id: 2, rol: 'juez' }) },
      transports: ['websocket'],
    });
    clientesAbiertos.push(c2);
    await new Promise<void>((res) => c2.on('connect', () => res()));

    const received1: any[] = [];
    const received2: any[] = [];

    c1.on('leaderboard-update', (d) => received1.push(d));
    c2.on('leaderboard-update', (d) => received2.push(d));

    const sio = (c1 as any)._testIO as Server;
    c1.emit('join-competencia', 1);
    c2.emit('join-competencia', 2);
    await esperarA(
      () =>
        sio.sockets.adapter.rooms.get('competencia-1')?.has(c1.id as string) === true &&
        sio.sockets.adapter.rooms.get('competencia-2')?.has(c2.id as string) === true,
      'que cada cliente esté en su sala',
    );

    const count1Before = received1.length;
    const count2Before = received2.length;

    // Broadcast to room 1 only. Datos distintos a los ya emitidos en este
    // archivo: broadcastLeaderboard omite el envío si la firma no cambió
    // (caché lastEmitted), así que se varía el puntaje para forzar el emit.
    (scoringEngine.getLeaderboard as jest.Mock).mockResolvedValue({
      ...mockLeaderboard,
      competencia: { id: 1, nombre: 'Comp 1' },
      leaderboard: [
        { participante_id: 10, nombre: 'Atleta 1', puntaje_total: 95, puesto: 1, puntos_total: 95 },
      ],
    });
    await broadcastLeaderboard(1);
    await esperarA(
      () => received1.length === count1Before + 1,
      'que el cliente de la sala 1 reciba la difusión',
    );
    await pausa(200);

    // c1 should have received an additional update, c2 should not
    expect(received1.length).toBe(count1Before + 1);
    expect(received2.length).toBe(count2Before);

    c1.disconnect();
    c2.disconnect();
    await closeServer(c1);
    await closeServer(c2);
  });
});

describe('reconnect', () => {
  it('reconnects and rejoins room after disconnect', async () => {
    const { client } = await createServerAndConnect({ id: 5, rol: 'juez' });

    const primera = new Promise<any>((res) => {
      client.once('leaderboard-update', (d) => res(d));
    });
    client.emit('join-competencia', 1);
    const datos1 = await primera;
    expect(datos1.competenciaId).toBe(1);

    // Caída: el cliente se desconecta (la sala muere con la conexión).
    client.disconnect();
    await esperarA(() => client.connected === false, 'que el cliente se desconecte');
    expect(client.connected).toBe(false);

    // Reconexión con el MISMO socket: debe poder entrar de nuevo a la sala
    // y recibir la clasificación sin ayuda del servidor.
    const reconectado = new Promise<void>((res) => client.once('connect', () => res()));
    client.connect();
    await reconectado;

    const segunda = new Promise<any>((res) => {
      client.once('leaderboard-update', (d) => res(d));
    });
    client.emit('join-competencia', 1);
    const datos2 = await segunda;
    expect(datos2.competenciaId).toBe(1);

    client.disconnect();
    await closeServer(client);
  });
});

describe('leaderboard failure', () => {
  it('handles leaderboard calculation failure gracefully', async () => {
    (scoringEngine.getLeaderboard as jest.Mock).mockRejectedValueOnce(new Error('DB caída'));

    const { client } = await createServerAndConnect({ id: 5, rol: 'juez' });

    // El join no crashea el socket: responde error y sigue operativo.
    const fallo = new Promise<any>((res) => {
      client.once('leaderboard-error', (d) => res(d));
    });
    client.emit('join-competencia', 1);
    const datos = await fallo;
    expect(datos.competenciaId).toBe(1);
    expect(datos.message).toBeDefined();

    // El socket sigue vivo: otro evento responde con normalidad.
    const check = new Promise<any>((res) => {
      client.emit('check-participant-lock', { participante_id: 10, wod_id: 1 }, (respuesta: any) =>
        res(respuesta),
      );
    });
    expect(await check).toEqual({ locked: false, message: '' });

    client.disconnect();
    await closeServer(client);
  });
});
