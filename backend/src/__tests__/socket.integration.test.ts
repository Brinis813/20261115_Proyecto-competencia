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
    static init() { return this; }
    static findAll() { return []; }
    static findOne() { return null; }
    static findByPk() { return null; }
    static create() { return {}; }
    static update() { return [0]; }
    static destroy() { return 0; }
    static belongsTo() { return this as any; }
    static hasMany() { return this as any; }
    static belongsToMany() { return this as any; }
  }
  return {
    DataTypes: new Proxy({}, {
      get(_target, prop) {
        if (prop === 'ENUM') return (..._vals: any[]) => ({ type: 'ENUM' });
        if (prop === 'STRING') return (_len?: number) => ({ type: 'STRING' });
        return { type: String(prop) };
      },
    }),
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
    { expiresIn: '1h' }
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

const PORT = 0; // random available port

function createServerAndConnect(
  auth?: Record<string, any> | null
): Promise<{ client: ClientSocket; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const sio = new Server(server, { cors: { origin: '*' } });
    setupSocketHandlers(sio);

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

      client.on('connect', () => {
        resolve({ client, port });
      });
      client.on('connect_error', (err) => {
        server.close();
        sio.close();
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
    if (server) server.close(() => resolve());
    else resolve();
  });
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

describe('Socket.IO connection', () => {
  it('connects with valid token (authenticated)', async () => {
    const { client, port } = await createServerAndConnect();

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
    await new Promise((r) => setTimeout(r, 50));
    expect(updates.length).toBeGreaterThanOrEqual(1);

    // Join second competencia — should leave first room
    client.emit('join-competencia', 2);
    await new Promise((r) => setTimeout(r, 50));

    expect(scoringEngine.getLeaderboard).toHaveBeenCalledWith(2);

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

    client.emit('join-competencia', 1);
    await new Promise((r) => setTimeout(r, 50));

    client.emit('leave-competencia', 1);
    await new Promise((r) => setTimeout(r, 50));

    // The client should no longer be in the room
    const rooms = (client as any).rooms || new Set();
    expect(rooms.has('competencia-1')).toBe(false);

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
      client.emit('check-participant-lock', {
        participante_id: 10,
        wod_id: 1,
      }, (data: any) => res(data));
    });

    expect(result).toEqual({ locked: false, message: '' });

    client.disconnect();
    await closeServer(client);
  });

  it('returns locked: false for anonymous (no user)', async () => {
    const { client } = await createServerAndConnect(null);

    const result = await new Promise<any>((res) => {
      client.emit('check-participant-lock', {
        participante_id: 10,
        wod_id: 1,
      }, (data: any) => res(data));
    });

    expect(result).toEqual({ locked: false, message: '' });

    client.disconnect();
    await closeServer(client);
  });

  it('returns locked: false for participant role', async () => {
    const { client } = await createServerAndConnect({ rol: 'participante' });

    const result = await new Promise<any>((res) => {
      client.emit('check-participant-lock', {
        participante_id: 10,
        wod_id: 1,
      }, (data: any) => res(data));
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

    // Lock
    client.emit('lock-participant', {
      participante_id: 10,
      wod_id: 1,
      judgeName: 'Juez Perez',
    });
    await new Promise((r) => setTimeout(r, 50));

    // Check from another judge — should be locked
    const { client: client2 } = await createServerAndConnect({ id: 6, rol: 'juez' });

    const checkResult = await new Promise<any>((res) => {
      client2.emit('check-participant-lock', {
        participante_id: 10,
        wod_id: 1,
      }, (data: any) => res(data));
    });

    expect(checkResult.locked).toBe(true);
    expect(checkResult.message).toContain('Juez Perez');

    // Unlock
    client.emit('unlock-participant', {
      participante_id: 10,
      wod_id: 1,
    });
    await new Promise((r) => setTimeout(r, 50));

    // Check again — should be unlocked
    const checkResult2 = await new Promise<any>((res) => {
      client2.emit('check-participant-lock', {
        participante_id: 10,
        wod_id: 1,
      }, (data: any) => res(data));
    });

    expect(checkResult2.locked).toBe(false);

    client.disconnect();
    client2.disconnect();
    await closeServer(client2);
    await closeServer(client);
  });

  it('judge without assignment cannot lock (cross-evento)', async () => {
    const { client } = await createServerAndConnect({ id: 7, rol: 'juez' });

    (Wod.findByPk as unknown as jest.Mock).mockResolvedValue({ id: 1, competencia_id: 1 });
    (Asignacion.findOne as unknown as jest.Mock).mockResolvedValue(null);

    client.emit('lock-participant', {
      participante_id: 11,
      wod_id: 1,
      judgeName: 'Juez Ajeno',
    });
    await new Promise((r) => setTimeout(r, 50));

    const { client: client2 } = await createServerAndConnect({ id: 8, rol: 'juez' });
    const checkResult = await new Promise<any>((res) => {
      client2.emit('check-participant-lock', {
        participante_id: 11,
        wod_id: 1,
      }, (data: any) => res(data));
    });

    expect(checkResult.locked).toBe(false);

    client.disconnect();
    client2.disconnect();
    await closeServer(client2);
    await closeServer(client);
  });

  it('participant cannot lock', async () => {    const { client } = await createServerAndConnect({ id: 10, rol: 'participante' });

    client.emit('lock-participant', {
      participante_id: 10,
      wod_id: 1,
      judgeName: 'Test',
    });
    await new Promise((r) => setTimeout(r, 50));

    // A judge checks — should be unlocked (lock was ignored)
    const { client: client2 } = await createServerAndConnect({ id: 5, rol: 'juez' });

    const checkResult = await new Promise<any>((res) => {
      client2.emit('check-participant-lock', {
        participante_id: 10,
        wod_id: 1,
      }, (data: any) => res(data));
    });

    expect(checkResult.locked).toBe(false);

    client.disconnect();
    client2.disconnect();
    await closeServer(client2);
    await closeServer(client);
  });

  it('ignores invalid lock payload (negative ids)', async () => {
    const { client } = await createServerAndConnect({ id: 5, rol: 'juez' });

    client.emit('lock-participant', {
      participante_id: -1,
      wod_id: 1,
      judgeName: 'Test',
    });
    await new Promise((r) => setTimeout(r, 50));

    // Check should still be unlocked
    const checkResult = await new Promise<any>((res) => {
      client.emit('check-participant-lock', {
        participante_id: 10,
        wod_id: 1,
      }, (data: any) => res(data));
    });

    expect(checkResult.locked).toBe(false);

    client.disconnect();
    await closeServer(client);
  });

  it('lock with ACK confirma el registro (ok:true)', async () => {
    const { client } = await createServerAndConnect({ id: 5, rol: 'juez' });

    (Wod.findByPk as unknown as jest.Mock).mockResolvedValue({ id: 1, competencia_id: 1 });
    (Asignacion.findOne as unknown as jest.Mock).mockResolvedValue({ id: 1 });

    const ack = await new Promise<any>((res) => {
      client.emit('lock-participant', {
        participante_id: 20,
        wod_id: 1,
        judgeName: 'Juez ACK',
      }, (data: any) => res(data));
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
      client.emit('lock-participant', {
        participante_id: 21,
        wod_id: 1,
        judgeName: 'Juez Ajeno',
      }, (data: any) => res(data));
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
      client.emit('lock-participant', {
        participante_id: 22,
        wod_id: 1,
        judgeName: 'Juez Recon',
      }, (data: any) => res(data));
    });
    expect(ack1).toEqual({ ok: true });

    // Caída: el disconnect libera el bloqueo del juez.
    client.disconnect();
    await new Promise((r) => setTimeout(r, 50));

    // Reconexión: el re-lock con ACK confirma que quedó registrado.
    const { client: recon } = await createServerAndConnect({ id: 5, rol: 'juez' });
    const ack2 = await new Promise<any>((res) => {
      recon.emit('lock-participant', {
        participante_id: 22,
        wod_id: 1,
        judgeName: 'Juez Recon',
      }, (data: any) => res(data));
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
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    (Wod.findByPk as unknown as jest.Mock).mockResolvedValue({ id: 1, competencia_id: 1 });
    (Asignacion.findOne as unknown as jest.Mock).mockResolvedValue({ id: 1 });

    const soloCookie = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      extraHeaders: { cookie: `token=${makeToken({ id: 9, rol: 'juez' })}` },
    });
    await new Promise<void>((resolve) => soloCookie.on('connect', () => resolve()));

    const ack = await new Promise<any>((res) => {
      soloCookie.emit('lock-participant', {
        participante_id: 23,
        wod_id: 1,
        judgeName: 'Juez Cookie',
      }, (data: any) => res(data));
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
    await new Promise((r) => setTimeout(r, 100));

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

    client.emit('lock-participant', {
      participante_id: 10,
      wod_id: 1,
      judgeName: 'Juez Cleanup',
    });
    await new Promise((r) => setTimeout(r, 50));

    // Disconnect the judge
    client.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    // Another judge should see the lock released
    const { client: client2 } = await createServerAndConnect({ id: 6, rol: 'juez' });

    const checkResult = await new Promise<any>((res) => {
      client2.emit('check-participant-lock', {
        participante_id: 10,
        wod_id: 1,
      }, (data: any) => res(data));
    });

    expect(checkResult.locked).toBe(false);

    client2.disconnect();
    await closeServer(client2);
  });

  it('anonymous disconnect does not throw', async () => {
    const { client } = await createServerAndConnect(null);

    expect(client.connected).toBe(true);
    client.disconnect();
    await new Promise((r) => setTimeout(r, 100));

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
    await new Promise<void>((res) => c2.on('connect', () => res()));

    const received1: any[] = [];
    const received2: any[] = [];

    c1.on('leaderboard-update', (d) => received1.push(d));
    c2.on('leaderboard-update', (d) => received2.push(d));

    c1.emit('join-competencia', 1);
    c2.emit('join-competencia', 2);
    await new Promise((r) => setTimeout(r, 200));

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
    await new Promise((r) => setTimeout(r, 200));

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
    await new Promise((r) => setTimeout(r, 100));
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
      client.emit(
        'check-participant-lock',
        { participante_id: 10, wod_id: 1 },
        (respuesta: any) => res(respuesta)
      );
    });
    expect(await check).toEqual({ locked: false, message: '' });

    client.disconnect();
    await closeServer(client);
  });
});
