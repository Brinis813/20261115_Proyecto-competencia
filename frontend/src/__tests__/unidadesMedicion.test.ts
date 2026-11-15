import { describe, it, expect } from 'vitest';
import { formatoCrono, unidadParaTipo } from '../utils/unidadesMedicion';

describe('formatoCrono', () => {
  it('segundos a MM:SS', () => {
    expect(formatoCrono(0)).toBe('00:00');
    expect(formatoCrono(59)).toBe('00:59');
    expect(formatoCrono(60)).toBe('01:00');
    expect(formatoCrono(120)).toBe('02:00');
    expect(formatoCrono(134)).toBe('02:14');
    expect(formatoCrono(3600)).toBe('60:00');
  });

  it('negativos y fracciones se sanean', () => {
    expect(formatoCrono(-5)).toBe('00:00');
    expect(formatoCrono(59.9)).toBe('00:59');
  });
});

describe('unidadParaTipo', () => {
  it('tabla tipo → unidad', () => {
    expect(unidadParaTipo('repeticiones')).toBe('reps');
    expect(unidadParaTipo(undefined)).toBe('reps');
    expect(unidadParaTipo('peso')).toBe('kg');
    expect(unidadParaTipo('distancia')).toBe('m');
    expect(unidadParaTipo('distancia', 'km')).toBe('km');
    expect(unidadParaTipo('calorías')).toBe('kcal');
    expect(unidadParaTipo('calorías', 'm', 'cal')).toBe('cal');
    expect(unidadParaTipo('tiempo')).toBe('seg');
  });
});
