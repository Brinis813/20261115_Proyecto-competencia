import { Resultado, Wod, Participante, Asignacion, Competencia } from '../../models';
import type { CompetenciaTieBreakPolicy } from '../../models';
import type { EntradaLeaderboard, FilaPuntuada, LeaderboardResult } from './types';
import { puntuarWod } from './ranking';

/**
 * In-memory leaderboard cache. Key = competenciaId, value = { data, expires }.
 * TTL is 2 seconds — long enough to deduplicate burst reads (e.g. multiple
 * participants requesting the leaderboard within the same event tick), short
 * enough that stale data is never visible for more than a heartbeat.
 */
export const leaderboardCache = new Map<number, { data: LeaderboardResult; expires: number }>();
const LEADERBOARD_TTL_MS = 2_000;

export function invalidateLeaderboardCache(competenciaId?: number) {
  if (competenciaId != null) {
    leaderboardCache.delete(competenciaId);
  } else {
    leaderboardCache.clear();
  }
}

/**
 * Recalcula los puntos de todos los resultados de una competencia y los persiste.
 * Devuelve el mapa `wod_id -> filas puntuadas`.
 *
 * `precargado` evita el doble fetch cuando quien llama ya leyo la competencia
 * y sus wods (getLeaderboard): mismo JSON, 2 queries menos por carga.
 */
export async function calcularPuntuaciones(
  competenciaId: number,
  precargado?: { policy?: CompetenciaTieBreakPolicy; wods?: Wod[] }
): Promise<Map<number, FilaPuntuada[]>> {
  const [policy, wods] =
    precargado?.policy !== undefined && precargado?.wods !== undefined
      ? [precargado.policy, precargado.wods]
      : await Promise.all([
          Competencia.findByPk(competenciaId, { attributes: ['id', 'tiebreak_policy'] }).then(
            (c) =>
              (c as unknown as { tiebreak_policy?: CompetenciaTieBreakPolicy } | null)?.tiebreak_policy ??
              'DESIGNATED_CIRCUIT_SPLIT'
          ),
          Wod.findAll({
            where: { competencia_id: competenciaId },
            attributes: ['id', 'tipo_medicion', 'puntaje_maximo'],
            order: [['orden', 'ASC']],
          }),
        ]);
  const porWod = new Map<number, FilaPuntuada[]>();

  if (wods.length === 0) return porWod;

  const resultados = await Resultado.findAll({
    where: { wod_id: wods.map((c) => c.id) },
    attributes: ['id', 'participante_id', 'wod_id', 'valor_bruto', 'abandono', 'capado', 'disqualificado', 'desempate', 'puntos_calculados'],
  });

  const cambios: Array<{ id: number; puntos_calculados: number }> = [];

  for (const wod of wods) {
    const delWod = resultados.filter((r) => r.wod_id === wod.id);
    const filas = puntuarWod(
      delWod.map((r) => ({
        participante_id: r.participante_id,
        resultado_id: r.id, // Pass result ID here!
        valor_bruto: r.valor_bruto,
        abandono: r.abandono,
        capado: r.capado,
        disqualificado: r.disqualificado,
        desempate: r.desempate,
      })),
      wod.tipo_medicion,
      wod.puntaje_maximo,
      policy
    );
    porWod.set(wod.id, filas);

    // Persistir solo los puntos que realmente cambiaron, en UNA escritura
    // (antes: N `UPDATE` individuales). Map en vez de `.find` por fila.
    const porParticipante = new Map(delWod.map((r) => [r.participante_id, r]));
    for (const fila of filas) {
      const registro = porParticipante.get(fila.participante_id);
      if (registro && registro.puntos_calculados !== fila.puntos) {
        cambios.push({ id: registro.id, puntos_calculados: fila.puntos });
      }
    }
  }

  if (cambios.length > 0) {
    await Resultado.bulkCreate(cambios, { updateOnDuplicate: ['puntos_calculados'] });
  }
  // Siempre se invalida: el recálculo ya termino y quien llama cachea
  // el resultado fresco (antes quedaba stale 2 s tras un reset sin cambios).
  invalidateLeaderboardCache(competenciaId);
  return porWod;
}

/**
 * Clasificacion completa de una competencia, incluidos los atletas sin resultados.
 * H6: Refactorizado para reutilizar los resultados de calcularPuntuaciones()
 * en vez de hacer un segundo fetch identico a la DB.
 */
