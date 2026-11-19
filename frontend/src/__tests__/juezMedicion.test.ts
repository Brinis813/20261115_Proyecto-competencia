import { describe, it, expect } from 'vitest';
import {
  PENALIZACION_NO_REP_SEG,
  formatoTope,
  formatearCrono,
  tiempoAms,
  resolverDivision,
  rondasEfectivasMedicion,
  mejorPesoDeIntentos,
  construirMovObjetivo,
  construirValorBruto,
  construirDetalle,
  type EntradaValorBruto,
} from '../utils/juezMedicion';

const baseValor: EntradaValorBruto = {
  abandono: false,
  esTiempo: false,
  modoCap: false,
  reps: 0,
  elapsed: 0,
  tiempoFinalFormateado: '05:00.00',
  esPeso: false,
  mejorPeso: 0,
  esSplits: false,
  splits: [],
  esConteo: false,
  valorManual: '',
};

describe('PENALIZACION_NO_REP_SEG', () => {
  it('vale 5 segundos', () => {
    expect(PENALIZACION_NO_REP_SEG).toBe(5);
  });
});

describe('formatoTope', () => {
  it('formatea segundos a MM:SS', () => {
    expect(formatoTope(0)).toBe('00:00');
    expect(formatoTope(65)).toBe('01:05');
    expect(formatoTope(600)).toBe('10:00');
  });
  it('soporta mas de una hora como minutos', () => {
    expect(formatoTope(4530)).toBe('75:30');
  });
});

describe('formatearCrono', () => {
  it('milisegundos a MM:SS.CS como el cronómetro', () => {
    expect(formatearCrono(0)).toBe('00:00.00');
    expect(formatearCrono(61050)).toBe('01:01.05');
    expect(formatearCrono(300000)).toBe('05:00.00');
  });
});

describe('tiempoAms', () => {
  it('retorna null sin entrada', () => {
    expect(tiempoAms(null)).toBeNull();
    expect(tiempoAms('')).toBeNull();
  });
  it('convierte MM:SS a ms', () => {
    expect(tiempoAms('05:00')).toBe(300000);
  });
  it('convierte MM:SS.CS con centesimas', () => {
    expect(tiempoAms('01:02.50')).toBe(62500);
    expect(tiempoAms('01:02.5')).toBe(62500);
  });
  it('tolera espacios', () => {
    expect(tiempoAms('  02:00  ')).toBe(120000);
  });
  it('texto no numerico se interpreta como cero (comportamiento actual)', () => {
    expect(tiempoAms('xx')).toBe(0);
  });
});

describe('resolverDivision', () => {
  it('retorna General sin divisiones', () => {
    expect(resolverDivision('RX', null)).toBe('General');
    expect(resolverDivision('RX', [])).toBe('General');
  });
  it('encuentra la division sin importar mayusculas ni espacios', () => {
    expect(resolverDivision('  rx ', ['RX', 'Scaled'])).toBe('RX');
  });
  it('cae a la primera si la categoria no coincide', () => {
    expect(resolverDivision('Desconocida', ['RX', 'Scaled'])).toBe('RX');
  });
  it('tolera categoria nula', () => {
    expect(resolverDivision(null, ['RX'])).toBe('RX');
  });
});

describe('rondasEfectivasMedicion', () => {
  it('usa las de la competencia y acota a 100', () => {
    expect(rondasEfectivasMedicion(3, 1)).toBe(3);
    expect(rondasEfectivasMedicion(250, 1)).toBe(100);
  });
  it('hereda el esquema en Competencias viejas y cae a 1', () => {
    expect(rondasEfectivasMedicion(null, 4)).toBe(4);
    expect(rondasEfectivasMedicion(undefined, undefined)).toBe(1);
    expect(rondasEfectivasMedicion(0, 0)).toBe(1);
  });
});

