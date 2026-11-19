import mysql from 'mysql2/promise';
import { existeTabla } from './helpers';
import { log } from '../../utils/logger';

/**
 * Repara la tabla `asignaciones` en bases creadas con esquemas anteriores.
 *
 * El esquema legacy traia la unique `(wod_id, participante_id, circuito_id)`
 * y FKs obsoletas (`competencia_id -> wods`, `wod_id -> circuitos`,
 * `competition_id -> competitions`). Con esas FKs, guardar una asignacion
 * fallaba (p. ej. `competencia_id=9` sin `wods.id=9`) y, como el servicio
 * usaba `INSERT IGNORE`, el fallo se tragaba en silencio: el API respondia
 * "asignaciones guardadas" con 0 filas escritas.
 *
 * Ademas el `DROP INDEX unique_asignacion` de RAW_MIGRATIONS nunca podia
 * correr en esas bases (ER_DROP_INDEX_FK: el indice es el soporte de las
 * FKs sobre `wod_id`), asi que la reparacion se hace aqui, por pasos y
 * solo si la unique actual no es ya la canonica. Idempotente y nunca
 * aborta el arranque.
 */
export async function repararAsignaciones(conn: mysql.Connection): Promise<void> {
  try {
    if (!(await existeTabla(conn, 'asignaciones'))) return;

    const [llave] = await conn.query<any[]>(
      `SELECT COLUMN_NAME AS c FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asignaciones'
         AND INDEX_NAME = 'unique_asignacion' ORDER BY SEQ_IN_INDEX`,
    );
    const columnas = (llave as Array<{ c: string }>).map((r) => r.c);
    const canonica = ['competencia_id', 'participante_id', 'wod_id'];
    if (columnas.length === canonica.length && canonica.every((c, i) => columnas[i] === c)) {
      // La unique ya esta bien: solo faltarian las FKs canonicas si alguien
      // las borro a mano; se reintentan (el duplicado se tolera).
      for (const sql of [
        `ALTER TABLE asignaciones ADD CONSTRAINT fk_asignaciones_competencia FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE CASCADE`,
        `ALTER TABLE asignaciones ADD CONSTRAINT fk_asignaciones_wod FOREIGN KEY (wod_id) REFERENCES wods(id) ON DELETE CASCADE`,
      ]) {
        try {
          await conn.query(sql);
        } catch {
          /* ya existe: nada que hacer */
        }
      }
      return;
    }

    // La tabla tiene filas: con la unique vieja no se puede asegurar que el
    // cambio de clave no colisione; se informa y no se toca (el arranque
    // sigue; el admin debera sanear duplicados a mano).
    const [conteo] = await conn.query<any[]>(`SELECT COUNT(*) AS total FROM asignaciones`);
    if ((conteo[0]?.total ?? 0) > 0) {
      log.warn(
        'repararAsignaciones omitido: la tabla tiene filas con la unique legacy; sanealas a mano y reinicia',
      );
      return;
    }

    // Sin filas: se sueltan las FKs obsoletas (las que impiden soltar el
    // indice), se recrea la unique canonica y se reponen las FKs buenas.
    for (const fk of [
      'asignaciones_ibfk_1',
      'fk_asignaciones_circuito',
      'fk_asignaciones_competition',
      'fk_asignaciones_wod',
    ]) {
      try {
        await conn.query(`ALTER TABLE asignaciones DROP FOREIGN KEY ${fk}`);
      } catch {
        /* no existe: se sigue */
      }
    }
    try {
      await conn.query(`ALTER TABLE asignaciones DROP INDEX unique_asignacion`);
    } catch {
      /* no existe: se sigue */
    }
    await conn.query(
      `ALTER TABLE asignaciones ADD UNIQUE KEY unique_asignacion (competencia_id, participante_id, wod_id)`,
    );
    for (const sql of [
      `ALTER TABLE asignaciones ADD CONSTRAINT fk_asignaciones_competencia FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE CASCADE`,
      `ALTER TABLE asignaciones ADD CONSTRAINT fk_asignaciones_wod FOREIGN KEY (wod_id) REFERENCES wods(id) ON DELETE CASCADE`,
    ]) {
      try {
        await conn.query(sql);
      } catch (err) {
        log.warn(`no se pudo reponer FK de asignaciones: ${(err as Error).message}`);
      }
    }
    log.info('asignaciones reparadas: unique canonica + FKs a competencias/wods');
  } catch (err) {
    log.warn(`no se pudieron reparar las asignaciones: ${(err as Error).message}`);
  }
}

/**
 * Da membresia del evento a los jueces que tienen asignacion pero no
 * pertenecen a el.
 *
 * Un juez creado por un superadmin sin evento activa nacia sin fila en
 * `evento_usuarios` (`eventoDestino` devuelve null para el superadmin sin
 * acotar). La asignacion posterior no lo arreglaba, asi que el juez veia
 * 403 en `/results/check` y "No tienes acceso a este WOD" aunque tuviera
 * asignacion. Idempotente (INSERT IGNORE respeta roles ya existentes) y
 * nunca aborta el arranque.
 */
export async function repararMembresiasJueces(conn: mysql.Connection): Promise<void> {
  try {
    if (!(await existeTabla(conn, 'asignaciones')) || !(await existeTabla(conn, 'evento_usuarios')))
      return;
    const [res] = await conn.query<any>(
      `INSERT IGNORE INTO evento_usuarios (evento_id, usuario_id, rol)
       SELECT DISTINCT c.evento_id, a.usuario_id, 'juez'
       FROM asignaciones a JOIN competencias c ON c.id = a.competencia_id
       WHERE c.evento_id IS NOT NULL`,
    );
    const creadas = (res as { affectedRows?: number })?.affectedRows ?? 0;
    if (creadas > 0) log.info(`membresias de juez reparadas: ${creadas}`);
  } catch (err) {
    log.warn(`no se pudieron reparar las membresias de jueces: ${(err as Error).message}`);
  }
}
