import mysql, { type RowDataPacket } from 'mysql2/promise';
import { log } from '../../utils/logger';

/**
 * Mueve las pruebas y ejercicios creados con el esquema anterior
 * (competencias(eventos) > wods(pruebas) > circuitos(ejercicios)) al esquema
 * actual (eventos > competencias(pruebas) > wods(ejercicios)).
 *
 * El renombre de tablas de `renombrarEntidades` no puede correr cuando los
 * destinos ya existen (se crearon vacios en un arranque anterior), asi que
 * las filas se mudan una a una. Es idempotente: las filas ya mudadas se
 * borran del origen, y si un reintento encuentra la prueba ya creada por
 * nombre+evento, la reutiliza en vez de duplicarla. Nunca aborta el
 * arranque: cualquier fallo se registra y se sigue.
 *
 * Dividida en 4 pasos (detectar, normalizar, mudar, limpiar) para que cada
 * uno quepa en una funcion revisable.
 */

interface ContextoLegacy {
  hay: Set<string>;
  pruebasLegacy: FilaPruebaLegacy[];
}

/** Fila de prueba del esquema anterior (solo los campos que se mudan). */
interface FilaPruebaLegacy extends RowDataPacket {
  id: number;
  competencia_id?: number | null;
  nombre: string;
  descripcion?: string | null;
  metodo_desempate?: string | null;
  tipo_flujo?: string | null;
  tipo_publicacion?: string | null;
  desempate_nombre?: string | null;
  desempate_tipo_medicion?: string | null;
  tiebreak_policy?: string | null;
  estado?: string | null;
  tipo_participacion?: string | null;
  duracion_minutos?: number | null;
  rondas?: number | null;
  divisiones?: unknown;
  circuito_desempate_id?: number | null;
}