describe('mejorPesoDeIntentos', () => {
  it('retorna 0 sin intentos validos', () => {
    expect(mejorPesoDeIntentos([])).toBe(0);
    expect(mejorPesoDeIntentos([{ peso: 80, valido: false }])).toBe(0);
  });
  it('retorna el mejor valido', () => {
    expect(
      mejorPesoDeIntentos([
        { peso: 60, valido: true },
        { peso: 80, valido: true },
        { peso: 100, valido: false },
      ]),
    ).toBe(80);
  });
});

describe('construirMovObjetivo', () => {
  const movs = [
    {
      nombre: 'Thruster',
      reps: { RX: 10, General: 5 },
      peso: { RX: 40, General: 20 },
      unidad_peso: 'kg' as const,
    },
  ];
  it('multiplica por rondas en tiempo (for time)', () => {
    const res = construirMovObjetivo(movs, 'RX', true, 3);
    expect(res[0].objetivo).toBe(30);
    expect(res[0].peso).toBe(40);
  });
  it('no multiplica en amrap', () => {
    const res = construirMovObjetivo(movs, 'RX', false, 3);
    expect(res[0].objetivo).toBe(10);
  });
  it('cae a General y a 0 sin datos', () => {
    const res = construirMovObjetivo([{ nombre: 'Otro', reps: {} }], 'RX', true, 2);
    expect(res[0].objetivo).toBe(0);
    expect(res[0].peso).toBe(0);
    expect(res[0].unidad_peso).toBe('kg');
  });
  it('conserva campos opcionales del movimiento', () => {
    const res = construirMovObjetivo(
      [
        {
          nombre: 'Run',
          reps: { General: 1 },
          tipo_medicion: 'distancia' as const,
          unidad_distancia: 'm' as const,
          distancia: 400,
        },
      ],
      'General',
      false,
      1,
    );
    expect(res[0].tipo_medicion).toBe('distancia');
    expect(res[0].distancia).toBe(400);
  });
});

describe('construirValorBruto', () => {
  it('abandono siempre es ABANDONO', () => {
    expect(construirValorBruto({ ...baseValor, abandono: true, reps: 999 })).toEqual({
      valorBruto: 'ABANDONO',
      capado: false,
    });
  });
  it('capado usa reps y exige al menos una', () => {
    expect(construirValorBruto({ ...baseValor, esTiempo: true, modoCap: true, reps: 0 })).toEqual({
      error: 'Anota las repeticiones completadas antes del tope',
    });
    expect(construirValorBruto({ ...baseValor, esTiempo: true, modoCap: true, reps: 25 })).toEqual({
      valorBruto: '25',
      capado: true,
    });
  });
  it('tiempo exige cronometro y usa el tiempo final', () => {
    expect(construirValorBruto({ ...baseValor, esTiempo: true, elapsed: 0 })).toEqual({
      error: 'Usa el cronometro para tomar el tiempo antes de enviar',
    });
    expect(
      construirValorBruto({
        ...baseValor,
        esTiempo: true,
        elapsed: 1000,
        tiempoFinalFormateado: '01:40.00',
      }),
    ).toEqual({ valorBruto: '01:40.00', capado: false });
  });
  it('peso exige mejor intento', () => {
    expect(construirValorBruto({ ...baseValor, esPeso: true, mejorPeso: 0 })).toEqual({
      error: 'Registra al menos un intento valido antes de enviar',
    });
    expect(construirValorBruto({ ...baseValor, esPeso: true, mejorPeso: 80 })).toEqual({
      valorBruto: '80',
      capado: false,
    });
  });
  it('splits exige segmentos y usa el ultimo acumulado', () => {
    expect(construirValorBruto({ ...baseValor, esSplits: true, splits: [] })).toEqual({
      error: 'Registra los tiempos de los segmentos antes de enviar',
    });
    expect(
      construirValorBruto({
        ...baseValor,
        esSplits: true,
        splits: [
          {
            segmento_numero: 1,
            segmento_nombre: 'A',
            tiempo_acumulado_ms: 1000,
            tiempo_parcial_ms: 1000,
          },
          {
            segmento_numero: 2,
            segmento_nombre: 'B',
            tiempo_acumulado_ms: 2500,
            tiempo_parcial_ms: 1500,
          },
        ],
      }),
    ).toEqual({ valorBruto: '2500', capado: false });
  });
  it('conteo exige reps', () => {
    expect(construirValorBruto({ ...baseValor, esConteo: true, reps: 0 })).toEqual({
      error: 'El contador esta a cero: anota las repeticiones antes de enviar',
    });
    expect(construirValorBruto({ ...baseValor, esConteo: true, reps: 120 })).toEqual({
      valorBruto: '120',
      capado: false,
    });
  });
  it('manual exige texto y lo recorta', () => {
    expect(construirValorBruto({ ...baseValor, valorManual: '   ' })).toEqual({
      error: 'Introduce el resultado antes de enviar',
    });
    expect(construirValorBruto({ ...baseValor, valorManual: '  500 m  ' })).toEqual({
      valorBruto: '500 m',
      capado: false,
    });
  });
});

