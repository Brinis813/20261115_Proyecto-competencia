import { Competencia, Arranque } from '../models';
import { sequelize } from '../config/database';
import type { ModoArranque, EstadoArranque } from '../models/Arranque';

/**
 * Arranque sincronizado de cronómetros.
 *
 * Idea central: ningún modo arranca "al llegar el mensaje". Todos fijan un
 * `t0` futuro en el reloj del servidor y lo difunden; cada juez programa su
 * arranque contra ese instante usando su offset medido. Solo cambia CÓMO se
 * elige `t0`:
 * - directo: ahora + colchón (absorbe la latencia de red).
 * - cuenta_regresiva: ahora + N segundos.
 * - manual_juez: sin t0 (cada juez lo fija con su dedo, offline-friendly).
 * - programado: hora exacta elegida por el admin.
 */

export type { ModoArranque, EstadoArranque };

/** Payload del evento `competencia:start` (también lo devuelve GET /competencias/:id/arranque). */
export interface CompetenciaStartPayload {
  competenciaId: number;
  eventoId: number | null;
  tipoArranque: ModoArranque;
  estado: EstadoArranque;
  /** Instante de arranque, epoch ms del SERVIDOR. null = modo manual. */
  startTimeServer: number | null;
  /** Reloj del servidor al emitir: offset gratis en una sola ida. */
  serverNow: number;
  /** Si está pausado, instante de la pausa (para mostrar "congelado en MM:SS"). */
  pausadoEnMs: number | null;
  /** Total acumulado en pausa (ms), auditoría. */
  pausaAcumuladaMs: number;
  duracionMinutos: number | null;
  /** Derivado: duracionMinutos * 60000. null = sin tope. */
  timeCapMs: number | null;
  rondas: number;
  countdownSeg: number | null;
  programadoParaMs: number | null;
  /** Monotónica: el cliente descarta eventos con version vieja. */
  version: number;
}

/** Colchón del arranque directo: por encima de la peor latencia esperada. */
const COLCHON_DIRECTO_MS = 1500;

function snapshot(fila: Arranque, competencia: Competencia): CompetenciaStartPayload {
  // BIGINT puede volver como string según el driver: se normaliza a number.
  const t0 = fila.t0_ms == null ? null : Number(fila.t0_ms);
  const programado = fila.programado_para_ms == null ? null : Number(fila.programado_para_ms);
  const pausadoEn = fila.pausado_en_ms == null ? null : Number(fila.pausado_en_ms);
  const duracion = fila.duracion_minutos ?? competencia.duracion_minutos ?? null;
  return {
    competenciaId: fila.competencia_id,
    eventoId: fila.evento_id,
    tipoArranque: fila.modo,
    estado: fila.estado,
    startTimeServer: t0,
    serverNow: Date.now(),
    pausadoEnMs: pausadoEn,
    pausaAcumuladaMs: fila.pausa_acumulada_ms ?? 0,
    duracionMinutos: duracion,
    timeCapMs: duracion != null ? duracion * 60_000 : null,
    rondas: fila.rondas,
    countdownSeg: fila.countdown_seg,
    programadoParaMs: programado,
    version: fila.version,
  };
}

/** Último arranque de la competencia (o null si nunca se armó). Lo lee un juez al reconectar. */
export async function obtenerSnapshot(
  competenciaId: number,
): Promise<CompetenciaStartPayload | null> {
  const [fila, competencia] = await Promise.all([
    Arranque.findOne({ where: { competencia_id: competenciaId }, order: [['id', 'DESC']] }),
    Competencia.findByPk(competenciaId),
  ]);
  if (!fila || !competencia) return null;
  return snapshot(fila, competencia);
}

