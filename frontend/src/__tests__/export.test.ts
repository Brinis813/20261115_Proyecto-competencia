import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escaparCSV,
  csvTexto,
  descargarTexto,
  nombreArchivo,
  textoEstado,
  juezDeMedicion,
  mapaBoxAtletas,
  filasResultadosCompetencia,
  csvResultadosCompetencia,
  csvInformeEvento,
  type DatosInforme,
} from '../utils/export';
import type {
  Asignacion,
  Juez,
  LeaderboardEntry,
  LeaderboardWod,
  Participante,
  ResultadoFila,
} from '../types';

function wod(parcial: Partial<LeaderboardWod> & { id: number; orden: number }): LeaderboardWod {
  return {
    nombre_ejercicio: 'WOD',
    tipo_medicion: 'repeticiones',
    puntaje_maximo: 100,
    ...parcial,
  };
}

function fila(
  parcial: Partial<ResultadoFila> & { participante_id: number; wod_id: number },
): ResultadoFila {
  return {
    resultado_id: 1,
    nombre: 'Ana',
    apellidos: 'Ruiz',
    cedula: '111',
    categoria: 'RX',
    valor_bruto: '45',
    puntos_calculados: 10,
    abandono: false,
    capado: false,
    timestamp_servidor: '2026-11-16T10:00:00.000Z',
    ...parcial,
  };
}

function participante(parcial: Partial<Participante> & { id: number }): Participante {
  return {
    nombre: 'Ana',
    apellidos: 'Ruiz',
    cedula: '111',
    fecha_nacimiento: '1995-01-01',
    box: 'Bogota Box',
    ...parcial,
  };
}

function asignacion(
  parcial: Partial<Asignacion> & { participante_id: number; usuario_id: number },
): Asignacion {
  return {
    id: 1,
    competencia_id: 1,
    wod_id: null,
    ...parcial,
  };
}

function juez(parcial: Partial<Juez> & { id: number }): Juez {
  return {
    nombre: 'Luis',
    apellidos: 'Gomez',
    cedula: '999',
    box: 'Bogota Box',
    rol: 'juez',
    ...parcial,
  };
}

function entrada(
  parcial: Partial<LeaderboardEntry> & { participante_id: number },
): LeaderboardEntry {
  return {
    nombre: 'Ana',
    apellidos: 'Ruiz',
    cedula: '111',
    box: 'Bogota Box',
    categoria: 'RX',
    puesto: 1,
    puntos_total: 100,
    wods_completados: 1,
    resultados: [],
    ...parcial,
  };
}

describe('escaparCSV', () => {
  it('devuelve vacio para null y undefined', () => {
    expect(escaparCSV(null)).toBe('');
    expect(escaparCSV(undefined)).toBe('');
  });

  it('convierte valores simples a texto', () => {
    expect(escaparCSV(42)).toBe('42');
    expect(escaparCSV('Ana Ruiz')).toBe('Ana Ruiz');
  });

  it('entrecomilla lo que trae separador, comilla o salto', () => {
    expect(escaparCSV('a,b')).toBe('"a,b"');
    expect(escaparCSV('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(escaparCSV('linea1\nlinea2')).toBe('"linea1\nlinea2"');
    expect(escaparCSV('a;b')).toBe('"a;b"');
  });

  it('neutraliza la inyeccion de formulas de Excel', () => {
    expect(escaparCSV('=1+1')).toBe("'=1+1");
    expect(escaparCSV('+cmd')).toBe("'+cmd");
    expect(escaparCSV('-2')).toBe("'-2");
    expect(escaparCSV('@SUMA(A1)')).toBe("'@SUMA(A1)");
    expect(escaparCSV('\tTAB')).toBe("'\tTAB");
  });
});

describe('csvTexto', () => {
  it('une filas con CRLF y agrega BOM para Excel', () => {
    const texto = csvTexto([
      ['a', 'b'],
      [1, 2],
    ]);
    expect(texto.charCodeAt(0)).toBe(0xfeff);
    expect(texto.slice(1)).toBe('a,b\r\n1,2');
  });

  it('escapa cada celda', () => {
    expect(csvTexto([['x,y', '=1']]).slice(1)).toBe('"x,y",\'=1');
  });
});

describe('descargarTexto', () => {
  const createObjectURL = vi.fn(() => 'blob:falso');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('crea un enlace temporal con el nombre y lo pulsa', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('informe.csv');
      expect(this.href).toBe('blob:falso');
    });
    const append = vi.spyOn(document.body, 'appendChild');
    const remove = vi.spyOn(HTMLAnchorElement.prototype, 'remove');

    descargarTexto('informe.csv', 'contenido');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);

    click.mockRestore();
    append.mockRestore();
    remove.mockRestore();
  });

  it('libera el blob despues de un segundo', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    descargarTexto('a.csv', 'x');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:falso');
    vi.restoreAllMocks();
  });
});