async function detectarEsquemaLegacy(conn: mysql.Connection): Promise<ContextoLegacy | null> {
  // Sin tabla de ejercicios legacy no hay nada que mudar.
  const [tablas] = await conn.query<any[]>(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('wods', 'circuitos', 'competencias', 'eventos')`,
  );
  const hay = new Set((tablas as Array<{ t: string }>).map((r) => r.t));
  if (!hay.has('wods') || !hay.has('competencias') || !hay.has('eventos')) return null;

  const [colsWods] = await conn.query<any[]>(`SHOW COLUMNS FROM wods`);
  const nombresWods = new Set((colsWods as Array<{ Field: string }>).map((c) => c.Field));
  // Marca legacy: la tabla `wods` guarda pruebas (columna `nombre` propia
  // de pruebas) y aun no tiene las de ejercicio.
  if (!nombresWods.has('nombre')) return null;

  const [pruebasLegacy] = await conn.query<FilaPruebaLegacy[]>(
    `SELECT * FROM wods WHERE nombre IS NOT NULL AND (nombre_ejercicio IS NULL OR nombre_ejercicio = '')`,
  );
  const [colsComp] = await conn.query<any[]>(`SHOW COLUMNS FROM competencias`);
  const nombresComp = new Set((colsComp as Array<{ Field: string }>).map((c) => c.Field));
  if (!nombresComp.has('tipo_flujo') || !nombresComp.has('tipo_publicacion')) {
    if (pruebasLegacy.length > 0) {
      log.warn('migrarPruebasLegacy omitido: faltan columnas de prueba en competencias');
    }
    return null;
  }
  return { hay, pruebasLegacy };
}

/** Normaliza enums y nulabilidad heredados para que la mudanza no falle. */
async function normalizarTablasLegacy(conn: mysql.Connection): Promise<void> {
  try {
    await conn.query(
      `DELETE FROM competencias WHERE fecha_inicio IS NOT NULL AND nombre = 'Competencia inicial'`,
    );
    await conn.query(
      `UPDATE competencias SET tiebreak_policy = 'DESIGNATED_CIRCUIT_SPLIT'
       WHERE tiebreak_policy NOT IN ('NONE','TIEBREAK_MARK','DESIGNATED_CIRCUIT_SPLIT')`,
    );
    await conn.query(
      `ALTER TABLE competencias MODIFY COLUMN tiebreak_policy ENUM('NONE','TIEBREAK_MARK','DESIGNATED_CIRCUIT_SPLIT') NOT NULL DEFAULT 'DESIGNATED_CIRCUIT_SPLIT'`,
    );
    // Restos del contenedor: las fechas eran NOT NULL sin default y el
    // INSERT de pruebas (que no lleva fechas) fallaba con "Field
    // 'fecha_inicio' doesn't have a default value". Las pruebas nuevas
    // nunca escriben estas columnas, asi que pueden ser NULL.
    await conn.query(`ALTER TABLE competencias MODIFY COLUMN fecha_inicio DATE NULL`);
    await conn.query(`ALTER TABLE competencias MODIFY COLUMN fecha_fin DATE NULL`);
    // La tabla `wods` legacy trae `nombre` (de cuando guardaba pruebas)
    // como NOT NULL sin default; los ejercicios nuevos no la escriben.
    const [colsWodsNorm] = await conn.query<any[]>(`SHOW COLUMNS FROM wods`);
    const colNombre = (
      colsWodsNorm as Array<{ Field: string; Null: string; Default: unknown }>
    ).find((col) => col.Field === 'nombre');
    if (
      colNombre &&
      colNombre.Null === 'NO' &&
      (colNombre.Default === null || colNombre.Default === undefined)
    ) {
      await conn.query(`ALTER TABLE wods MODIFY COLUMN nombre VARCHAR(150) NULL DEFAULT NULL`);
      log.info('columna legacy normalizada: wods.nombre ahora admite NULL');
    }
  } catch (err) {
    log.warn(`no se pudo normalizar tiebreak_policy de competencias: ${(err as Error).message}`);
  }
}

/** Muda las pruebas (wods legacy -> competencias). Devuelve el mapa viejo->nuevo. */
async function mudarPruebas(
  conn: mysql.Connection,
  hay: Set<string>,
  pruebasLegacy: FilaPruebaLegacy[],
): Promise<Map<number, number>> {
  const mapaPrueba = new Map<number, number>(); // wods.id viejo -> competencias.id nuevo
  for (const vieja of pruebasLegacy) {
    // La prueba colgaba del contenedor viejo (competencias.id); el evento
    // nuevo es el evento_id que se le adopto a ese contenedor.
    let eventoId: number | null = null;
    if (vieja.competencia_id) {
      try {
        const [cont] = await conn.query<any[]>(
          `SELECT evento_id FROM competencias WHERE id = ? LIMIT 1`,
          [vieja.competencia_id],
        );
        eventoId = cont[0]?.evento_id ?? null;
      } catch {
        eventoId = null;
      }
    }
    if (!eventoId) {
      const [ev] = await conn.query<any[]>(`SELECT id FROM eventos ORDER BY id ASC LIMIT 1`);
      eventoId = ev[0]?.id ?? null;
    }
    if (!eventoId) {
      log.warn(`prueba legacy sin evento destino, se omite: wods.id=${vieja.id}`);
      continue;
    }

    // Reintento seguro: si ya existe una prueba con ese nombre en el
    // evento, se reutiliza en vez de duplicar.
    const [ya] = await conn.query<any[]>(
      `SELECT id FROM competencias WHERE nombre = ? AND evento_id = ? LIMIT 1`,
      [vieja.nombre, eventoId],
    );
    let nuevaId: number = ya[0]?.id ?? null;
    if (!nuevaId) {
      const divisiones =
        typeof vieja.divisiones === 'string'
          ? vieja.divisiones
          : JSON.stringify(vieja.divisiones ?? null);
      const [res] = await conn.query<any>(
        `INSERT INTO competencias
          (nombre, descripcion, metodo_desempate, tipo_flujo, tipo_publicacion,
           desempate_nombre, desempate_tipo_medicion, wod_desempate_id,
           tiebreak_policy, estado, tipo_participacion, duracion_minutos,
           rondas, divisiones, evento_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL,
                 ?, ?, ?, ?, ?, ?, ?)`,
        [
          vieja.nombre,
          vieja.descripcion ?? null,
          vieja.metodo_desempate ?? null,
          vieja.tipo_flujo ?? 'en_serie',
          vieja.tipo_publicacion ?? 'tiempo_real',
          vieja.desempate_nombre ?? null,
          vieja.desempate_tipo_medicion ?? null,
          vieja.tiebreak_policy ?? 'DESIGNATED_CIRCUIT_SPLIT',
          vieja.estado ?? 'activo',
          vieja.tipo_participacion ?? 'Individual',
          vieja.duracion_minutos ?? null,
          vieja.rondas ?? 1,
          divisiones,
          eventoId,
        ],
      );
      nuevaId = res.insertId;
      log.info(`prueba legacy mudada: wods.id=${vieja.id} -> competencias.id=${nuevaId}`);
    } else {
      log.info(
        `prueba legacy ya existia, se reutiliza: wods.id=${vieja.id} -> competencias.id=${nuevaId}`,
      );
    }
    mapaPrueba.set(vieja.id, nuevaId);

    // El desempate designado apuntaba a un ejercicio de `circuitos`; se
    // reenlaza cuando ese ejercicio ya este mudado (se resuelve abajo).
    if (vieja.circuito_desempate_id && hay.has('circuitos')) {
      await reenlazarDesempate(conn, vieja.circuito_desempate_id, nuevaId);
    }
  }
  return mapaPrueba;
}

/** Reenlaza el WOD de desempate legacy (circuitos) al ejercicio ya mudado. */
async function reenlazarDesempate(
  conn: mysql.Connection,
  circuitoId: number,
  competenciaId: number,
): Promise<void> {
  try {
    const [circ] = await conn.query<any[]>(
      `SELECT orden, nombre_ejercicio FROM circuitos WHERE id = ? LIMIT 1`,
      [circuitoId],
    );
    if (circ[0]) {
      const [ej] = await conn.query<any[]>(
        `SELECT id FROM wods WHERE competencia_id = ? AND orden = ? AND nombre_ejercicio = ? LIMIT 1`,
        [competenciaId, circ[0].orden, circ[0].nombre_ejercicio],
      );
      if (ej[0]?.id) {
        await conn.query(`UPDATE competencias SET wod_desempate_id = ? WHERE id = ?`, [
          ej[0].id,
          competenciaId,
        ]);
      }
    }
  } catch (err) {
    log.warn(
      `no se pudo reenlazar el desempate de la competencia ${competenciaId}: ${(err as Error).message}`,
    );
  }
}

/** Muda los ejercicios (circuitos.wod_id -> wods.competencia_id). */
async function mudarEjercicios(
  conn: mysql.Connection,
  hay: Set<string>,
  mapaPrueba: Map<number, number>,
): Promise<void> {
  if (!hay.has('circuitos') || mapaPrueba.size === 0) return;
  const [colsEj] = await conn.query<any[]>(`SHOW COLUMNS FROM circuitos`);
  const nombresEj = new Set((colsEj as Array<{ Field: string }>).map((c) => c.Field));
  if (!nombresEj.has('wod_id') || !nombresEj.has('nombre_ejercicio')) return;

  for (const [viejaPruebaId, nuevaPruebaId] of mapaPrueba) {
    const [ejercicios] = await conn.query<any[]>(
      `SELECT * FROM circuitos WHERE wod_id = ? ORDER BY orden ASC`,
      [viejaPruebaId],
    );
    for (const ej of ejercicios as any[]) {
      const [existe] = await conn.query<any[]>(
        `SELECT id FROM wods WHERE competencia_id = ? AND orden = ? AND nombre_ejercicio = ? LIMIT 1`,
        [nuevaPruebaId, ej.orden, ej.nombre_ejercicio],
      );
      if (!existe[0]) {
        const esquema =
          typeof ej.esquema === 'string' ? ej.esquema : JSON.stringify(ej.esquema ?? null);
        await conn.query(
          `INSERT INTO wods
            (competencia_id, orden, nombre, nombre_ejercicio, tipo_medicion,
             tiempo_estimado_duracion, tiempo_cap, esquema, puntaje_maximo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            nuevaPruebaId,
            ej.orden,
            ej.nombre_ejercicio,
            ej.nombre_ejercicio,
            ej.tipo_medicion ?? 'tiempo',
            ej.tiempo_estimado_duracion ?? 0,
            ej.tiempo_cap ?? 0,
            esquema,
            ej.puntaje_maximo ?? 100,
          ],
        );
      }
    }
    if ((ejercicios as unknown[]).length > 0) {
      await conn.query(`DELETE FROM circuitos WHERE wod_id = ?`, [viejaPruebaId]);
      log.info(
        `ejercicios mudados de la prueba vieja wods.id=${viejaPruebaId}: ${(ejercicios as unknown[]).length}`,
      );
    }
  }
}

