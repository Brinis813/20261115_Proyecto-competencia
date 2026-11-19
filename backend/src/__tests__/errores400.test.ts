import request from 'supertest';
import fs from 'fs';

/* ------------------------------------------------------------------ */
/* Mocks — deben ir ANTES de cualquier import del código fuente         */
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
  UPLOADS_DIR: '/tmp/test-uploads-400',
}));

jest.mock('../config/database', () => {
  const fakeDefine = jest.fn().mockReturnValue(function FakeModel() {});
  return {
    sequelize: {
      authenticate: jest.fn(),
      close: jest.fn(),
      define: fakeDefine,
      model: jest.fn(),
      models: {},
      getQueryInterface: jest.fn().mockReturnValue({
        createTable: jest.fn(),
        addIndex: jest.fn(),
      }),
      dialect: 'mysql',
    },
  };
});

jest.mock('sequelize', () => {
  class MockModel {
    static init(_attrs: any, _opts: any) {
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
    static findAndCountAll() {
      return { rows: [], count: 0 };
    }
    static count() {
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
    static addScope() {
      return this as any;
    }
    static scope() {
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
    Op: { in: Symbol('Op.in'), or: Symbol('Op.or'), ne: Symbol('Op.ne') },
    Sequelize: jest.fn(),
  };
});

jest.mock('../models', () => ({
  __esModule: true,
  Resultado: { findOne: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  Wod: { findByPk: jest.fn() },
  Participante: { findByPk: jest.fn() },
  Asignacion: { findOne: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  Competencia: { findByPk: jest.fn() },
  EventoUsuario: { findAll: jest.fn().mockResolvedValue([]) },
  Arranque: { findOne: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../utils/logger', () => ({
  log: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../utils/monitoring', () => ({
  initMonitoring: jest.fn(),
  requestContext: (_req: any, _res: any, next: any) => next(),
  socketHealth: () => ({ stale: false }),
  contextoDeRequest: jest.fn().mockReturnValue({}),
  reportError: jest.fn(),
}));

// Rate limiter real para probar el 429; las factorías de ruta en passthrough.
jest.mock('../middleware/rateLimiter', () => {
  const actual = jest.requireActual('../middleware/rateLimiter');
  const pass = () => (_req: any, _res: any, next: any) => next();
  return {
    ...actual,
    authRateLimiter: pass,
    adminWriteRateLimiter: pass,
    judgeSaveRateLimiter: pass,
    publicLeaderboardRateLimiter: pass,
    rateLimitByRole: () => (_req: any, _res: any, next: any) => next(),
    strictRateLimiter: pass,
  };
});

jest.mock('../middleware/evento', () => ({
  resolverEvento: (req: any, _res: any, next: any) => {
    req.alcance = { activa: 1, permitidas: null };
    next();
  },
  eventoDestino: () => 1,
  filtroEvento: () => ({}),
}));

jest.mock('../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token || token === 'invalid') {
      res.status(401).json({ message: 'No autenticado' });
      return;
    }
    if (token.startsWith('valid-admin-')) {
      req.user = { id: 1, cedula: '12345', rol: 'admin', tipo: 'usuario' };
    } else if (token.startsWith('valid-juez-')) {
      req.user = { id: 2, cedula: '67890', rol: 'juez', tipo: 'usuario' };
    } else {
      res.status(401).json({ message: 'Sesion expirada o token invalido' });
      return;
    }
    next();
  },
  adminOnly: (req: any, res: any, next: any) => {
    if (!req.user || req.user.rol !== 'admin') {
      res.status(403).json({ message: 'No tienes permisos para esta accion' });
      return;
    }
    next();
  },
  staffOnly: (req: any, res: any, next: any) => {
    if (!req.user || (req.user.rol !== 'admin' && req.user.rol !== 'juez')) {
      res.status(403).json({ message: 'No tienes permisos para esta accion' });
      return;
    }
    next();
  },
}));

jest.mock('../services/resultService', () => ({ saveResult: jest.fn() }));
jest.mock('../services/competenciaService', () => ({
  createCompetencia: jest.fn(),
  actualizarImagenCompetencia: jest
    .fn()
    .mockImplementation(async (id: number, url: string | null) => ({ id, imagen_url: url })),
}));
jest.mock('../services/arranqueService', () => ({
  estadoArranque: jest.fn(),
  armarCompetencia: jest.fn(),
  pausarArranque: jest.fn(),
  reanudarArranque: jest.fn(),
  finalizarArranque: jest.fn(),
  cancelarArranque: jest.fn(),
}));

/* ------------------------------------------------------------------ */
/* Imports después de los mocks                                        */
/* ------------------------------------------------------------------ */

import express from 'express';
import cookieParser from 'cookie-parser';
import resultRoutes from '../routes/results';
import competenciaRoutes from '../routes/competencias';
import { notFoundHandler, errorHandler } from '../middleware/errorHandler';
import { rateLimiter, throttleSocket } from '../middleware/rateLimiter';
import { mensajeSeguro } from '../controllers/helpers';
import { borrarArchivoSubido, esImagenValida } from '../utils/archivos';
import { Resultado, Wod, Participante, Asignacion, Competencia, Arranque } from '../models';

const JUEZ = 'valid-juez-token';
const ADMIN = 'valid-admin-token';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/results', resultRoutes);
  app.use('/competencias', competenciaRoutes);
  // Ruta mínima con limiter real para probar el 429.
  app.get('/limitada', rateLimiter(2, 60 * 1000, 'test-errores400'), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const _BER = (nombre: string) => (Resultado as any)[nombre] as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (Arranque as any).findOne.mockResolvedValue(null);
  (Competencia as any).findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
});

afterAll(() => {
  fs.rmSync('/tmp/test-uploads-400', { recursive: true, force: true });
});

describe('familia 400: validación de cuerpo', () => {
  it('POST /results con tipos inválidos → 400 con message + errors', async () => {
    const res = await request(buildApp())
      .post('/results')
      .set('Authorization', `Bearer ${JUEZ}`)
      .send({ participante_id: 'no-numero', wod_id: 1, valor_bruto: '' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos invalidos');
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.participante_id).toBeDefined();
  });

  it('POST /results sin campos → 400 (no cuela al controlador)', async () => {
    const res = await request(buildApp())
      .post('/results')
      .set('Authorization', `Bearer ${JUEZ}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.valor_bruto).toBeDefined();
  });

  it('POST /results/check inválido → 400', async () => {
    const res = await request(buildApp())
      .post('/results/check')
      .set('Authorization', `Bearer ${JUEZ}`)
      .send({ participante_id: -3, wod_id: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos invalidos');
  });

  it('detalle con más de 50 claves → 400 (cota anti-DoS)', async () => {
    const detalle: Record<string, number> = {};
    for (let i = 0; i < 51; i++) detalle[`k${i}`] = i;
    const res = await request(buildApp())
      .post('/results')
      .set('Authorization', `Bearer ${JUEZ}`)
      .send({ participante_id: 1, wod_id: 1, valor_bruto: '10', detalle });
    expect(res.status).toBe(400);
  });
});

describe('familia 400: params y cuerpo malformado', () => {
  it('GET /results/abc/splits → 400 (id no numérico)', async () => {
    const res = await request(buildApp())
      .get('/results/abc/splits')
      .set('Authorization', `Bearer ${JUEZ}`);
    expect(res.status).toBe(400);
  });

  it('JSON roto → 400, nunca 500', async () => {
    const res = await request(buildApp())
      .post('/results')
      .set('Authorization', `Bearer ${JUEZ}`)
      .set('Content-Type', 'application/json')
      .send('{"participante_id": ');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('El cuerpo de la peticion no es JSON valido');
  });

  it('ruta inexistente → 404 JSON (no HTML de Express)', async () => {
    const res = await request(buildApp()).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/no encontrado/i);
  });
});

describe('409: conflictos de estado, no 400', () => {
  function mocksResultadoExistente() {
    (Wod as any).findByPk.mockResolvedValue({ id: 1, competencia_id: 1 });
    (Participante as any).findByPk.mockResolvedValue({ id: 10 });
    (Resultado as any).findOne.mockResolvedValue({ id: 9 });
    (Asignacion as any).findOne.mockResolvedValue({ id: 3 });
  }

  it('resultado duplicado → 409 (no 400)', async () => {
    mocksResultadoExistente();
    const res = await request(buildApp())
      .post('/results')
      .set('Authorization', `Bearer ${JUEZ}`)
      .send({ participante_id: 10, wod_id: 1, valor_bruto: '120' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/ya tiene/i);
  });

  it('heat en pausa → 409 (reintentable, no validación)', async () => {
    (Wod as any).findByPk.mockResolvedValue({ id: 1, competencia_id: 1 });
    (Participante as any).findByPk.mockResolvedValue({ id: 10 });
    (Resultado as any).findOne.mockResolvedValue(null);
    (Asignacion as any).findOne.mockResolvedValue({ id: 3 });
    (Arranque as any).findOne.mockResolvedValue({ estado: 'pausado' });
    const res = await request(buildApp())
      .post('/results')
      .set('Authorization', `Bearer ${JUEZ}`)
      .send({ participante_id: 10, wod_id: 1, valor_bruto: '120' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/pausa/i);
  });
});

describe('400: uploads', () => {
  it('PUT /competencias/1/imagen con .exe → 400', async () => {
    const res = await request(buildApp())
      .put('/competencias/1/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .attach('imagen', Buffer.from('<html>nope</html>'), {
        filename: 'x.exe',
        contentType: 'application/octet-stream',
      });
    expect(res.status).toBe(400);
  });

  it('PUT /competencias/1/imagen de 6 MB → 400 por tamaño', async () => {
    const res = await request(buildApp())
      .put('/competencias/1/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .attach('imagen', Buffer.alloc(6 * 1024 * 1024, 1), {
        filename: 'grande.jpg',
        contentType: 'image/jpeg',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/tamaño/i);
  });

  it('PUT /competencias/abc/imagen → 400 por id inválido', async () => {
    const res = await request(buildApp())
      .put('/competencias/abc/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .attach('imagen', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'a.jpg',
        contentType: 'image/jpeg',
      });
    expect(res.status).toBe(400);
  });

  it('PUT /competencias/1/imagen válida → 200 y devuelve la URL', async () => {
    const res = await request(buildApp())
      .put('/competencias/1/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .attach('imagen', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'ok.jpg',
        contentType: 'image/jpeg',
      });
    expect(res.status).toBe(200);
    expect(res.body.imagen_url).toMatch(/^\/api\/uploads\/competencias\//);
  });

  it('HTML con mimetype JPG (spoof) → 400 y no persiste', async () => {
    const res = await request(buildApp())
      .put('/competencias/1/imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .attach('imagen', Buffer.from('<html><script>alert(1)</script></html>'), {
        filename: 'spoof.jpg',
        contentType: 'image/jpeg',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no es una imagen/i);
  });

  it('POST /competencias/wod-imagen con tipo inválido → 400', async () => {
    const res = await request(buildApp())
      .post('/competencias/wod-imagen')
      .set('Authorization', `Bearer ${ADMIN}`)
      .attach('imagen', Buffer.from('x'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });
});

describe('429 y throttles (unidades reales)', () => {
  it('rateLimiter(2): tercera petición → 429 con Retry-After', async () => {
    const app = buildApp();
    await request(app).get('/limitada').expect(200);
    await request(app).get('/limitada').expect(200);
    const res = await request(app).get('/limitada');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.body.message).toMatch(/demasiadas peticiones/i);
  });

  it('throttleSocket: a la 31ª llamada seguida → false', () => {
    const id = `test-sock-${Date.now()}`;
    for (let i = 0; i < 30; i++) expect(throttleSocket(id, 'request-leaderboard')).toBe(true);
    expect(throttleSocket(id, 'request-leaderboard')).toBe(false);
  });
});

describe('archivos: magic bytes y borrado seguro', () => {
  const tmp = '/tmp/test-uploads-400/magic';

  beforeEach(() => {
    fs.mkdirSync(tmp, { recursive: true });
  });

  it('acepta JPG/PNG/WebP reales por contenido', async () => {
    const casos: Array<[string, number[]]> = [
      ['a.jpg', [0xff, 0xd8, 0xff, 0xd9]],
      ['a.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
      ['a.webp', [...Buffer.from('RIFF....WEBP', 'ascii')]],
    ];
    for (const [nombre, bytes] of casos) {
      const ruta = `${tmp}/${nombre}`;
      fs.writeFileSync(ruta, Buffer.from(bytes));
      await expect(esImagenValida(ruta)).resolves.toBe(true);
    }
  });

  it('rechaza HTML/SVG con mimetype falso', async () => {
    const ruta = `${tmp}/spoof.jpg`;
    fs.writeFileSync(ruta, '<html><script>alert(1)</script></html>');
    await expect(esImagenValida(ruta)).resolves.toBe(false);
  });

  it('borrarArchivoSubido nunca sale de uploads (path traversal)', () => {
    const centinela = '/tmp/centinela-borrado.txt';
    fs.writeFileSync(centinela, 'no borrar');
    borrarArchivoSubido('/api/uploads/../../centinela-borrado.txt', '/api/uploads/');
    expect(fs.existsSync(centinela)).toBe(true);
    fs.unlinkSync(centinela);
  });

  it('borrarArchivoSubido ignora prefijos ajenos', () => {
    expect(() => borrarArchivoSubido('/etc/passwd', '/api/uploads/')).not.toThrow();
  });
});

describe('mensajeSeguro: sin fugas en 400/500', () => {
  it('oculta SQL/Sequelize tras mensaje genérico', () => {
    expect(mensajeSeguro(new Error('ER_DUP_ENTRY: Duplicate entry'))).toBe(
      'No se pudo completar la operacion',
    );
    expect(mensajeSeguro(new Error('select * from usuarios'))).toBe(
      'No se pudo completar la operacion',
    );
  });

  it('deja pasar mensajes de negocio normales', () => {
    expect(mensajeSeguro(new Error('El participante no existe'))).toBe('El participante no existe');
  });
});
