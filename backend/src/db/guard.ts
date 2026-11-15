import { env, isProduction } from '../config/env';

/**
 * Congela el DDL en producción (área 3: DB segura).
 *
 * Regla: NUNCA `sequelize.sync({ alter: true })` ni `{ force: true }` en prod.
 * Todo cambio de esquema viaja como migración versionada en `schema.ts`
 * (MIGRATIONS / RAW_MIGRATIONS, idempotentes). Este guard revienta el arranque
 * si alguien intenta un sync destructivo en producción.
 */
export function assertSafeBootstrap(): void {
  if (isProduction && env.SEED_DEMO) {
    throw new Error('SEED_DEMO=true está prohibido en producción: cargaría datos de ejemplo');
  }
}

/** Verifica que no se pida un sync destructivo. Llamar antes de cualquier sync. */
export function assertSafeSync(opciones: { alter?: boolean; force?: boolean } = {}): void {
  if (isProduction && (opciones.alter || opciones.force)) {
    throw new Error('sync({ alter/force: true }) prohibido en producción: usa migraciones en schema.ts');
  }
  if (!isProduction && (opciones.alter || opciones.force) && process.env.ALLOW_DB_SYNC !== 'true') {
    throw new Error('sync({ alter/force: true }) requiere ALLOW_DB_SYNC=true incluso en dev');
  }
}
