import request from 'supertest';

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
  // Lo usa routes/eventos.ts para la carpeta de portadas (mkdirSync en carga).
  UPLOADS_DIR: '/tmp/test-uploads',
}));

// Mock sequelize instance that's importable from '../config/database'.
// Models call Model.init({…}, { sequelize }) which invokes this.define().
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

// Mock the Sequelize library itself so Model.init(), .belongsTo(), etc. are safe.
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
          if (prop === 'ENUM') {
            return (..._vals: any[]) => ({ type: 'ENUM' });
          }
          if (prop === 'STRING') {
            return (_len?: number) => ({ type: 'STRING' });
          }
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
      ne: Symbol('Op.ne'),
      gte: Symbol('Op.gte'),
      lte: Symbol('Op.lte'),
      like: Symbol('Op.like'),
      notIn: Symbol('Op.notIn'),
    },
    Sequelize: jest.fn().mockImplementation(() => ({
      authenticate: jest.fn(),
      close: jest.fn(),
      define: jest.fn(),
      model: jest.fn(),
      models: {},
    })),
  };
});

jest.mock('../models', () => ({}));

jest.mock('../utils/monitoring', () => ({
  initMonitoring: jest.fn(),
  requestContext: (_req: any, _res: any, next: any) => next(),
  socketHealth: () => ({ stale: false }),
}));

jest.mock('../sockets/handlers', () => ({
  setupSocketHandlers: jest.fn(),
  broadcastLeaderboard: jest.fn(),
  broadcastCompetenciaStart: jest.fn(),
}));

jest.mock('../middleware/rateLimiter', () => ({
  rateLimiter: () => (_req: any, _res: any, next: any) => next(),
  strictRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  rateLimitByRole: () => (_req: any, _res: any, next: any) => next(),
  // Las rutas usan estos limitadores granulares: sin ellos el mock deja
  // `undefined` y la carga del router falla (`is not a function`).
  authRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  adminWriteRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  judgeSaveRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  publicLeaderboardRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../middleware/evento', () => ({
  resolverEvento: (req: any, _res: any, next: any) => {
    req.alcance = { activa: 1, permitidas: null };
    next();
  },
  eventoDestino: () => 1,
  filtroEvento: () => ({}),
}));