describe('nombreArchivo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('arma base_fecha_hora limpiando acentos y separadores', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 16, 9, 5));
    expect(nombreArchivo('Informe Final', 'csv')).toBe('Informe_Final_20261116_0905.csv');
    expect(nombreArchivo('Categoría Femenina!', 'pdf')).toBe(
      'Categoria_Femenina_20261116_0905.pdf',
    );
  });

  it('usa informe cuando la base queda vacia', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 16, 9, 5));
    expect(nombreArchivo('!!!', 'csv')).toBe('informe_20261116_0905.csv');
  });

  it('recorta la base a 60 caracteres', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 16, 9, 5));
    const nombre = nombreArchivo('a'.repeat(100), 'csv');
    expect(nombre.startsWith('a'.repeat(60))).toBe(true);
    expect(nombre.endsWith('_20261116_0905.csv')).toBe(true);
  });
});

describe('textoEstado', () => {
  it('describe la medicion', () => {
    expect(textoEstado({ abandono: true, capado: false })).toBe('DNF');
    expect(textoEstado({ abandono: false, capado: true })).toBe('No terminó (CAP)');
    expect(textoEstado({ abandono: false, capado: false })).toBe('Finalizado');
  });
});

describe('juezDeMedicion', () => {
  it('prefiere la asignacion exacta del WOD sobre la general', () => {
    const asignaciones = [
      asignacion({ participante_id: 7, usuario_id: 1, wod_id: null }),
      asignacion({
        id: 2,
        participante_id: 7,
        usuario_id: 2,
        wod_id: 10,
        Usuario: { id: 2, nombre: 'Pedro', apellidos: 'Lopez', cedula: '2' },
      }),
    ];
    expect(juezDeMedicion(asignaciones, 7, 10)).toBe('Pedro Lopez');
  });

  it('cae a la asignacion general cuando no hay exacta', () => {
    const asignaciones = [
      asignacion({
        participante_id: 7,
        usuario_id: 1,
        wod_id: null,
        Usuario: { id: 1, nombre: 'Luis', apellidos: 'Gomez', cedula: '1' },
      }),
    ];
    expect(juezDeMedicion(asignaciones, 7, 10)).toBe('Luis Gomez');
  });

  it('devuelve vacio sin asignacion o sin usuario', () => {
    expect(juezDeMedicion([], 7, 10)).toBe('');
    expect(juezDeMedicion([asignacion({ participante_id: 7, usuario_id: 1 })], 7, 10)).toBe('');
  });
});

describe('mapaBoxAtletas', () => {
  it('indexa el box por atleta y rellena vacio', () => {
    const mapa = mapaBoxAtletas([
      participante({ id: 1, box: 'Bogota Box' }),
      participante({ id: 2, box: null as unknown as string }),
    ]);
    expect(mapa.get(1)).toBe('Bogota Box');
    expect(mapa.get(2)).toBe('');
    expect(mapa.has(99)).toBe(false);
  });
});