export async function getLeaderboard(competenciaId: number): Promise<LeaderboardResult> {
  const cached = leaderboardCache.get(competenciaId);
  if (cached && cached.expires > Date.now()) return cached.data;

  const [competencia, wods, asignaciones] = await Promise.all([
    Competencia.findByPk(competenciaId, {
      attributes: ['id', 'nombre', 'descripcion', 'divisiones', 'tiebreak_policy', 'wod_desempate_id'],
    }),
    // Solo las columnas que salen en el JSON (el `esquema` pesa; el resto ni se lee).
    Wod.findAll({
      where: { competencia_id: competenciaId },
      attributes: ['id', 'orden', 'nombre_ejercicio', 'tipo_medicion', 'unidad_distancia', 'imagen_url', 'tiempo_cap', 'esquema', 'puntaje_maximo'],
      order: [['orden', 'ASC']],
    }),
    Asignacion.findAll({
      where: { competencia_id: competenciaId },
      include: [
        {
          model: Participante,
          as: 'Participante',
          attributes: ['id', 'nombre', 'apellidos', 'cedula', 'box', 'categoria'],
        },
      ],
    }),
  ]);

  // Lo ya leido se reutiliza en el recálculo (2 queries menos por carga).
  const porWod = await calcularPuntuaciones(competenciaId, {
    policy: competencia?.tiebreak_policy ?? 'DESIGNATED_CIRCUIT_SPLIT',
    wods,
  });

  const entradas = new Map<number, EntradaLeaderboard>();
  for (const asignacion of asignaciones) {
    const participante = asignacion.get('Participante') as Participante | null;
    if (!participante || entradas.has(participante.id)) continue;

    entradas.set(participante.id, {
      participante_id: participante.id,
      nombre: participante.nombre,
      apellidos: participante.apellidos,
      cedula: participante.cedula,
      box: participante.box ?? null,
      categoria: participante.categoria ?? null,
      puesto: 0,
      puntos_total: 0,
      wods_completados: 0,
      resultados: wods.map((c) => ({
        resultado_id: 0,
        wod_id: c.id,
        orden: c.orden,
        nombre_ejercicio: c.nombre_ejercicio,
        tipo_medicion: c.tipo_medicion,
        valor_bruto: null,
        puntos_calculados: 0,
        posicion: null,
        abandono: false,
        capado: false,
      })),
    });
  }

  for (const wod of wods) {
    for (const fila of porWod.get(wod.id) ?? []) {
      const entrada = entradas.get(fila.participante_id);
      if (!entrada) continue;

      const celda = entrada.resultados.find((r) => r.wod_id === wod.id);
      if (!celda) continue;

      // El resultado_id ya viene en la fila puntuada (sin segundo query).
      celda.resultado_id = fila.resultado_id;
      celda.valor_bruto = fila.valor_bruto;
      celda.puntos_calculados = fila.puntos;
      celda.posicion = fila.posicion;
      celda.abandono = fila.abandono;
      celda.capado = fila.capado;

      entrada.puntos_total += fila.puntos;
      entrada.wods_completados += 1;
    }
  }

  const desempateId = competencia?.wod_desempate_id ?? null;
  const tiebreakPolicy: CompetenciaTieBreakPolicy =
    competencia?.tiebreak_policy ?? 'DESIGNATED_CIRCUIT_SPLIT';

  // Desempate 2 (reutilizable): mejor posicion individual conseguida.
  const mejor = (e: EntradaLeaderboard) =>
    Math.min(Number.MAX_SAFE_INTEGER, ...e.resultados.map((r) => r.posicion ?? Number.MAX_SAFE_INTEGER));

  const clasificacion = Array.from(entradas.values()).sort((a, b) => {
    if (b.puntos_total !== a.puntos_total) return b.puntos_total - a.puntos_total;

    // NONE: sin más criterios; el orden alfabético solo estabiliza la lista.
    if (tiebreakPolicy === 'NONE') {
      return `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`);
    }

    // Desempate 1: wod designado por la competencia (DESIGNATED_CIRCUIT_SPLIT).
    if (desempateId) {
      const pa = a.resultados.find((r) => r.wod_id === desempateId)?.posicion ?? Number.MAX_SAFE_INTEGER;
      const pb = b.resultados.find((r) => r.wod_id === desempateId)?.posicion ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
    }

    // Desempate 2: mejor posicion individual conseguida.
    // (TIEBREAK_MARK actúa dentro del WOD; aquí cae a este criterio.)
    const ma = mejor(a);
    const mb = mejor(b);
    if (ma !== mb) return ma - mb;

    // Desempate 3: orden alfabetico, para que el resultado sea estable.
    return `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`);
  });

  // Puesto compartido cuando hay empate exacto de puntos (regla del Manual:
  // dos 1.os comparten puntos y el siguiente es 3.º).
  let puesto = 0;
  let puntosAnteriores: number | null = null;
  clasificacion.forEach((entrada, indice) => {
    if (puntosAnteriores === null || entrada.puntos_total !== puntosAnteriores) {
      puesto = indice + 1;
      puntosAnteriores = entrada.puntos_total;
    }
    entrada.puesto = puesto;
  });

  // Marca visual: quienes comparten puesto con un vecino.
  const vistos = new Map<number, number>();
  for (const e of clasificacion) vistos.set(e.puesto, (vistos.get(e.puesto) ?? 0) + 1);
  const leaderboard = clasificacion.map((e) => ({
    ...e,
    comparte_puesto: (vistos.get(e.puesto) ?? 0) > 1,
  }));

  const result: LeaderboardResult = {
    competencia: competencia
      ? {
          id: competencia.id,
          nombre: competencia.nombre,
          descripcion: competencia.descripcion,
          divisiones: competencia.divisiones ?? null,
          tiebreakPolicy,
        }
      : null,
    leaderboard,
    wods: wods.map((c) => ({
      id: c.id,
      orden: c.orden,
      nombre_ejercicio: c.nombre_ejercicio,
      tipo_medicion: c.tipo_medicion,
      unidad_distancia: c.unidad_distancia ?? 'm',
      imagen_url: c.imagen_url ?? null,
      tiempo_cap: c.tiempo_cap,
      esquema: c.esquema ?? null,
      puntaje_maximo: c.puntaje_maximo,
    })),
    actualizado: new Date().toISOString(),
  };

  leaderboardCache.set(competenciaId, { data: result, expires: Date.now() + LEADERBOARD_TTL_MS });
  return result;
}