export async function programarArranque(
  competenciaId: number,
  input: { modo: ModoArranque; countdownSeg?: number; programadoParaMs?: number },
  usuarioId: number,
): Promise<CompetenciaStartPayload> {
  const competencia = await Competencia.findByPk(competenciaId);
  if (!competencia) throw new Error('Competencia no encontrado');
  const ahora = Date.now();

  let t0: number | null;
  let estado: EstadoArranque;
  let countdown: number | null = null;
  if (input.modo === 'directo') {
    t0 = ahora + COLCHON_DIRECTO_MS;
    estado = 'en_curso';
  } else if (input.modo === 'cuenta_regresiva') {
    countdown = Math.min(60, Math.max(3, Math.round(input.countdownSeg ?? 10)));
    t0 = ahora + countdown * 1000;
    estado = 'cuenta_regresiva';
  } else if (input.modo === 'programado') {
    const objetivo = Number(input.programadoParaMs);
    if (!Number.isFinite(objetivo) || objetivo < ahora + 30_000) {
      throw new Error('Programa con al menos 30 segundos de antelación');
    }
    t0 = objetivo;
    estado = 'armado';
  } else {
    t0 = null;
    estado = 'armado';
  }

  // Creación + poda en una sola transacción: dos "armar" concurrentes
  // (doble clic) ya no dejan la poda a medias ni dos vigentes a medio
  // escribir. El cálculo de t0 y el snapshot son idénticos.
  const fila = await sequelize.transaction(async (t) => {
    const creada = await Arranque.create(
      {
        competencia_id: competenciaId,
        evento_id: competencia.evento_id,
        modo: input.modo,
        estado,
        t0_ms: t0,
        countdown_seg: countdown,
        programado_para_ms: input.modo === 'programado' ? t0 : null,
        duracion_minutos: competencia.duracion_minutos,
        rondas: Number((competencia as unknown as Record<string, unknown>).rondas) || 1,
        version: 1,
        creado_por: usuarioId,
      },
      { transaction: t },
    );

    // Poda: el historial solo sirve para auditar lo reciente; se conservan los
    // últimos 10 arranques de la competencia para que armar en bucle no infle la tabla.
    const anteriores = await Arranque.findAll({
      where: { competencia_id: competenciaId },
      attributes: ['id'],
      order: [['id', 'DESC']],
      offset: 10,
      transaction: t,
    });
    if (anteriores.length > 0) {
      await Arranque.destroy({ where: { id: anteriores.map((a) => a.id) }, transaction: t });
    }
    return creada;
  });

  return snapshot(fila, competencia);
}

/** Cancela o finaliza el último arranque (también se difunde a los jueces). */
export async function cambiarEstado(
  competenciaId: number,
  estado: Extract<EstadoArranque, 'finalizado' | 'cancelado'>,
): Promise<CompetenciaStartPayload | null> {
  const fila = await Arranque.findOne({
    where: { competencia_id: competenciaId },
    order: [['id', 'DESC']],
  });
  if (!fila) return null;
  await fila.update({ estado, version: fila.version + 1 });
  const competencia = (await Competencia.findByPk(competenciaId))!;
  return snapshot(fila, competencia);
}

/**
 * PAUSA GLOBAL: congela los cronómetros en el segundo actual.
 * Guarda el instante de la pausa; al reanudar se desplaza t0 hacia adelante
 * por lo que duró, así `elapsed = serverNow - t0` sigue valiendo sin casos
 * especiales (la re-sincronización no necesita saber de pausas).
 */
export async function pausarArranque(competenciaId: number): Promise<CompetenciaStartPayload> {
  const fila = await Arranque.findOne({
    where: { competencia_id: competenciaId },
    order: [['id', 'DESC']],
  });
  if (!fila) throw new Error('Esta competencia no tiene ningún arranque activo');
  if (fila.estado !== 'en_curso') throw new Error('Solo se puede pausar un heat en curso');
  // UPDATE condicional: dos pausas concurrentes (doble clic) solo aplican
  // una; la perdedora ve affectedRows=0 y recibe error en vez de pausar dos veces.
  const [afectadas] = await Arranque.update(
    { estado: 'pausado', pausado_en_ms: Date.now(), version: fila.version + 1 },
    { where: { id: fila.id, estado: 'en_curso' } },
  );
  if (afectadas === 0) throw new Error('El heat ya cambio de estado; recarga e intentalo de nuevo');
  await fila.reload();
  const competencia = (await Competencia.findByPk(competenciaId))!;
  return snapshot(fila, competencia);
}

/** Reanuda un heat pausado recalculando el desfase para mantener la sincronía. */
export async function reanudarArranque(competenciaId: number): Promise<CompetenciaStartPayload> {
  const fila = await Arranque.findOne({
    where: { competencia_id: competenciaId },
    order: [['id', 'DESC']],
  });
  if (!fila) throw new Error('Esta competencia no tiene ningún arranque activo');
  if (fila.estado !== 'pausado' || fila.pausado_en_ms == null) {
    throw new Error('El heat no está en pausa');
  }
  const ahora = Date.now();
  const enPausa = ahora - Number(fila.pausado_en_ms);
  // UPDATE condicional por el mismo motivo que en pausarArranque.
  const [afectadas] = await Arranque.update(
    {
      estado: 'en_curso',
      // El tiempo en pausa no cuenta: t0 se mueve hacia adelante.
      t0_ms: Number(fila.t0_ms) + enPausa,
      pausado_en_ms: null,
      pausa_acumulada_ms: (fila.pausa_acumulada_ms ?? 0) + enPausa,
      version: fila.version + 1,
    },
    { where: { id: fila.id, estado: 'pausado' } },
  );
  if (afectadas === 0) throw new Error('El heat ya cambio de estado; recarga e intentalo de nuevo');
  await fila.reload();
  const competencia = (await Competencia.findByPk(competenciaId))!;
  return snapshot(fila, competencia);
}
