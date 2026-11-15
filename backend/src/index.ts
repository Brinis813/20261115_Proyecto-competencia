import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { env, corsOrigins, isProduction } from './config/env';
import { connectDB, sequelize } from './config/database';
import { ensureDatabase } from './db/bootstrap';
import { seedInitialAdmin, ensureSuperadmin } from './db/repairs/superadmin';
import { seedDemoData } from './db/repairs/demo';
import './models';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import competenciaRoutes from './routes/competencias';
import eventoRoutes from './routes/eventos';
import resultRoutes from './routes/results';
import participantRoutes from './routes/participant';
import leaderboardRoutes from './routes/leaderboard';
import categoryRoutes from './routes/categories';
import heatRoutes from './routes/heats';
import boxRoutes from './routes/boxes';
import erroresRoutes from './routes/errores';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { authMiddleware, requireRoles } from './middleware/auth';
import { UPLOADS_DIR } from './config/env';
import { initMonitoring, requestContext, socketHealth } from './utils/monitoring';
import { setupSocketHandlers } from './sockets/handlers';
import { log } from './utils/logger';

initMonitoring();

// Validar UPLOADS_DIR está dentro del proyecto (L2).
const resolvedUploads = path.resolve(UPLOADS_DIR);
if (!resolvedUploads.startsWith(path.resolve(process.cwd()))) {
  throw new Error(`UPLOADS_DIR must be within project directory: ${resolvedUploads}`);
}

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // M10: Reducido de 1MB a 64KB — los eventos usan JSON pequeño.
  maxHttpBufferSize: 64e3,
});

// Detras de nginx o Traefik (Dokploy) la IP real llega en X-Forwarded-For.
// Sin esto el limitador de peticiones veria a todos los clientes como uno solo.
const trustProxyValue = parseInt(env.TRUST_PROXY || '1', 10);
if (isNaN(trustProxyValue) || trustProxyValue < 0 || trustProxyValue > 4) {
  throw new Error('TRUST_PROXY must be between 0 and 4');
}
app.set('trust proxy', trustProxyValue);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', '/api/uploads'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  } : false,
  hsts: isProduction ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
  xssFilter: true,
  crossOriginEmbedderPolicy: false,
  noSniff: true,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(rateLimiter(300, 60 * 1000));
// Contexto de monitoreo (endpoint/competitionId/userId) para errores.
app.use(requestContext);

const arranque = Date.now();

/** Health: api + db + socket (salas y frescura del último broadcast). */
app.get('/api/health', async (_req, res) => {
  let database: 'ok' | 'error' = 'ok';
  try {
    await sequelize.authenticate();
  } catch {
    database = 'error';
  }
  const rooms = io.sockets.adapter.rooms.size;
  const socket = socketHealth(rooms);
  const degradado = database === 'error' || socket.stale;
  if (degradado) {
    res.setHeader('Retry-After', '30');
  }
  res.status(degradado ? 503 : 200).json({
    status: degradado ? 'degraded' : 'ok',
    database,
    socket,
    uptimeSeg: Math.round((Date.now() - arranque) / 1000),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/competencias', competenciaRoutes);
app.use('/api/eventos', eventoRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/participant', participantRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/heats', heatRoutes);
app.use('/api/boxes', boxRoutes);
// Buzón de errores del frontend: público (la pantalla del evento es anónima)
// con rate-limit estricto propio. Se monta antes del notFoundHandler.
app.use('/api/errores', erroresRoutes);
// Portadas de eventos: archivos publicos (igual que la clasificacion).
// Va antes del notFoundHandler de /api para que no los tape.
app.use('/api/uploads', express.static(UPLOADS_DIR, { maxAge: '1d', immutable: false }));

app.use('/api', notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    // Crea la base de datos y las tablas si no existen, y deja un
    // administrador listo para el primer ingreso.
    await ensureDatabase();
    await connectDB();
    // CRIT-4: setupSocketHandlers después de connectDB para que los handlers
    // puedan acceder a la base de datos de forma segura.
    setupSocketHandlers(io);
    await seedInitialAdmin();
    await ensureSuperadmin();
    await seedDemoData();

    httpServer.listen(Number(env.PORT), () => {
      log.info(`API lista en el puerto ${env.PORT} (${env.NODE_ENV})`);
      if (!isProduction) {
        log.info(`Estado: http://localhost:${env.PORT}/api/health`);
        log.debug('LOG_LEVEL=debug activo. Usa DB_LOGGING=true para ver las consultas SQL.');
      }
    });
  } catch (error: any) {
    log.error(`No se pudo iniciar el servidor: ${error.message}`);
    if (error.code === 'ECONNREFUSED' || error.code === 'ER_ACCESS_DENIED_ERROR') {
      log.error(
        `Revisa que MySQL este activo en ${env.DB_HOST}:${env.DB_PORT} y que ` +
          'DB_USER/DB_PASSWORD en backend/.env sean correctos.'
      );
    }
    process.exit(1);
  }
}

// CRIT-5: Handlers globales para rechazos no capturados — evita muerte silenciosa.
process.on('unhandledRejection', (reason) => {
  log.error(`Unhandled rejection: ${reason}`);
});
process.on('uncaughtException', (err) => {
  log.error(`Uncaught exception: ${err.message}`);
  process.exit(1);
});

// M12: Cierre ordenado con timeout de 30s para drenar conexiones en vuelo.
for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(senal, () => {
    log.info(`${senal} recibido, cerrando...`);
    io.close();
    httpServer.close(() => {
      sequelize.close().finally(() => process.exit(0));
    });
    // Forzar salida si el graceful shutdown tarda más de 30s.
    setTimeout(() => process.exit(1), 30000).unref();
  });
}

start();
