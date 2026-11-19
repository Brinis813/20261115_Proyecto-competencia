import { Op } from 'sequelize';
import { Competencia } from '../../models';
import type { EventoTieBreakPolicy } from '../../models';
import type { EntradaLeaderboard } from './types';
import { getLeaderboard } from './leaderboard';

/**
 * Clasificación GLOBAL de un evento (multi-Competencia) según su scoring policy
 * y su política de desempate.
 *
 * - POINTS_ACCUMULATION: suma `puntos_total` de cada competencia activo (no borrador)
 *   por atleta, ordena de mayor a menor y asigna puesto compartido en empates.
 * - WINNER_PER_Competencia: no hay total global; devuelve un ranking por Competencia con su
 *   ganador (puesto 1) marcado.
 *
 * Desempate global (solo si hay empate en el acumulado):
 * - NONE: mismo puntaje = mismo puesto, sin más criterios.
 * - BEST_INDIVIDUAL_RANK: más 1.os puestos en Competencias, luego 2.os, 3.os...
 * - DESIGNATED_TIEBREAK_Competencia: mejor puesto en la competencia designado.
 * - LAST_Competencia_SCORE: mejor puesto en el último Competencia disputado.
 *
 * `categoria` filtra por etiqueta exacta (ej. "RX Masculino"); ausente = todas.
 */
const eventoCache = new Map<
  string,
  { data: Awaited<ReturnType<typeof armarEventoLeaderboard>>; expires: number }
>();
const EVENTO_TTL_MS = 5_000;
const EVENTO_CACHE_MAX = 100;

export async function getEventoLeaderboard(eventoId: number, categoria?: string | null) {
  const clave = `${eventoId}|${categoria ?? ''}`;
  const hit = eventoCache.get(clave);
  // LRU real: el hit se re-inserta para renovar su antigüedad.
  if (hit && hit.expires > Date.now()) {
    eventoCache.delete(clave);
    eventoCache.set(clave, hit);
    return hit.data;
  }

  const data = await armarEventoLeaderboard(eventoId, categoria);

  if (eventoCache.size >= EVENTO_CACHE_MAX) {
    const masVieja = eventoCache.keys().next();
    if (!masVieja.done) eventoCache.delete(masVieja.value);
  }
  eventoCache.set(clave, { data, expires: Date.now() + EVENTO_TTL_MS });
  return data;
}

/** Quiebra la caché del evento (tras guardar/resetear o cambiar su config). */
export function invalidateEventoLeaderboard(eventoId?: number) {
  if (eventoId == null) {
    eventoCache.clear();
    return;
  }
  for (const clave of eventoCache.keys()) {
    if (clave === `${eventoId}|` || clave.startsWith(`${eventoId}|`)) eventoCache.delete(clave);
  }
}

