import {
  DIVISION_GENERAL,
  type DetalleMedicion,
  type MovimientoEsquema,
  type SplitRegistro,
} from '../types';
import type { MovimientoObjetivo } from '../components/judge/ContadorEsquema';

/** Segundos que suma cada repeticion invalidada en una prueba de tiempo. */
export const PENALIZACION_NO_REP_SEG = 5;

/** Segundos a MM:SS para mostrar el tope de tiempo. */
export function formatoTope(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Milisegundos a MM:SS.CS, igual que el cronómetro del juez. */
export function formatearCrono(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/** MM:SS o MM:SS.CS -> milisegundos (para enviar la marca de desempate). */
export function tiempoAms(t: string | null): number | null {
  if (!t) return null;
  const [mmss, cs = ''] = t.trim().split('.');
  const [mm, ss] = mmss.split(':').map((n) => parseInt(n, 10));
  const ms =
    ((mm || 0) * 60 + (ss || 0)) * 1000 +
    (cs ? parseInt(cs.padEnd(2, '0').slice(0, 2), 10) * 10 : 0);
  return Number.isFinite(ms) ? ms : null;
}

/** Elige la division del atleta (por su categoria) dentro de las de la competencia. */
export function resolverDivision(
  categoria: string | null | undefined,
  divisiones: string[] | null | undefined,
): string {
  const divs = divisiones ?? [];
  if (divs.length === 0) return DIVISION_GENERAL;
  const c = (categoria ?? '').trim().toLowerCase();
  return divs.find((d) => d.toLowerCase() === c) ?? divs[0];
}

/**
 * Rondas efectivas de la medicion: las de la competencia mandan; en
 * Competencias anteriores a la columna se hereda el esquema.
 */
export function rondasEfectivasMedicion(
  rondasCompetencia: number | null | undefined,
  rondasEsquema: number | null | undefined,
): number {
  const directa = Number(rondasCompetencia);
  if (Number.isFinite(directa) && directa >= 1) return Math.min(100, Math.round(directa));
  const vieja = Number(rondasEsquema);
  if (Number.isFinite(vieja) && vieja >= 1) return Math.min(100, Math.round(vieja));
  return 1;
}

/** Mejor levantamiento valido entre los intentos de peso. */
export function mejorPesoDeIntentos(intentos: Array<{ peso: number; valido: boolean }>): number {
  return intentos.filter((i) => i.valido).reduce((max, i) => Math.max(max, i.peso), 0);
}

/**
 * Objetivo por movimiento segun la division del atleta.
 * En For Time (tiempo) el objetivo es el trabajo total (reps x rondas);
 * en AMRAP es la referencia por ronda.
 */
export function construirMovObjetivo(
  movimientos: MovimientoEsquema[],
  division: string,
  esTiempo: boolean,
  rondas: number,
): MovimientoObjetivo[] {
  return movimientos.map((m) => ({
    nombre: m.nombre,
    objetivo: (m.reps?.[division] ?? m.reps?.[DIVISION_GENERAL] ?? 0) * (esTiempo ? rondas : 1),
    peso: m.peso?.[division] ?? m.peso?.[DIVISION_GENERAL] ?? 0,
    unidad_peso: m.unidad_peso ?? 'kg',
    tipo_medicion: m.tipo_medicion,
    unidad_distancia: m.unidad_distancia,
    distancia: m.distancia,
    duracion_seg: m.duracion_seg,
    calorias: m.calorias,
    unidad_energia: m.unidad_energia,
  }));
}

export interface EntradaValorBruto {
  abandono: boolean;
  esTiempo: boolean;
  modoCap: boolean;
  reps: number;
  elapsed: number;
  /** Tiempo final ya con penalizacion, formateado por el cronometro. */
  tiempoFinalFormateado: string;
  esPeso: boolean;
  mejorPeso: number;
  esSplits: boolean;
  splits: SplitRegistro[];
  esConteo: boolean;
  valorManual: string;
}

export type ResultadoValorBruto = { valorBruto: string; capado: boolean } | { error: string };

/**
 * Decide el valor bruto a enviar segun la fuente que corresponde a cada caso.
 * Nunca sale de un campo de texto libre en las pruebas de tiempo: lo fija el
 * reloj (mas las penalizaciones por no-rep).
 */
export function construirValorBruto(e: EntradaValorBruto): ResultadoValorBruto {
  const capado = !e.abandono && e.esTiempo && e.modoCap;

  if (e.abandono) {
    return { valorBruto: 'ABANDONO', capado: false };
  }
  if (capado) {
    if (e.reps <= 0) {
      return { error: 'Anota las repeticiones completadas antes del tope' };
    }
    return { valorBruto: String(e.reps), capado };
  }
  if (e.esTiempo) {
    if (e.elapsed <= 0) {
      return { error: 'Usa el cronometro para tomar el tiempo antes de enviar' };
    }
    return { valorBruto: e.tiempoFinalFormateado, capado };
  }
  if (e.esPeso) {
    if (e.mejorPeso <= 0) {
      return { error: 'Registra al menos un intento valido antes de enviar' };
    }
    return { valorBruto: String(e.mejorPeso), capado };
  }
  if (e.esSplits) {
    if (!e.splits || e.splits.length === 0) {
      return { error: 'Registra los tiempos de los segmentos antes de enviar' };
    }
    return { valorBruto: String(e.splits[e.splits.length - 1].tiempo_acumulado_ms), capado };
  }
  if (e.esConteo) {
    if (e.reps <= 0) {
      return { error: 'El contador esta a cero: anota las repeticiones antes de enviar' };
    }
    return { valorBruto: String(e.reps), capado };
  }
  if (!e.valorManual.trim()) {
    return { error: 'Introduce el resultado antes de enviar' };
  }
  return { valorBruto: e.valorManual.trim(), capado };
}

export interface EntradaDetalle {
  abandono: boolean;
  esPeso: boolean;
  intentos: Array<{ peso: number; valido: boolean }>;
  mejorPeso: number;
  esSplits: boolean;
  splits: SplitRegistro[];
  usaEsquema: boolean;
  esTiempo: boolean;
  division: string;
  movObjetivo: MovimientoObjetivo[];
  conteoEsquema: number[];
  totalEsquema: number;
  objetivoEsquema: number;
  rondasEsquema: number;
  capado: boolean;
  marcaManual?: Record<string, unknown>;
}

/** Desglose para auditar la medicion guiada (detalle del resultado). */
export function construirDetalle(e: EntradaDetalle): DetalleMedicion | undefined {
  const marcaManual = e.marcaManual ?? {};
  if (!e.abandono && e.esPeso && e.intentos.length > 0) {
    return {
      modalidad: 'max_load',
      intentos: e.intentos,
      mejor: e.mejorPeso,
      ...marcaManual,
    } as DetalleMedicion;
  }
  if (!e.abandono && e.esSplits) {
    return { modalidad: 'time_trial_splits', splits: e.splits, ...marcaManual } as DetalleMedicion;
  }
  if (!e.abandono && e.usaEsquema) {
    return {
      modalidad: e.esTiempo ? 'for_time' : 'amrap',
      division: e.division,
      movimientos: e.movObjetivo.map((m, i) => ({
        nombre: m.nombre,
        reps: e.conteoEsquema[i] || 0,
      })),
      total_reps: e.totalEsquema,
      rondas_completas:
        e.objetivoEsquema > 0
          ? Math.floor(e.totalEsquema / (e.objetivoEsquema / e.rondasEsquema))
          : undefined,
      finalizado: e.esTiempo ? !e.capado : undefined,
      ...marcaManual,
    } as DetalleMedicion;
  }
  return undefined;
}