jest.mock('../middleware/superadmin', () => ({
  superadminOnly: (_req: any, _res: any, next: any) => next(),
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
    } else if (token.startsWith('valid-part-')) {
      req.user = { id: 10, cedula: '11111', rol: 'participante', tipo: 'participante' };
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
  requireRoles:
    (...roles: string[]) =>
    (req: any, res: any, next: any) => {
      if (!req.user || !roles.includes(req.user.rol)) {
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
  optionalAuth: (req: any, _res: any, next: any) => {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (token?.startsWith('valid-admin-')) {
      req.user = { id: 1, cedula: '12345', rol: 'admin', tipo: 'usuario' };
    }
    next();
  },
}));

jest.mock('../services/authService', () => ({
  loginUsuario: jest.fn(),
  registrarUsuario: jest.fn(),
  verificarCorreo: jest.fn(),
  reenviarVerificacion: jest.fn(),
  loginParticipante: jest.fn(),
  getPerfil: jest.fn(),
  refreshToken: jest.fn(),
  changePassword: jest.fn(),
  solicitarResetPassword: jest.fn(),
  restablecerPassword: jest.fn(),
}));

jest.mock('../services/userService', () => ({
  createJuez: jest.fn(),
  createParticipante: jest.fn(),
  getAllAdmins: jest.fn(),
  createAdmin: jest.fn(),
  getAllJueces: jest.fn(),
  getAllParticipantes: jest.fn(),
  updateUsuario: jest.fn(),
  updateParticipante: jest.fn(),
  deleteUsuario: jest.fn(),
  deleteParticipante: jest.fn(),
  parseCSV: jest.fn(),
  bulkCreate: jest.fn(),
}));

jest.mock('../services/competenciaService', () => ({
  createCompetencia: jest.fn(),
  getAllCompetencias: jest.fn(),
  getPublicCompetencias: jest.fn(),
  getCompetenciaById: jest.fn(),
  updateCompetencia: jest.fn(),
  deleteCompetencia: jest.fn(),
  assignCompetencia: jest.fn(),
  removeAssignment: jest.fn(),
  getCompetenciaAssignments: jest.fn(),
  getCompetenciasByJudge: jest.fn(),
}));

jest.mock('../services/arranqueService', () => ({
  estadoArranque: jest.fn(),
  armarCompetencia: jest.fn(),
  pausarArranque: jest.fn(),
  reanudarArranque: jest.fn(),
  finalizarArranque: jest.fn(),
  cancelarArranque: jest.fn(),
}));

jest.mock('../services/eventoService', () => ({
  crearEventoDeEjemplo: jest.fn(),
  listarEventosPublicos: jest.fn(),
}));

jest.mock('../services/boxService', () => ({
  boxParaAlta: jest.fn(),
}));

jest.mock('../services/mailService', () => ({
  correoDeVerificacion: jest.fn(),
  correoDeRecuperacion: jest.fn(),
  enviarCorreo: jest.fn(),
}));

jest.mock('../services/resultService', () => ({
  saveResult: jest.fn(),
  saveSplits: jest.fn(),
}));

jest.mock('../services/heatService', () => ({
  generarHeats: jest.fn(),
}));

jest.mock('../services/scoring/leaderboard', () => ({
  getLeaderboard: jest.fn(),
}));

jest.mock('../models/Wod', () => ({
  Wod: { findByPk: jest.fn() },
}));

jest.mock('../models', () => {
  const mockFindByPk = jest.fn();
  return {
    __esModule: true,
    Resultado: { findOne: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    Wod: { findByPk: mockFindByPk },
    Participante: { findByPk: jest.fn() },
    Asignacion: { findOne: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    // Lo exigen los chequeos BOLA/IDOR de los controladores (alcance por evento).
    Competencia: { findByPk: jest.fn() },
    // Pausa global del admin: saveResult rechaza si el heat está pausado/finalizado.
    Arranque: { findOne: jest.fn().mockResolvedValue(null) },
  };
});

/* ------------------------------------------------------------------ */
/* Imports después de los mocks                                        */
/* ------------------------------------------------------------------ */

import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from '../routes/auth';
import userRoutes from '../routes/users';
import competenciaRoutes from '../routes/competencias';
import eventoRoutes from '../routes/eventos';
import resultRoutes from '../routes/results';
import leaderboardRoutes from '../routes/leaderboard';
import heatRoutes from '../routes/heats';

import * as authService from '../services/authService';
import * as userService from '../services/userService';
import * as competenciaService from '../services/competenciaService';
import * as eventoService from '../services/eventoService';
import * as resultService from '../services/resultService';
import * as heatService from '../services/heatService';
import * as leaderboardScoring from '../services/scoring/leaderboard';

/* ------------------------------------------------------------------ */
/* App Express de prueba                                               */
/* ------------------------------------------------------------------ */

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Health endpoint (inline in index.ts, replicated here for testing)
  app.get('/api/health', async (_req, res) => {
    let database: 'ok' | 'error' = 'ok';
    try {
      const { sequelize } = await import('../config/database');
      await sequelize.authenticate();
    } catch {
      database = 'error';
    }
    const degradado = database === 'error';
    if (degradado) {
      res.setHeader('Retry-After', '30');
    }
    res.status(degradado ? 503 : 200).json({
      status: degradado ? 'degraded' : 'ok',
      database,
      uptimeSeg: 0,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/competencias', competenciaRoutes);
  app.use('/api/eventos', eventoRoutes);
  app.use('/api/results', resultRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/heats', heatRoutes);
  return app;
}

const app = buildApp();

/* ------------------------------------------------------------------ */
/* Datos de prueba                                                     */
/* ------------------------------------------------------------------ */

const mockAdmin = {
  id: 1,
  nombre: 'Admin',
  apellidos: 'Test',
  cedula: '12345',
  box: 'BoxTest',
  rol: 'admin',
  email: 'admin@test.com',
  es_superadmin: false,
  box_id: 1,
  password_cambiado: true,
};

const mockJuez = {
  id: 2,
  nombre: 'Juez',
  apellidos: 'Test',
  cedula: '67890',
  box: 'BoxTest',
  rol: 'juez',
};

const mockCompetencia = {
  id: 1,
  nombre: 'Open 2024',
  tipo_flujo: 'en_serie',
  tipo_publicacion: 'tiempo_real',
  estado: 'activo',
  wods: [
    {
      orden: 1,
      nombre_ejercicio: 'For Time',
      tipo_medicion: 'tiempo',
      tiempo_estimado_duracion: 600,
      puntaje_maximo: 100,
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  jest.clearAllMocks();
});

// ── AUTH ──────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('credenciales validas -> 200 + cookie token', async () => {
    (authService.loginUsuario as jest.Mock).mockResolvedValue({
      token: 'jwt-token-firmado',
      user: mockAdmin,
      needsPasswordChange: false,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ cedula: '12345', password: 'Admin123!' });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.rol).toBe('admin');
    expect(res.headers['set-cookie']).toBeDefined();
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain('token=');
    expect(cookie).toContain('HttpOnly');
    expect(authService.loginUsuario).toHaveBeenCalledWith('12345', 'Admin123!');
  });

  it('credenciales invalidas -> 401', async () => {
    (authService.loginUsuario as jest.Mock).mockRejectedValue(
      new Error('Cedula o contrasena incorrectos'),
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ cedula: '12345', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/incorrectos/);
  });

  it('campos faltantes -> 400 (validacion Zod)', async () => {
    const res = await request(app).post('/api/auth/login').send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos invalidos');
    expect(res.body.errors).toBeDefined();
  });
});

describe('GET /api/auth/me', () => {
  it('token valido -> 200 + perfil', async () => {
    (authService.getPerfil as jest.Mock).mockResolvedValue(mockAdmin);

    const res = await request(app).get('/api/auth/me').set('Cookie', 'token=valid-admin-token');

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe(1);
    expect(authService.getPerfil).toHaveBeenCalled();
  });

  it('sin token -> 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('-> 200 + cookie limpia', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Sesion cerrada');
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain('token=');
  });
});

describe('POST /api/auth/refresh', () => {
  it('token valido -> 200 + cookie refrescada', async () => {
    (authService.refreshToken as jest.Mock).mockReturnValue({
      token: 'nuevo-jwt-token',
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'token=valid-admin-token');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain('token=nuevo-jwt-token');
  });
});

describe('POST /api/auth/registro', () => {
  it('email invalido -> 400 (validacion Zod)', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nombre: 'Test',
      apellidos: 'User',
      cedula: '99999',
      box: 'BoxTest',
      email: 'no-es-email',
      password: 'Admin123!',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos invalidos');
    expect(res.body.errors.email).toBeDefined();
  });

  it('campos requeridos faltantes -> 400', async () => {
    const res = await request(app).post('/api/auth/registro').send({ email: 'test@test.com' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });
});

// ── USERS ─────────────────────────────────────────────────────────────

describe('POST /api/users/jueces', () => {
  it('admin crea juez -> 201', async () => {
    (userService.createJuez as jest.Mock).mockResolvedValue({
      usuario: mockJuez,
      tempPassword: 'Tmp12345!',
    });

    const res = await request(app)
      .post('/api/users/jueces')
      .set('Cookie', 'token=valid-admin-token')
      .send({
        nombre: 'Juez',
        apellidos: 'Test',
        cedula: '67890',
        box: 'BoxTest',
      });

    expect(res.status).toBe(201);
    expect(res.body.usuario).toBeDefined();
    expect(res.body.tempPassword).toBeDefined();
    expect(userService.createJuez).toHaveBeenCalled();
  });

  it('sin rol admin -> 403', async () => {
    const res = await request(app)
      .post('/api/users/jueces')
      .set('Cookie', 'token=valid-juez-token')
      .send({
        nombre: 'Juez',
        apellidos: 'Test',
        cedula: '67890',
        box: 'BoxTest',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permisos/);
  });

  it('sin token -> 401', async () => {
    const res = await request(app).post('/api/users/jueces').send({
      nombre: 'Juez',
      apellidos: 'Test',
      cedula: '67890',
      box: 'BoxTest',
    });

    expect(res.status).toBe(401);
  });
});

// ── COMPETENCIAS ──────────────────────────────────────────────────────

describe('POST /api/users/bulk (carga CSV)', () => {
  it('rechaza un archivo que no es CSV -> 400', async () => {
    const res = await request(app)
      .post('/api/users/bulk')
      .set('Cookie', 'token=valid-admin-token')
      .attach('archivo', Buffer.from('no soy una tabla'), {
        filename: 'atletas.txt',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/CSV/);
    expect(userService.bulkCreate).not.toHaveBeenCalled();
  });

  it('acepta .csv aunque el navegador mande un tipo que no reconoce', async () => {
    // Los navegadores no se ponen de acuerdo con el tipo de un .csv: unos
    // mandan text/plain, otros application/octet-stream, otros algo inventado.
    // La extensión tiene que bastar, o la carga masiva falla sin motivo.
    (userService.parseCSV as jest.Mock).mockReturnValue([{ nombre: 'Atleta', cedula: '1' }]);
    (userService.bulkCreate as jest.Mock).mockResolvedValue({ creados: 1, errores: [] });

    const res = await request(app)
      .post('/api/users/bulk')
      .set('Cookie', 'token=valid-admin-token')
      .attach('archivo', Buffer.from('nombre,cedula\nAtleta,1'), {
        filename: 'atletas.csv',
        contentType: 'text/x-desconocido',
      });

    expect(res.status).toBe(200);
    expect(userService.bulkCreate).toHaveBeenCalled();
  });
});

describe('POST /api/competencias', () => {
  it('datos validos + admin -> 201', async () => {
    (competenciaService.createCompetencia as jest.Mock).mockResolvedValue(mockCompetencia);

    const res = await request(app)
      .post('/api/competencias')
      .set('Cookie', 'token=valid-admin-token')
      .send({
        nombre: 'Open 2024',
        tipo_flujo: 'en_serie',
        tipo_publicacion: 'tiempo_real',
        wods: [
          {
            orden: 1,
            nombre_ejercicio: 'For Time',
            tipo_medicion: 'tiempo',
            tiempo_estimado_duracion: 600,
            puntaje_maximo: 100,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.competencia).toBeDefined();
    expect(competenciaService.createCompetencia).toHaveBeenCalled();
  });

  it('datos invalidos -> 400 (validacion Zod)', async () => {
    const res = await request(app)
      .post('/api/competencias')
      .set('Cookie', 'token=valid-admin-token')
      .send({
        nombre: '',
        tipo_flujo: 'invalido',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Datos invalidos');
  });

  it('sin auth -> 401', async () => {
    const res = await request(app)
      .post('/api/competencias')
      .send({
        nombre: 'Open 2024',
        tipo_flujo: 'en_serie',
        tipo_publicacion: 'tiempo_real',
        wods: [
          {
            orden: 1,
            nombre_ejercicio: 'For Time',
            tipo_medicion: 'tiempo',
            tiempo_estimado_duracion: 600,
            puntaje_maximo: 100,
          },
        ],
      });

    expect(res.status).toBe(401);
  });
});

// ── HEALTH ────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 with database status ok', async () => {
    const { sequelize } = require('../config/database');
    sequelize.authenticate.mockResolvedValue(undefined);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ── RESULTADOS ────────────────────────────────────────────────────────

describe('POST /api/results', () => {
  it('admin saves result -> 201', async () => {
    const mockWod = { id: 1, competencia_id: 1 };
    const mockParticipante = { id: 10 };
    const mockResultado = { id: 1, participante_id: 10, wod_id: 1, valor_bruto: '12:34' };

    const { Wod, Participante, Resultado, Competencia, Arranque } = require('../models');
    Wod.findByPk.mockResolvedValue(mockWod);
    Participante.findByPk.mockResolvedValue(mockParticipante);
    Resultado.findOne.mockResolvedValue(null);
    Competencia.findByPk.mockResolvedValue({ evento_id: 1 });
    Arranque.findOne.mockResolvedValue(null); // sin heat en pausa
    (resultService.saveResult as jest.Mock).mockResolvedValue(mockResultado);
    (resultService.saveSplits as jest.Mock).mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/results')
      .set('Cookie', 'token=valid-admin-token')
      .send({
        participante_id: 10,
        wod_id: 1,
        valor_bruto: '12:34',
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Resultado guardado');
    expect(res.body.resultado).toBeDefined();
  });

  it('juez saves result -> 201', async () => {
    const mockWod = { id: 1, competencia_id: 1 };
    const mockParticipante = { id: 10 };
    const mockResultado = { id: 2, participante_id: 10, wod_id: 1, valor_bruto: '15:00' };

    const {
      Wod,
      Participante,
      Resultado,
      Asignacion,
      Competencia,
      Arranque,
    } = require('../models');
    Wod.findByPk.mockResolvedValue(mockWod);
    Participante.findByPk.mockResolvedValue(mockParticipante);
    Resultado.findOne.mockResolvedValue(null);
    Asignacion.findOne.mockResolvedValue({ id: 1 });
    Competencia.findByPk.mockResolvedValue({ evento_id: 1 });
    Arranque.findOne.mockResolvedValue(null); // sin heat en pausa
    (resultService.saveResult as jest.Mock).mockResolvedValue(mockResultado);

    const res = await request(app)
      .post('/api/results')
      .set('Cookie', 'token=valid-juez-token')
      .send({
        participante_id: 10,
        wod_id: 1,
        valor_bruto: '15:00',
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Resultado guardado');
  });

  it('heat en pausa -> 409 (ni jueces ni admin registran)', async () => {
    const {
      Wod,
      Participante,
      Resultado,
      Asignacion,
      Competencia,
      Arranque,
    } = require('../models');
    Wod.findByPk.mockResolvedValue({ id: 1, competencia_id: 1 });
    Participante.findByPk.mockResolvedValue({ id: 10 });
    Resultado.findOne.mockResolvedValue(null);
    Asignacion.findOne.mockResolvedValue({ id: 1 });
    Competencia.findByPk.mockResolvedValue({ evento_id: 1 });
    Arranque.findOne.mockResolvedValue({ estado: 'pausado' });

    const res = await request(app)
      .post('/api/results')
      .set('Cookie', 'token=valid-juez-token')
      .send({ participante_id: 10, wod_id: 1, valor_bruto: '15:00' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/pausa/i);
  });

  it('heat finalizado -> 409', async () => {
    const { Wod, Participante, Resultado, Competencia, Arranque } = require('../models');
    Wod.findByPk.mockResolvedValue({ id: 1, competencia_id: 1 });
    Participante.findByPk.mockResolvedValue({ id: 10 });
    Resultado.findOne.mockResolvedValue(null);
    Competencia.findByPk.mockResolvedValue({ evento_id: 1 });
    Arranque.findOne.mockResolvedValue({ estado: 'finalizado' });

    const res = await request(app)
      .post('/api/results')
      .set('Cookie', 'token=valid-admin-token')
      .send({ participante_id: 10, wod_id: 1, valor_bruto: '12:34' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/finalizado/i);
  });

  it('no auth -> 401', async () => {
    const res = await request(app).post('/api/results').send({
      participante_id: 10,
      wod_id: 1,
      valor_bruto: '12:34',
    });

    expect(res.status).toBe(401);
  });
});

// ── LEADERBOARD ───────────────────────────────────────────────────────

describe('GET /api/leaderboard/:competenciaId', () => {
  it('returns leaderboard data', async () => {
    const mockLeaderboard = {
      competencia: { id: 1, nombre: 'Open 2024' },
      clasificacion: [{ participante_id: 10, nombre: 'Atleta 1', puntaje_total: 100 }],
    };
    const { Competencia } = require('../models');
    Competencia.findByPk.mockResolvedValue({ evento_id: 1 });
    (leaderboardScoring.getLeaderboard as jest.Mock).mockResolvedValue(mockLeaderboard);

    const res = await request(app).get('/api/leaderboard/1');

    expect(res.status).toBe(200);
    expect(res.body.competencia).toBeDefined();
    expect(res.body.clasificacion).toBeDefined();
  });
});

// ── EVENTOS PUBLICAS ──────────────────────────────────────────────────

describe('GET /api/eventos/publicas', () => {
  it('returns public events', async () => {
    const mockEventos = [
      { id: 1, nombre: 'Evento 1', estado: 'activa' },
      { id: 2, nombre: 'Evento 2', estado: 'proxima' },
    ];
    (eventoService.listarEventosPublicos as jest.Mock).mockResolvedValue(mockEventos);

    const res = await request(app).get('/api/eventos/publicas');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });
});

// ── HEATS ─────────────────────────────────────────────────────────────

describe('POST /api/heats/generar', () => {
  it('admin generates heats -> 201', async () => {
    const mockHeats = [{ id: 1, categoria_id: 1, capacidad_maxima: 10, heat_numero: 1 }];
    (heatService.generarHeats as jest.Mock).mockResolvedValue(mockHeats);

    const res = await request(app)
      .post('/api/heats/generar')
      .set('Cookie', 'token=valid-admin-token')
      .send({
        categoria_id: 1,
        capacidad_maxima: 10,
        modo: 'alfabetico',
      });

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── COMPETENCIAS UPDATE / DELETE ──────────────────────────────────────

describe('PUT /api/competencias/:id', () => {
  it('admin updates competencia -> 200', async () => {
    const updatedCompetencia = { ...mockCompetencia, nombre: 'Open 2025' };
    // El controlador verifica existencia+alcance antes de actualizar.
    (competenciaService.getCompetenciaById as jest.Mock).mockResolvedValue({
      ...mockCompetencia,
      evento_id: 1,
    });
    (competenciaService.updateCompetencia as jest.Mock).mockResolvedValue(updatedCompetencia);

    const res = await request(app)
      .put('/api/competencias/1')
      .set('Cookie', 'token=valid-admin-token')
      .send({ nombre: 'Open 2025' });

    expect(res.status).toBe(200);
    expect(res.body.competencia).toBeDefined();
  });
});

describe('DELETE /api/competencias/:id', () => {
  it('delete with results -> 404 (dependency check)', async () => {
    // El controlador verifica existencia+alcance antes de eliminar.
    (competenciaService.getCompetenciaById as jest.Mock).mockResolvedValue({
      ...mockCompetencia,
      evento_id: 1,
    });
    (competenciaService.deleteCompetencia as jest.Mock).mockRejectedValue(
      new Error(
        'No se puede eliminar: la competencia tiene 5 resultado(s) registrado(s). Finalizala primero.',
      ),
    );

    const res = await request(app)
      .delete('/api/competencias/1')
      .set('Cookie', 'token=valid-admin-token');

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/resultado/);
  });
});