describe('filasResultadosCompetencia', () => {
  const wods = [
    wod({ id: 10, orden: 2, nombre_ejercicio: 'Fran', tipo_medicion: 'tiempo' }),
    wod({ id: 11, orden: 1, nombre_ejercicio: 'Murph', tipo_medicion: 'repeticiones' }),
  ];
  const asignaciones = [
    asignacion({
      participante_id: 1,
      usuario_id: 5,
      wod_id: 11,
      Usuario: { id: 5, nombre: 'Rita', apellidos: 'Mora', cedula: '5' },
    }),
  ];

  it('ordena por orden de WOD y despues por puntos descendentes', () => {
    const filas = [
      fila({ participante_id: 1, wod_id: 10, puntos_calculados: 10, nombre: 'Ana' }),
      fila({ participante_id: 2, wod_id: 11, puntos_calculados: 5, nombre: 'Ben' }),
      fila({ participante_id: 3, wod_id: 11, puntos_calculados: 50, nombre: 'Cai' }),
      fila({ participante_id: 4, wod_id: 10, puntos_calculados: 99, nombre: 'Dan' }),
    ];
    const resultado = filasResultadosCompetencia('Evento', wods, filas, asignaciones, new Map());
    expect(resultado.map((f) => f[4])).toEqual(['Cai Ruiz', 'Ben Ruiz', 'Dan Ruiz', 'Ana Ruiz']);
  });

  it('pinta cada celda con marca, estado, box y juez', () => {
    const filas = [
      fila({ participante_id: 1, wod_id: 11, valor_bruto: '45', puntos_calculados: 10 }),
    ];
    const boxes = mapaBoxAtletas([participante({ id: 1, box: 'Medellin Box' })]);
    const [celdas] = filasResultadosCompetencia('Evento', wods, filas, asignaciones, boxes);
    expect(celdas).toEqual([
      'Evento',
      1,
      'Murph',
      'repeticiones',
      'Ana Ruiz',
      '111',
      'Medellin Box',
      'RX',
      '45 reps',
      10,
      'Finalizado',
      'Rita Mora',
      '2026-11-16T10:00:00.000Z',
    ]);
  });

  it('marca DNF, CAP y celdas vacias cuando faltan datos', () => {
    const filas = [
      fila({ participante_id: 1, wod_id: 10, abandono: true }),
      fila({ participante_id: 9, wod_id: 10, capado: true, valor_bruto: '12' }),
      fila({
        participante_id: 1,
        wod_id: 999,
        categoria: null,
        timestamp_servidor: null as unknown as string,
      }),
    ];
    const resultado = filasResultadosCompetencia('Evento', wods, filas, [], new Map());
    // El WOD desconocido ordena 0, asi que encabeza; luego el DNF y el CAP.
    expect(resultado[0][1]).toBe('');
    expect(resultado[0][2]).toBe('');
    expect(resultado[0][6]).toBe('');
    expect(resultado[0][8]).toBe('45 reps');
    expect(resultado[0][11]).toBe('');
    expect(resultado[0][12]).toBe('');
    expect(resultado[1][8]).toBe('DNF');
    expect(resultado[1][10]).toBe('DNF');
    expect(resultado[2][8]).toBe('CAP · 12 reps');
  });
});

describe('csvResultadosCompetencia', () => {
  it('encabeza el CSV con BOM y las cabeceras', () => {
    const texto = csvResultadosCompetencia(
      'Evento',
      [wod({ id: 10, orden: 1 })],
      [fila({ participante_id: 1, wod_id: 10 })],
      [],
      [participante({ id: 1 })],
    );
    const lineas = texto.slice(1).split('\r\n');
    expect(lineas[0]).toBe(
      'Competencia,Wod,Ejercicio,Medición,Atleta,Cédula,Box,Categoría,Marca,Puntos,Estado,Juez,Registrado',
    );
    expect(lineas[1]).toContain('Ana Ruiz');
    expect(lineas).toHaveLength(2);
  });
});

