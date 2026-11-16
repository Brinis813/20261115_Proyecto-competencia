import path from 'path';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const booleanish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('3306'),
  DB_NAME: z.string().default('hyrox_db'),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),

  JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('4h'),

  /** Origenes permitidos, separados por coma. '*' permite cualquiera (solo dev). */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  /** Numero de proxies de confianza delante del backend (nginx/Traefik/Dokploy). */
  TRUST_PROXY: z.string().default('1'),

  /** Credenciales del administrador que se crea si la BD esta vacia. */
  SEED_ADMIN_CEDULA: z.string().default('0000000000'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('Admin123!'),

  /** Carga jueces/participantes/Competencia de ejemplo en una BD vacia. */
  SEED_DEMO: booleanish,

  /** Detalle de la consola: error | warn | info | debug. */
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  /** Imprime cada consulta SQL. Muy ruidoso; solo para depurar la base de datos. */
  DB_LOGGING: booleanish,

  /**
   * Direccion publica del frontend. Se usa para armar el enlace de
   * verificacion del correo, asi que tiene que ser la que ve el usuario.
   */
  APP_URL: z.string().default('http://localhost:5173'),

  /**
   * SMTP del correo saliente. Si falta SMTP_HOST no se envia nada: el enlace de
   * verificacion se escribe en el log, que es suficiente para desarrollo.
   */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587'),
  SMTP_SECURE: booleanish,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('Competition Manager <no-reply@localhost>'),

  /** Permite que cualquiera cree su cuenta desde la pantalla de acceso. */
  REGISTRO_ABIERTO: z
    .string()
    .optional()
    .transform((v) => v !== 'false' && v !== '0'),

  /**
   * Monitoreo (Sentry opcional). Sin DSN solo hay log local estructurado.
   * Requiere `npm i @sentry/node` en el backend para enviar.
   */
  SENTRY_DSN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('\nConfiguracion invalida en el archivo .env:\n');
  for (const [key, issues] of Object.entries(parsed.error.flatten().fieldErrors)) {
    console.error(`  - ${key}: ${issues?.join(', ')}`);
  }
  console.error('\nCopia backend/.env.example a backend/.env y completa los valores.\n');
  process.exit(1);
}

export const env = parsed.data;

/**
 * Lista de origenes permitidos por CORS ('*' = cualquiera, solo dev/test).
 *
 * En producción '*' está prohibido: combinado con `credentials: true` los
 * navegadores rechazan la respuesta y las cookies HttpOnly no viajarían
 * (además de exponer la API). El arranque aborta con mensaje claro.
 */
if (env.NODE_ENV === 'production' && env.CORS_ORIGIN.trim() === '*') {
  console.error(
    "\nCORS_ORIGIN='*' no está permitido en producción con cookies HttpOnly: indica los orígenes exactos.\n",
  );
  process.exit(1);
}

/** Lista de origenes permitidos por CORS ('*' = cualquiera). */
export const corsOrigins: string[] | '*' =
  env.CORS_ORIGIN.trim() === '*'
    ? '*'
    : env.CORS_ORIGIN.split(',')
        .map((o) => o.trim())
        .filter(Boolean);

export const isProduction = env.NODE_ENV === 'production';

/** Directorio donde se almacenan las imagenes subidas (portadas de eventos, etc.). */
export const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads');
