import type { TipoMedicion, UnidadDistancia } from '../types';

/** Segundos a MM:SS (minutos) para movimientos medidos por tiempo. */
export function formatoCrono(seg: number): string {
  const total = Math.max(0, Math.floor(seg));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Unidad visible según la medición del movimiento. */
export function unidadParaTipo(
  tipo?: TipoMedicion,
  unidadDistancia?: UnidadDistancia,
  unidadEnergia?: 'kcal' | 'cal'
): string {
  switch (tipo) {
    case 'peso':
      return 'kg';
    case 'distancia':
      return unidadDistancia ?? 'm';
    case 'calorías':
      return unidadEnergia ?? 'kcal';
    case 'tiempo':
      return 'seg';
    case 'repeticiones':
    default:
      return 'reps';
  }
}
