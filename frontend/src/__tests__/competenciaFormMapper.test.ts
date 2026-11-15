import { describe, it, expect } from 'vitest';
import {
  aEsquema,
  esquemaDesdeUI,
  movimientoVacio,
  objetivoDeMovimiento,
  wodVacio,
  type WodUI,
} from '../utils/competenciaFormMapper';

function wodBase(parche: Partial<WodUI> = {}): WodUI {
  const w = wodVacio();
  return { ...w, ...parche };
}

describe('objetivoDeMovimiento', () => {
  it('tabla por medición', () => {
    const m = movimientoVacio();
    expect(objetivoDeMovimiento({ ...m, tipo_medicion: 'repeticiones', repeticiones: 21 })).toBe(21);
    expect(objetivoDeMovimiento({ ...m, tipo_medicion: 'calorías', calorias: 15 })).toBe(15);
    expect(objetivoDeMovimiento({ ...m, tipo_medicion: 'distancia', distancia: 500 })).toBe(500);
    expect(objetivoDeMovimiento({ ...m, tipo_medicion: 'peso', intentos: 3 })).toBe(3);
    expect(objetivoDeMovimiento({ ...m, tipo_medicion: 'tiempo', duracionSeg: 120 })).toBe(120);
  });

  it('sanea negativos y no numéricos a 0', () => {
    const m = movimientoVacio();
    expect(objetivoDeMovimiento({ ...m, tipo_medicion: 'repeticiones', repeticiones: -4 })).toBe(0);
    expect(objetivoDeMovimiento({ ...m, tipo_medicion: 'calorías', calorias: Number.NaN })).toBe(0);
  });
});

describe('esquemaDesdeUI', () => {
  it('repeticiones → amrap con reps por división', () => {
    const w = wodBase({
      medicion: 'repeticiones',
      movimientosPorCategoria: {
        General: [{ ...movimientoVacio(), nombre: 'Flexiones', repeticiones: 20 }],
      },
    });
    const esquema = esquemaDesdeUI(w, ['General']);
    expect(esquema?.modalidad).toBe('amrap');
    expect(esquema?.movimientos?.[0]).toMatchObject({ nombre: 'Flexiones', reps: { General: 20 } });
    expect(esquema?.movimientos_por_division?.General?.[0].reps).toEqual({ General: 20 });
  });

  it('calorías → amrap con unidad de energía', () => {
    const w = wodBase({
      medicion: 'calorías',
      movimientosPorCategoria: {
        General: [{ ...movimientoVacio(), nombre: 'Remo', tipo_medicion: 'calorías', calorias: 15 }],
      },
    });
    const esquema = esquemaDesdeUI(w, ['General']);
    expect(esquema?.modalidad).toBe('amrap');
    expect(esquema?.movimientos?.[0]).toMatchObject({ calorias: 15, unidad_energia: 'kcal' });
  });

  it('distancia con meta → for_time informativo sin scorecard', () => {
    const w = wodBase({ medicion: 'distancia', distancias: { General: 500 } });
    expect(esquemaDesdeUI(w, ['General'])).toMatchObject({
      modalidad: 'for_time',
      distancia_meta: { General: 500 },
    });
  });

  it('distancia sin meta → null (captura simple)', () => {
    expect(esquemaDesdeUI(wodBase({ medicion: 'distancia' }), ['General'])).toBeNull();
  });

  it('peso → max_load con intentos acotados', () => {
    expect(esquemaDesdeUI(wodBase({ medicion: 'peso', intentos: 99 }), ['General'])).toMatchObject({
      modalidad: 'max_load',
      intentos: 20,
    });
  });

  it('splits → time_trial_splits vacío', () => {
    expect(esquemaDesdeUI(wodBase({ medicion: 'time_trial_splits' }), ['General'])).toMatchObject({
      modalidad: 'time_trial_splits',
    });
  });

  it('filas sin nombre se descartan; sin filas → null', () => {
    const w = wodBase({
      movimientosPorCategoria: { General: [{ ...movimientoVacio(), nombre: '   ' }] },
    });
    expect(esquemaDesdeUI(w, ['General'])).toBeNull();
  });

  it('peso del movimiento solo viaja con conPeso y carga > 0', () => {
    const mov = { ...movimientoVacio(), nombre: 'Sentadilla', repeticiones: 10, peso: 60 };
    expect(aEsquema(mov, 'General', false)).not.toHaveProperty('peso');
    expect(aEsquema(mov, 'General', true)).toMatchObject({ peso: { General: 60 } });
  });

  it('wodVacio/movimientoVacio traen valores saneados', () => {
    expect(wodVacio().puntaje_maximo).toBe(100);
    expect(movimientoVacio().intentos).toBe(3);
  });
});
