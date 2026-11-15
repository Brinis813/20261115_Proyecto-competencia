import { Sequelize } from 'sequelize';
import { env } from './env';
import { log } from '../utils/logger';

export const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT, 10),
  dialect: 'mysql',

  // El registro de cada consulta SQL esta desactivado por defecto: la
  // clasificacion se recalcula en cada resultado y llena la consola de ruido
  // que tapa lo que de verdad interesa al depurar. Se activa con DB_LOGGING=true.
  logging: env.DB_LOGGING ? (sql: string) => log.debug(sql) : false,

  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },
});

export async function connectDB(): Promise<void> {
  await sequelize.authenticate();
}
