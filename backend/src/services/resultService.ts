import { Resultado, Wod, Participante, Competencia, AuditLog, ResultHistory } from '../models';
import ResultadoSplit from '../models/ResultadoSplit';
import type { Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { broadcastLeaderboard } from '../sockets/handlers';
import { invalidateLeaderboardCache } from './scoring/leaderboard';
import { invalidateEventoLeaderboard } from './scoring/eventoLeaderboard';
import type { DetalleMedicion, SplitRegistro } from '../types/medicion';

/** Persiste splits dentro de una tx existente (reemplaza anteriores). */
async function persistirSplits(
  resultadoId: number,
  splits: SplitRegistro[],
  t: Transaction,
): Promise<void> {
  await ResultadoSplit.destroy({ where: { resultado_id: resultadoId }, transaction: t });
  await ResultadoSplit.bulkCreate(
    splits.map((s) => ({
      resultado_id: resultadoId,
      segmento_numero: s.segmento_numero,
      segmento_nombre: s.segmento_nombre,
      tiempo_acumulado_ms: s.tiempo_acumulado_ms,
      tiempo_parcial_ms: s.tiempo_parcial_ms,
    })),
    { transaction: t },
  );
}

export async function saveResult(data: {
  participante_id: number;
  wod_id: number;
  juez_id: number;
  valor_bruto: string;
  abandono?: boolean;
  capado?: boolean;
  disqualificado?: boolean;
  detalle?: DetalleMedicion | null;
  desempate?: number | null;
  es_desempate?: boolean;
  /** Splits HYROX: se persisten en la MISMA tx que el resultado. */
  splits?: SplitRegistro[];
}) {
  const wod = await Wod.findByPk(data.wod_id);
  if (!wod) throw new Error('WOD no encontrado');

  // Transacción: resultado + historial + auditoría son atómicos. Si el
  // broadcast falla, el dato ya está persistido (el leaderboard se recalcula).
  const resultado = await sequelize.transaction(async (t) => {
    const creado = await Resultado.create(
      {
        participante_id: data.participante_id,
        wod_id: data.wod_id,
        juez_id: data.juez_id,
        valor_bruto: data.valor_bruto,
        // Los puntos los calcula el motor de puntuacion al construir la
        // clasificacion, porque dependen de la posicion frente al resto.
        puntos_calculados: 0,
        abandono: data.abandono || false,
        capado: data.capado || false,
        disqualificado: data.disqualificado || false,
        detalle: data.detalle ?? null,
        desempate: data.desempate ?? null,
        es_desempate: data.es_desempate || false,
        timestamp_servidor: new Date(),
      },
      { transaction: t },
    );

    await ResultHistory.create(
      {
        resultado_id: creado.id,
        participante_id: data.participante_id,
        wod_id: data.wod_id,
        juez_id: data.juez_id,
        valor_bruto: data.valor_bruto,
        accion: 'creado',
      },
      { transaction: t },
    );

    await AuditLog.create(
      {
        accion: 'resultado.creado',
        entidad: 'resultados',
        entidad_id: creado.id,
        usuario_id: data.juez_id,
        evento_id:
          (
            (await Competencia.findByPk(wod.competencia_id, {
              attributes: ['evento_id'],
              transaction: t,
            })) as unknown as { evento_id: number | null } | null
          )?.evento_id ?? null,
        detalle: { participante_id: data.participante_id, wod_id: data.wod_id },
      },
      { transaction: t },
    );

    // Splits en la misma tx: un fallo aquí revierte tambien el resultado
    // (antes corrian en tx separada tras el broadcast y dejaban huerfanos).
    if (data.splits && data.splits.length > 0) {
      await persistirSplits(creado.id, data.splits, t);
    }

    return creado;
  });

  // Empuja la clasificacion recalculada a todos los clientes de la competencia.
  // Se invalida antes de difundir: tras un reset sin cambios de puntos la
  // caché de 2 s quedaria stale.
  invalidateLeaderboardCache(wod.competencia_id);
  invalidateEventoLeaderboard();
  await broadcastLeaderboard(wod.competencia_id, resultado);

  return resultado;
}

/** Elimina la medicion de un participante en un WOD y refresca la clasificacion. */
export async function resetResult(participanteId: number, wodId: number, juezId?: number) {
  const wod = await Wod.findByPk(wodId);
  if (!wod) throw new Error('WOD no encontrado');

  const eliminados = await sequelize.transaction(async (t) => {
    const n = await Resultado.destroy({
      where: { participante_id: participanteId, wod_id: wodId },
      transaction: t,
    });
    if (n === 0) throw new Error('No se encontro un resultado para resetear');

    await ResultHistory.create(
      {
        resultado_id: null,
        participante_id: participanteId,
        wod_id: wodId,
        juez_id: juezId ?? 0,
        valor_bruto: null,
        accion: 'reseteado',
      },
      { transaction: t },
    );
    return n;
  });

  invalidateLeaderboardCache(wod.competencia_id);
  invalidateEventoLeaderboard();
  await broadcastLeaderboard(wod.competencia_id);
  return eliminados;
}

export async function getResultsByParticipant(participanteId: number) {
  return Resultado.findAll({
    where: { participante_id: participanteId },
    include: [
      {
        model: Wod,
        attributes: [
          'id',
          'nombre_ejercicio',
          'tipo_medicion',
          'unidad_distancia',
          'imagen_url',
          'orden',
          'competencia_id',
        ],
      },
    ],
    order: [['created_at', 'DESC']],
  });
}

export async function getResultsByCompetencia(competenciaId: number) {
  const wods = await Wod.findAll({ where: { competencia_id: competenciaId } });
  if (wods.length === 0) return [];

  return Resultado.findAll({
    where: { wod_id: wods.map((c) => c.id) },
    include: [
      { model: Participante, attributes: ['id', 'nombre', 'apellidos', 'cedula', 'categoria'] },
      {
        model: Wod,
        attributes: ['id', 'nombre_ejercicio', 'tipo_medicion', 'unidad_distancia', 'imagen_url'],
      },
    ],
  });
}

/**
 * Guarda los splits (segmentos de tiempo) para un resultado.
 * Se usa en HYROX y otros formatos de múltiples etapas.
 * Usa transacción para evitar pérdida de datos si bulkCreate falla después de destroy.
 */
export async function saveSplits(resultadoId: number, splits: SplitRegistro[] | undefined) {
  if (!splits || splits.length === 0) return;

  await sequelize.transaction(async (t) => {
    await persistirSplits(resultadoId, splits, t);
  });
}

/**
 * Obtiene los splits de un resultado.
 */
export async function getSplits(resultadoId: number) {
  return await ResultadoSplit.findAll({
    where: { resultado_id: resultadoId },
    order: [['segmento_numero', 'ASC']],
  });
}