async function armarEventoLeaderboard(eventoId: number, categoria?: string | null) {
  const { Evento } = await import('../../models');
  const evento = await Evento.findByPk(eventoId);
  if (!evento) throw new Error('Evento no encontrada');
  const scoringType: 'POINTS_ACCUMULATION' | 'WINNER_PER_Competencia' = (evento.scoring_type ??
    'POINTS_ACCUMULATION') as 'POINTS_ACCUMULATION' | 'WINNER_PER_Competencia';
  const tiebreakPolicy: EventoTieBreakPolicy = evento.tiebreak_policy ?? 'BEST_INDIVIDUAL_RANK';
  const tiebreakCompetenciaId: number | null = evento.tiebreak_competencia_id ?? null;

  const competencias = await Competencia.findAll({
    where: { evento_id: eventoId, estado: { [Op.ne]: 'borrador' } },
    order: [['id', 'ASC']],
  });

  // Rankings por Competencia con el motor existente (respeta DNF/DSQ/capados/desempates).
  // Paralelizar para reducir latencia: con 5 competencias, ~25 queries en paralelo en vez de secuenciales.
  const leaderboardPromises = competencias.map(async (w) => {
    const lb = await getLeaderboard(w.id);
    const filtrado = categoria
      ? lb.leaderboard.filter((e) => e.categoria === categoria)
      : lb.leaderboard;
    return {
      competencia: { id: w.id, nombre: w.nombre },
      leaderboard: filtrado,
      ganador: filtrado[0] ?? null,
    };
  });
  const porCompetencia = await Promise.all(leaderboardPromises);

  if (scoringType === 'WINNER_PER_Competencia') {
    return {
      evento: {
        id: evento.id,
        nombre: evento.nombre,
        scoringType,
        tiebreakPolicy,
        tiebreakCompetenciaId,
      },
      general: null,
      porCompetencia,
      actualizado: new Date().toISOString(),
    };
  }

  // POINTS_ACCUMULATION: acumular puntos a través de las competencias, guardando el
  // puesto de cada atleta en cada competencia para las políticas de desempate.
  const INF = Number.MAX_SAFE_INTEGER;
  const acumulado = new Map<
    number,
    {
      entrada: EntradaLeaderboard;
      puntos_total: number;
      competencias_completadas: number;
      puestos_por_competencia: Map<number, number>;
      cuenta_primeros: [number, number, number];
    }
  >();
  for (const p of porCompetencia) {
    for (const e of p.leaderboard) {
      const actual = acumulado.get(e.participante_id) ?? {
        entrada: { ...e, resultados: [], wods_completados: 0, puntos_total: 0, puesto: 0 },
        puntos_total: 0,
        competencias_completadas: 0,
        puestos_por_competencia: new Map<number, number>(),
        cuenta_primeros: [0, 0, 0] as [number, number, number],
      };
      actual.puntos_total += e.puntos_total;
      actual.competencias_completadas += 1;
      actual.entrada.wods_completados += e.wods_completados;
      if (e.puesto > 0) {
        actual.puestos_por_competencia.set(p.competencia.id, e.puesto);
        if (e.puesto <= 3) actual.cuenta_primeros[e.puesto - 1] += 1;
      }
      acumulado.set(e.participante_id, actual);
    }
  }

  const ultimoCompetenciaId =
    porCompetencia.length > 0 ? porCompetencia[porCompetencia.length - 1].competencia.id : -1;

  const general = [...acumulado.values()].map((a) => ({
    ...a.entrada,
    puntos_total: a.puntos_total,
    wods_completados: a.entrada.wods_completados,
    puesto: 0,
    comparte_puesto: false,
    _competencias: a.competencias_completadas,
    _puestos: a.puestos_por_competencia,
    _cuenta: a.cuenta_primeros,
  }));

  const puestoEn = (g: (typeof general)[number], competenciaId: number): number =>
    g._puestos.get(competenciaId) ?? INF;

  general.sort((a, b) => {
    if (b.puntos_total !== a.puntos_total) return b.puntos_total - a.puntos_total;

    if (tiebreakPolicy === 'NONE') {
      return `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`);
    }
    if (tiebreakPolicy === 'DESIGNATED_TIEBREAK_Competencia' && tiebreakCompetenciaId) {
      const pa = puestoEn(a, tiebreakCompetenciaId);
      const pb = puestoEn(b, tiebreakCompetenciaId);
      if (pa !== pb) return pa - pb;
    }
    if (tiebreakPolicy === 'LAST_Competencia_SCORE' && ultimoCompetenciaId > 0) {
      const pa = puestoEn(a, ultimoCompetenciaId);
      const pb = puestoEn(b, ultimoCompetenciaId);
      if (pa !== pb) return pa - pb;
    }
    if (tiebreakPolicy === 'BEST_INDIVIDUAL_RANK') {
      for (let i = 0; i < 3; i++) {
        if (b._cuenta[i] !== a._cuenta[i]) return b._cuenta[i] - a._cuenta[i];
      }
    }
    // Secundario comun: mas Competencias completados; luego alfabético estable.
    if (b._competencias !== a._competencias) return b._competencias - a._competencias;
    return `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`);
  });

  // Puesto compartido si empatan en puntos Y en toda la cadena de desempate.
  const mismaLinea = (a: (typeof general)[number], b: (typeof general)[number]): boolean => {
    if (a.puntos_total !== b.puntos_total) return false;
    if (tiebreakPolicy === 'NONE') return true;
    if (tiebreakPolicy === 'DESIGNATED_TIEBREAK_Competencia' && tiebreakCompetenciaId) {
      if (puestoEn(a, tiebreakCompetenciaId) !== puestoEn(b, tiebreakCompetenciaId)) return false;
    }
    if (tiebreakPolicy === 'LAST_Competencia_SCORE' && ultimoCompetenciaId > 0) {
      if (puestoEn(a, ultimoCompetenciaId) !== puestoEn(b, ultimoCompetenciaId)) return false;
    }
    if (tiebreakPolicy === 'BEST_INDIVIDUAL_RANK') {
      for (let i = 0; i < 3; i++) if (a._cuenta[i] !== b._cuenta[i]) return false;
    }
    return a._competencias === b._competencias;
  };

  let puesto = 0;
  general.forEach((entrada, indice) => {
    if (indice === 0 || !mismaLinea(entrada, general[indice - 1])) {
      puesto = indice + 1;
    }
    entrada.puesto = puesto;
  });
  const vistos = new Map<number, number>();
  for (const e of general) vistos.set(e.puesto, (vistos.get(e.puesto) ?? 0) + 1);
  for (const e of general) {
    e.comparte_puesto = (vistos.get(e.puesto) ?? 0) > 1;
  }
  // Proyección limpia en vez de `delete`: mismo JSON sin mutar ni `as any`.
  // (Los destructurados con `_` los ignora noUnusedLocals.)
  const generalLimpio = general.map(({ _competencias, _puestos, _cuenta, ...limpia }) => limpia);

  return {
    evento: {
      id: evento.id,
      nombre: evento.nombre,
      scoringType,
      tiebreakPolicy,
      tiebreakCompetenciaId,
    },
    general: generalLimpio,
    porCompetencia,
    actualizado: new Date().toISOString(),
  };
}