describe('construirDetalle', () => {
  const base = {
    abandono: false,
    esPeso: false,
    intentos: [] as Array<{ peso: number; valido: boolean }>,
    mejorPeso: 0,
    esSplits: false,
    splits: [] as never[],
    usaEsquema: false,
    esTiempo: false,
    division: 'RX',
    movObjetivo: [],
    conteoEsquema: [],
    totalEsquema: 0,
    objetivoEsquema: 0,
    rondasEsquema: 1,
    capado: false,
  };
  it('retorna undefined al abandonar o sin esquema', () => {
    expect(construirDetalle({ ...base, abandono: true })).toBeUndefined();
    expect(construirDetalle(base)).toBeUndefined();
  });
  it('detalle max_load con intentos', () => {
    const intentos = [{ peso: 60, valido: true }];
    const d = construirDetalle({ ...base, esPeso: true, intentos, mejorPeso: 60 });
    expect(d).toMatchObject({ modalidad: 'max_load', mejor: 60 });
  });
  it('detalle de splits', () => {
    const splits = [
      { segmento_numero: 1, segmento_nombre: 'A', tiempo_acumulado_ms: 5, tiempo_parcial_ms: 5 },
    ] as never[];
    const d = construirDetalle({ ...base, esSplits: true, splits });
    expect(d).toMatchObject({ modalidad: 'time_trial_splits' });
  });
  it('detalle for_time con rondas completas y finalizado', () => {
    const d = construirDetalle({
      ...base,
      usaEsquema: true,
      esTiempo: true,
      movObjetivo: [{ nombre: 'Pull', objetivo: 30 } as never],
      conteoEsquema: [30],
      totalEsquema: 30,
      objetivoEsquema: 30,
      rondasEsquema: 3,
      marcaManual: { inicio_manual: true },
    });
    expect(d).toMatchObject({
      modalidad: 'for_time',
      division: 'RX',
      total_reps: 30,
      rondas_completas: 3,
      finalizado: true,
      inicio_manual: true,
    });
  });
  it('detalle amrap sin finalizado y sin division por cero', () => {
    const d = construirDetalle({
      ...base,
      usaEsquema: true,
      esTiempo: false,
      movObjetivo: [{ nombre: 'Push', objetivo: 10 } as never],
      conteoEsquema: [12],
      totalEsquema: 12,
      objetivoEsquema: 0,
      rondasEsquema: 1,
    });
    expect(d).toMatchObject({ modalidad: 'amrap', total_reps: 12 });
    expect((d as { rondas_completas?: number }).rondas_completas).toBeUndefined();
    expect((d as { finalizado?: boolean }).finalizado).toBeUndefined();
  });
});