function datosInforme(): DatosInforme {
  return {
    evento: {
      nombre: 'Open 2027',
      sede: 'Bogota',
      fecha_inicio: '2027-03-01',
      fecha_fin: '2027-03-02',
    },
    competencias: [{ id: 1, nombre: 'Elite' }],
    wodsPorCompetencia: new Map([
      [1, [wod({ id: 10, orden: 1, nombre_ejercicio: 'Fran', tipo_medicion: 'tiempo' })]],
    ]),
    filasPorCompetencia: new Map([
      [1, [fila({ participante_id: 1, wod_id: 10, valor_bruto: '5:30' })]],
    ]),
    asignacionesPorCompetencia: new Map([
      [
        1,
        [
          asignacion({
            id: 1,
            participante_id: 1,
            usuario_id: 5,
            wod_id: 10,
            Usuario: { id: 5, nombre: 'Rita', apellidos: 'Mora', cedula: '5' },
            Participante: {
              id: 1,
              nombre: 'Ana',
              apellidos: 'Ruiz',
              cedula: '111',
              box: 'Medellin Box',
              categoria: 'RX',
            },
          }),
          asignacion({
            id: 2,
            participante_id: 2,
            usuario_id: 5,
            wod_id: null,
            Usuario: { id: 5, nombre: 'Rita', apellidos: 'Mora', cedula: '5' },
            Participante: {
              id: 2,
              nombre: 'Ben',
              apellidos: 'Zapata',
              cedula: '222',
              box: 'Cali Box',
              categoria: 'RX',
            },
          }),
        ],
      ],
    ]),
    jueces: [juez({ id: 5, nombre: 'Rita', apellidos: 'Mora' })],
    participantes: [
      participante({ id: 2, nombre: 'Ben', apellidos: 'Zapata', cedula: '222' }),
      participante({ id: 1, nombre: 'Ana', apellidos: 'Ruiz', cedula: '111' }),
    ],
    general: [
      entrada({ participante_id: 1, puesto: 1, puntos_total: 100, comparte_puesto: true }),
      entrada({ participante_id: 2, puesto: 2, puntos_total: 80, comparte_puesto: false }),
    ],
    clasificacionPorCompetencia: new Map([
      [1, [entrada({ participante_id: 1, puesto: 1, puntos_total: 50 })]],
    ]),
  };
}

describe('csvInformeEvento', () => {
  it('arma todas las secciones del informe', () => {
    const texto = csvInformeEvento(datosInforme());
    const lineas = texto.slice(1).split('\r\n');
    const titulo = (t: string) => lineas.indexOf(t);
    expect(titulo('INFORME FINAL')).toBeGreaterThanOrEqual(0);
    expect(lineas[titulo('INFORME FINAL') + 1]).toEqual(['Evento', 'Open 2027'].join(','));
    expect(titulo('CLASIFICACIÓN GENERAL')).toBeGreaterThan(-1);
    expect(titulo('CLASIFICACIÓN · Elite')).toBeGreaterThan(-1);
    expect(titulo('RESULTADOS · Elite')).toBeGreaterThan(-1);
    expect(titulo('JUECES')).toBeGreaterThan(-1);
    expect(titulo('ASIGNACIONES JUEZ - ATLETA')).toBeGreaterThan(-1);
    expect(titulo('ATLETAS')).toBeGreaterThan(-1);
  });

  it('detalla la clasificacion general con empate y sede', () => {
    const texto = csvInformeEvento(datosInforme());
    expect(texto).toContain('Sede,Bogota');
    expect(texto).toContain('Ana Ruiz');
    expect(texto).toContain('100');
    expect(texto).toContain('Sí');
    expect(texto).toContain('No');
  });

  it('cuenta los atletas asignados por juez', () => {
    const texto = csvInformeEvento(datosInforme());
    // Rita Mora tiene 2 atletas distintos (uno por WOD y uno general).
    expect(texto).toContain('Rita Mora,999,Bogota Box,2');
  });

  it('etiqueta la asignacion general como todos los WODs', () => {
    const texto = csvInformeEvento(datosInforme());
    expect(texto).toContain('Elite,1. Fran,Rita Mora,Ana Ruiz,111');
    expect(texto).toContain('Elite,Todos los WODs,Rita Mora,Ben Zapata,222');
  });

  it('ordena los atletas por apellidos', () => {
    const texto = csvInformeEvento(datosInforme());
    const lineas = texto.slice(1).split('\r\n');
    const idx = lineas.indexOf('Atleta,Cédula,Box,Categoría');
    expect(idx).toBeGreaterThan(-1);
    expect(lineas[idx + 1]).toContain('Ana Ruiz');
    expect(lineas[idx + 2]).toContain('Ben Zapata');
  });

  it('tolera un evento sin clasificacion general ni resultados', () => {
    const vacio: DatosInforme = {
      ...datosInforme(),
      general: null,
      clasificacionPorCompetencia: new Map(),
      filasPorCompetencia: new Map(),
      asignacionesPorCompetencia: new Map(),
      participantes: [],
      jueces: [],
    };
    const texto = csvInformeEvento(vacio);
    expect(texto).not.toContain('CLASIFICACIÓN GENERAL');
    expect(texto).toContain('INFORME FINAL');
    // Sin atletas ni jueces: solo la cabecera de cada seccion.
    expect(texto).toContain('Juez,Cédula,Box,Atletas asignados');
    expect(texto).not.toContain('Rita Mora');
  });
});