/** Posicion del atleta en cada competencia al que esta asignado. */
export async function getParticipantPosition(participanteId: number) {
  const asignaciones = await Asignacion.findAll({
    where: { participante_id: participanteId },
    attributes: ['competencia_id'],
    group: ['competencia_id'],
  });

  const competenciaIds = asignaciones.map((a) => a.competencia_id);
  if (competenciaIds.length === 0) return [];

  const competencias = await Competencia.findAll({
    where: { id: competenciaIds },
    attributes: ['id', 'nombre', 'tiebreak_policy'],
  });
  const nombrePorCompetencia = new Map(competencias.map((w) => [w.id, w.nombre]));
  // Misma política que el leaderboard principal (calcularPuntuaciones): con
  // NONE el desempate se ignora y misma marca = mismo puesto/puntos.
  const policyPorCompetencia = new Map(
    competencias.map((w) => [
      w.id,
      ((w as unknown as { tiebreak_policy?: CompetenciaTieBreakPolicy }).tiebreak_policy ??
        'DESIGNATED_CIRCUIT_SPLIT') as CompetenciaTieBreakPolicy,
    ])
  );

  // H8: Batch query — cargar todos los WODs y resultados de una sola vez
  // en vez de llamar getLeaderboard() N veces (O(n²) → O(n)).
  const allWods = await Wod.findAll({ where: { competencia_id: competenciaIds } });
  const allResults = await Resultado.findAll({ where: { wod_id: allWods.map((w) => w.id) } });

  // Construir un mapa wod_id → competencia_id para la partición.
  const competenciaPorWod = new Map<number, number>();
  for (const w of allWods) competenciaPorWod.set(w.id, w.competencia_id);

  // Agrupar resultados por competencia.
  const resultadosPorCompetencia = new Map<number, typeof allResults>();
  for (const r of allResults) {
    const cid = competenciaPorWod.get(r.wod_id as number);
    if (cid === undefined) continue;
    if (!resultadosPorCompetencia.has(cid)) resultadosPorCompetencia.set(cid, []);
    resultadosPorCompetencia.get(cid)!.push(r);
  }

  // Para cada competencia, calcular el leaderboard in-memory usando puntuarWod.
  const posiciones = [];
  for (const competenciaId of competenciaIds) {
    const wodsDeCompetencia = allWods.filter((w) => w.competencia_id === competenciaId);
    const resultadosDeCompetencia = resultadosPorCompetencia.get(competenciaId) ?? [];

    // Puntuar cada WOD y acumular puntos por participante.
    const puntosPorParticipante = new Map<number, { puntos: number; puesto: number; total: number }>();

    for (const wod of wodsDeCompetencia) {
      const delWod = resultadosDeCompetencia.filter((r) => r.wod_id === wod.id);
      const filas = puntuarWod(
        delWod.map((r) => ({
          participante_id: r.participante_id,
          resultado_id: r.id,
          valor_bruto: r.valor_bruto,
          abandono: r.abandono,
          capado: r.capado,
          disqualificado: r.disqualificado,
          desempate: r.desempate,
        })),
        wod.tipo_medicion,
        wod.puntaje_maximo,
        policyPorCompetencia.get(competenciaId) ?? 'DESIGNATED_CIRCUIT_SPLIT'
      );

      for (const fila of filas) {
        const actual = puntosPorParticipante.get(fila.participante_id) ?? { puntos: 0, puesto: Number.MAX_SAFE_INTEGER, total: 0 };
        actual.puntos += fila.puntos;
        actual.total += 1;
        if (fila.posicion < actual.puesto) actual.puesto = fila.posicion;
        puntosPorParticipante.set(fila.participante_id, actual);
      }
    }

    const entrada = puntosPorParticipante.get(participanteId);
    posiciones.push({
      competencia_id: competenciaId,
      competencia_nombre: nombrePorCompetencia.get(competenciaId) || '',
      posicion: entrada?.puesto === Number.MAX_SAFE_INTEGER ? null : (entrada?.puesto ?? null),
      puntos_total: entrada?.puntos ?? 0,
      total_participantes: puntosPorParticipante.size,
    });
  }

  return posiciones;
}