/** Limpia el origen y el contenedor fantasma tras la mudanza. */
async function limpiarOrigen(
  conn: mysql.Connection,
  mapaPrueba: Map<number, number>,
): Promise<void> {
  // Limpieza del origen: las pruebas ya mudadas salen de `wods` para que
  // no contaminen las consultas de ejercicios.
  for (const viejaPruebaId of mapaPrueba.keys()) {
    await conn.query(`DELETE FROM wods WHERE id = ?`, [viejaPruebaId]);
  }

  // El contenedor auto-generado "Competencia inicial" (fila con fechas de
  // evento dentro de `competencias`) quedo superseditado por el evento
  // real de `eventos`. Si siguiera ahi, saldria como prueba fantasma.
  try {
    const [fantasmas] = await conn.query<any[]>(
      `SELECT id, nombre FROM competencias
       WHERE fecha_inicio IS NOT NULL AND nombre = 'Competencia inicial'`,
    );
    for (const f of fantasmas as any[]) {
      await conn.query(`DELETE FROM competencias WHERE id = ?`, [f.id]);
      log.info(`contenedor legacy eliminado: competencias.id=${f.id} ("${f.nombre}")`);
    }
    const [otros] = await conn.query<any[]>(
      `SELECT id, nombre FROM competencias WHERE fecha_inicio IS NOT NULL`,
    );
    if ((otros as unknown[]).length > 0) {
      log.warn(
        `contenedores legacy sin migrar en competencias: ${(otros as any[]).map((o) => `${o.id} ("${o.nombre}")`).join(', ')}`,
      );
    }
  } catch {
    /* tabla sin columnas legacy: nada que limpiar */
  }
}

export async function migrarPruebasLegacy(conn: mysql.Connection): Promise<void> {
  try {
    const ctx = await detectarEsquemaLegacy(conn);
    if (!ctx) return;
    // La tabla legacy puede traer el enum de *evento* en `tiebreak_policy`
    // (heredado del contenedor). Se normaliza al enum de prueba para que la
    // mudanza no falle con "Data truncated".
    await normalizarTablasLegacy(conn);
    const mapa = await mudarPruebas(conn, ctx.hay, ctx.pruebasLegacy);
    await mudarEjercicios(conn, ctx.hay, mapa);
    await limpiarOrigen(conn, mapa);
  } catch (err) {
    log.warn(`no se pudieron migrar las pruebas legacy: ${(err as Error).message}`);
  }
}
