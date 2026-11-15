import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { env } from '../../config/env';
import { log } from '../../utils/logger';

function conexionSinBase() {
  return mysql.createConnection({
    host: env.DB_HOST,
    port: parseInt(env.DB_PORT, 10),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });
}

/**
 * Crea el usuario administrador inicial si la tabla de usuarios esta vacia.
 * Nace como superadmin (rol='admin' + es_superadmin=TRUE, sin box): ve todas
 * las eventos y gestiona boxes/administradores. La contrasena sale de
 * SEED_ADMIN_PASSWORD y se marca como no cambiada, de modo que el primer
 * login obliga a definir una nueva.
 */
export async function seedInitialAdmin(): Promise<void> {
  const conn = await conexionSinBase();

  try {
    const [rows] = await conn.query<any[]>('SELECT COUNT(*) AS total FROM usuarios');
    if (rows[0]?.total > 0) return;

    const hash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 12);
    await conn.query(
      `INSERT INTO usuarios (nombre, apellidos, cedula, box, box_id, rol, es_superadmin, password, password_cambiado)
       VALUES (?, ?, ?, ?, NULL, 'admin', TRUE, ?, FALSE)`,
      ['Admin', 'Sistema', env.SEED_ADMIN_CEDULA, 'Competition HQ', hash]
    );

    log.raw('');
    log.raw('  ┌─────────────────────────────────────────────────┐');
    log.raw('  │  Administrador inicial creado                   │');
    log.raw(`  │  Cedula:     ${env.SEED_ADMIN_CEDULA.padEnd(35)}│`);
    log.raw(`  │  Contrasena: ${env.SEED_ADMIN_PASSWORD.padEnd(35)}│`);
    log.raw('  │  Se pedira cambiarla en el primer ingreso.      │');
    log.raw('  └─────────────────────────────────────────────────┘');
    log.raw('');
  } finally {
    await conn.end();
  }
}

/**
 * Promueve a superadmin al admin sembrado en bases ya existentes.
 *
 * `seedInitialAdmin` solo actua con la tabla vacia, asi que las instalaciones
 * creadas antes del flag `es_superadmin` se quedaban sin superadmin y sin
 * acceso a /api/boxes y /api/users/admins (protegidos por `superadminOnly`).
 * Es idempotente: si ya es superadmin no toca nada.
 */
export async function ensureSuperadmin(): Promise<void> {
  const conn = await conexionSinBase();

  try {
    const [rows] = await conn.query<any[]>(
      `SELECT id, es_superadmin FROM usuarios WHERE cedula = ? LIMIT 1`,
      [env.SEED_ADMIN_CEDULA]
    );
    if (!rows[0]) return;
    if (rows[0].es_superadmin) return;

    await conn.query(
      `UPDATE usuarios SET rol = 'admin', es_superadmin = TRUE, box_id = NULL WHERE id = ?`,
      [rows[0].id]
    );
    log.info(`superadmin habilitado para la cedula ${env.SEED_ADMIN_CEDULA} (id ${rows[0].id})`);
  } catch (err) {
    log.warn(`no se pudo habilitar el superadmin: ${(err as Error).message}`);
  } finally {
    await conn.end();
  }
}
