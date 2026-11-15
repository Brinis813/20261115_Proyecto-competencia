import type { TipoMedicion } from './types';

/** Los tiempos son "mejor cuanto menor"; reps/peso/distancia/calorías, "mejor cuanto mayor". */
export function menorEsMejor(tipo: TipoMedicion): boolean {
  return tipo === 'tiempo' || tipo === 'time_trial_splits';
}

/** Interpreta un valor bruto como numero simple (reps hechas en un capado, etc.). */
export function parsearNumero(valorBruto: string): number {
  const numero = parseFloat(String(valorBruto).replace(',', '.'));
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Convierte un valor bruto a numero comparable.
 *
 * Para tiempo se admite `MM:SS`, `MM:SS.CS` y `MM:SS:CS`, siempre en
 * milisegundos. No hay tramo de horas: `03:20:50` seria ambiguo (¿3 h 20 min
 * 50 s o 3 min 20 s 50 cs?), asi que un WOD de mas de una hora se anota
 * con los minutos por encima de 60, por ejemplo `75:30`.
 *
 * El resto de tipos se interpreta como numero decimal.
 */
export function parsearValor(valorBruto: string, tipo: TipoMedicion): number {
  if (tipo !== 'tiempo') {
    const numero = parseFloat(String(valorBruto).replace(',', '.'));
    return Number.isFinite(numero) ? numero : 0;
  }

  const limpio = String(valorBruto).trim().replace(',', '.');
  const partes = limpio.split(':');

  const seguro = (valor: number) => (Number.isFinite(valor) ? valor : 0);

  if (partes.length === 3) {
    // MM:SS:CS
    return (
      seguro(parseInt(partes[0], 10)) * 60000 +
      seguro(parseInt(partes[1], 10)) * 1000 +
      Math.round(seguro(parseFloat(partes[2])) * 10)
    );
  }

  if (partes.length === 2) {
    // MM:SS o MM:SS.CS
    return seguro(parseInt(partes[0], 10)) * 60000 + Math.round(seguro(parseFloat(partes[1])) * 1000);
  }

  // Un unico numero se interpreta como segundos. Si no es numerico, el valor
  // se manda al final del ranking en vez de contaminarlo con un NaN.
  const segundos = parseFloat(limpio);
  return Number.isFinite(segundos) ? segundos * 1000 : Number.MAX_SAFE_INTEGER;
}

/**
 * Extrae el tiempo total de un arreglo de splits.
 * Para time_trial_splits (HYROX), el tiempo total es el tiempo acumulado del último segmento.
 */
export function obtenerTiempoTotalDeSplits(splits: Array<{ tiempo_acumulado_ms: number }>): number {
  if (!splits || splits.length === 0) return 0;
  return splits[splits.length - 1].tiempo_acumulado_ms;
}

/**
 * Extrae el tiempo de desempate (segmento más rápido) de los splits.
 * Sirve para romper empates de tiempo total en HYROX.
 */
export function obtenerTiempoDesempateDeSplits(
  splits: Array<{ tiempo_parcial_ms: number }>
): number {
  if (!splits || splits.length === 0) return 0;
  return Math.min(...splits.map((s) => s.tiempo_parcial_ms));
}
