jest.mock('../models/Competencia', () => ({
  COMPETENCIA_TIEBREAK_POLICIES: ['NONE', 'TIEBREAK_MARK', 'DESIGNATED_CIRCUIT_SPLIT'],
}));

jest.mock('../models', () => ({
  Competencia: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
  },
  Wod: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
    bulkCreate: jest.fn(),
    count: jest.fn(),
  },
  Resultado: {
    count: jest.fn(),
  },
  Asignacion: {
    count: jest.fn(),
    destroy: jest.fn(),
    bulkCreate: jest.fn(),
    findAll: jest.fn(),
    findByPk: jest.fn(),
  },
  Categoria: {
    findAll: jest.fn(),
  },
  CompetenciaCategoria: {
    destroy: jest.fn(),
    bulkCreate: jest.fn(),
  },
  Usuario: {},
  Participante: {},
}));

jest.mock('../config/database', () => ({
  sequelize: { transaction: jest.fn((fn: any) => fn({})) },
}));

jest.mock('../sockets/handlers', () => ({
  broadcastLeaderboard: jest.fn(),
}));

import {
  etiquetaCategoria,
  sanearDivisionesSalida,
  getAllCompetencias,
  getCompetenciaById,
  createCompetencia,
  updateCompetencia,
  assignCompetencia,
  removeAssignment,
  getCompetenciaAssignments,
  getCompetenciasByJudge,
  getPublicCompetencias,
} from '../services/competenciaService';
import {
  Competencia,
  Wod,
  Resultado,
  Asignacion,
  Categoria,
  CompetenciaCategoria,
} from '../models';
import { broadcastLeaderboard } from '../sockets/handlers';

const mockCompetencia = Competencia as unknown as Record<string, jest.Mock>;
const mockWod = Wod as unknown as Record<string, jest.Mock>;
const mockResultado = Resultado as unknown as Record<string, jest.Mock>;
const mockAsignacion = Asignacion as unknown as Record<string, jest.Mock>;
const mockCategoria = Categoria as unknown as Record<string, jest.Mock>;
const mockCompetenciaCategoria = CompetenciaCategoria as unknown as Record<string, jest.Mock>;
const mockBroadcast = broadcastLeaderboard as jest.Mock;

const wodBase = (over: Record<string, any> = {}) => ({
  orden: 1,
  nombre_ejercicio: 'Fran',
  tipo_medicion: 'tiempo' as const,
  tiempo_estimado_duracion: 600,
  puntaje_maximo: 100,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('etiquetaCategoria', () => {
  it('concatena nombre y genero', () => {
    expect(etiquetaCategoria({ nombre: 'RX', genero: 'Femenino' })).toBe('RX Femenino');
  });
  it('recorta espacios sobrantes', () => {
    expect(etiquetaCategoria({ nombre: '  RX ', genero: '' })).toBe('RX');
  });
});

describe('sanearDivisionesSalida', () => {
  it('retorna null si no es arreglo', () => {
    expect(sanearDivisionesSalida(null)).toBeNull();
    expect(sanearDivisionesSalida('RX' as any)).toBeNull();
  });
  it('limpia strings, quita vacios y duplicados', () => {
    expect(sanearDivisionesSalida([' RX ', '', 'RX', 'Scaled'])).toEqual(['RX', 'Scaled']);
  });
  it('convierte objetos {nombre,genero} a etiqueta', () => {
    expect(
      sanearDivisionesSalida([
        { nombre: 'RX', genero: 'Masculino' } as any,
        { nombre: '', genero: '' } as any,
        42 as any,
      ]),
    ).toEqual(['RX Masculino']);
  });
  it('retorna null si queda vacia', () => {
    expect(sanearDivisionesSalida(['  ', ''])).toBeNull();
  });
});

describe('getAllCompetencias / getCompetenciaById', () => {
  it('sanea divisiones legacy y calcula rondas', async () => {
    mockCompetencia.findAll.mockResolvedValue([
      {
        toJSON: () => ({
          id: 1,
          divisiones: [{ nombre: 'RX', genero: 'Femenino' }],
          rondas: null,
          wods: [{ esquema: { modalidad: 'for_time', rondas: 3, movimientos: [{ nombre: 'a' }] } }],
        }),
      },
    ]);
    const res = await getAllCompetencias({});
    expect(res[0].divisiones).toEqual(['RX Femenino']);
    expect(res[0].rondas).toBe(3);
  });

  it('getCompetenciaById retorna null si no existe', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);
    expect(await getCompetenciaById(999)).toBeNull();
  });

  it('getCompetenciaById sanea y calcula rondas', async () => {
    mockCompetencia.findByPk.mockResolvedValue({
      toJSON: () => ({ id: 2, divisiones: ['RX'], rondas: 2, wods: [] }),
    });
    const res: any = await getCompetenciaById(2);
    expect(res.divisiones).toEqual(['RX']);
    expect(res.rondas).toBe(2);
  });
});

describe('createCompetencia', () => {
  it('lanza error si alguna categoria ya no existe', async () => {
    mockCategoria.findAll.mockResolvedValue([{ id: 1 }]);
    await expect(
      createCompetencia({
        nombre: 'C1',
        tipo_flujo: 'en_serie',
        tipo_publicacion: 'tiempo_real',
        categoria_ids: [1, 2],
        wods: [wodBase()],
      } as any),
    ).rejects.toThrow('ya no existe');
  });

  it('poda la division obsoleta del esquema en vez de fallar (opcion B)', async () => {
    mockCategoria.findAll.mockResolvedValue([{ id: 1, nombre: 'RX', genero: 'M' }]);
    mockCompetenciaCategoria.destroy.mockResolvedValue(0);
    mockCompetenciaCategoria.bulkCreate.mockResolvedValue([]);
    const fakeCompetencia: any = {
      id: 11,
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockCompetencia.create.mockResolvedValue(fakeCompetencia);
    mockWod.bulkCreate.mockResolvedValue([]);
    mockCompetencia.findByPk.mockResolvedValue({ id: 11 } as any);
    await createCompetencia({
      nombre: 'C1',
      tipo_flujo: 'en_serie',
      tipo_publicacion: 'tiempo_real',
      categoria_ids: [1],
      wods: [
        wodBase({
          esquema: {
            modalidad: 'for_time',
            movimientos: [{ nombre: 'Pull', reps: { Otra: 10 } }],
            movimientos_por_division: {
              'individual hombres Masculino': [
                { nombre: 'Pull', reps: { 'individual hombres Masculino': 10 } },
              ],
            },
          },
        }),
      ],
    } as any);
    const creados = mockWod.bulkCreate.mock.calls[0][0] as any[];
    expect(creados[0].esquema.movimientos[0].reps).toEqual({});
    expect(creados[0].esquema.movimientos_por_division).toEqual({});
  });

  it('podarEsquemaADivisiones colapsa a General sin divisiones y remapea caja', async () => {
    const { podarEsquemaADivisiones } = await import('../services/competenciaService');
    const colapsado: any = podarEsquemaADivisiones(
      {
        modalidad: 'for_time',
        movimientos_por_division: {
          'individual hombres Masculino': [
            { nombre: 'Pull', reps: { 'individual hombres Masculino': 10 } },
          ],
        },
      } as any,
      [],
    );
    expect(colapsado.movimientos_por_division.General[0].reps).toEqual({ General: 10 });
    const remapeado: any = podarEsquemaADivisiones(
      {
        modalidad: 'amrap',
        movimientos_por_division: {
          'rx masculino': [{ nombre: 'Pull', reps: { 'rx masculino': 8 } }],
        },
      } as any,
      ['Rx Masculino'],
    );
    expect(Object.keys(remapeado.movimientos_por_division)).toEqual(['Rx Masculino']);
  });

  it('crea competencia con divisiones normalizadas y wods (incluye splits y unidad)', async () => {
    mockCategoria.findAll.mockResolvedValue([{ id: 1, nombre: 'RX', genero: 'M' }]);
    mockCompetenciaCategoria.destroy.mockResolvedValue(0);
    mockCompetenciaCategoria.bulkCreate.mockResolvedValue([]);
    const fakeCompetencia: any = {
      id: 10,
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockCompetencia.create.mockResolvedValue(fakeCompetencia);
    mockWod.bulkCreate.mockResolvedValue([]);
    mockCompetencia.findByPk.mockResolvedValue({ id: 10 } as any);

    const res = await createCompetencia({
      nombre: 'Evento',
      tipo_flujo: 'en_serie',
      tipo_publicacion: 'tiempo_real',
      categoria_ids: [1],
      divisiones: ['  RX M ', 'RX M', ''],
      duracion_minutos: 0,
      rondas: 250,
      tiebreak_policy: 'INVENTADA' as any,
      desempate_tipo_medicion: 'tiempo',
      wods: [
        wodBase({
          tipo_medicion: 'time_trial_splits',
          esquema: { modalidad: 'for_time' } as any,
          unidad_distancia: 'yardas' as any,
          tiempo_cap: -5,
        }),
        wodBase({
          orden: 2,
          nombre_ejercicio: 'Row',
          tipo_medicion: 'distancia',
          unidad_distancia: 'km',
          tiempo_cap: 99,
        }),
      ],
    } as any);

    expect(res).toEqual({ id: 10 });
    // rondas se acota a 100
    expect(mockCompetencia.create).toHaveBeenCalledWith(
      expect.objectContaining({ rondas: 100, duracion_minutos: null }),
      expect.anything(),
    );
    // time_trial_splits se normaliza a tiempo
    expect(mockWod.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ tipo_medicion: 'tiempo' })]),
      expect.anything(),
    );
  });

  it('usa divisiones de texto libre cuando no hay categoria_ids', async () => {
    const fake: any = { id: 11, update: jest.fn() };
    mockCompetencia.create.mockResolvedValue(fake);
    mockWod.bulkCreate.mockResolvedValue([]);
    mockCompetencia.findByPk.mockResolvedValue({ id: 11 } as any);

    await createCompetencia({
      nombre: 'Libre',
      tipo_flujo: 'en_serie',
      tipo_publicacion: 'tiempo_real',
      divisiones: ['RX', 'RX', ' '],
      wods: [wodBase()],
    } as any);

    expect(mockCompetencia.create).toHaveBeenCalledWith(
      expect.objectContaining({ divisiones: ['RX'] }),
      expect.anything(),
    );
  });
});

describe('updateCompetencia', () => {
  it('lanza error si no existe', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);
    await expect(updateCompetencia(1, { nombre: 'x' } as any)).rejects.toThrow('no encontrado');
  });

  it('lanza error con tiebreak_policy invalida', async () => {
    mockCompetencia.findByPk.mockResolvedValue({
      id: 1,
      divisiones: null,
      update: jest.fn(),
    } as any);
    await expect(updateCompetencia(1, { tiebreak_policy: 'MALA' } as any)).rejects.toThrow(
      'inválida',
    );
  });

  it('lanza error si el wod de desempate no pertenece', async () => {
    mockCompetencia.findByPk.mockResolvedValue({
      id: 1,
      divisiones: null,
      update: jest.fn(),
    } as any);
    mockWod.findOne.mockResolvedValue(null);
    mockWod.findAll.mockResolvedValue([]);
    await expect(updateCompetencia(1, { wod_desempate_id: 99 } as any)).rejects.toThrow(
      'no pertenece',
    );
  });

  it('actualiza campos simples y limpia wod_desempate_id con null', async () => {
    const update = jest.fn();
    mockCompetencia.findByPk.mockResolvedValue({
      id: 1,
      divisiones: ['RX'],
      rondas: 1,
      update,
    } as any);
    mockWod.findAll.mockResolvedValue([]);
    (mockCompetencia.findByPk as jest.Mock).mockResolvedValueOnce({
      id: 1,
      divisiones: ['RX'],
      rondas: 1,
      update,
    } as any);
    // segunda llamada dentro de la transaccion (findByPk final)
    mockCompetencia.findByPk.mockResolvedValue({ id: 1 } as any);

    // re-mock para que la primera sea el objeto con update
    mockCompetencia.findByPk.mockReset();
    mockCompetencia.findByPk
      .mockResolvedValueOnce({ id: 1, divisiones: ['RX'], rondas: 1, update } as any)
      .mockResolvedValue({ id: 1 } as any);

    await updateCompetencia(1, {
      nombre: 'Nuevo',
      duracion_minutos: 30,
      rondas: 2,
      divisiones: ['RX', ''],
      wod_desempate_id: null,
    } as any);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Nuevo',
        duracion_minutos: 30,
        rondas: 2,
        wod_desempate_id: null,
      }),
      expect.anything(),
    );
  });

  it('no borra wods con resultados (protege mediciones)', async () => {
    mockCompetencia.findByPk.mockReset();
    mockCompetencia.findByPk
      .mockResolvedValueOnce({ id: 1, divisiones: null, rondas: 1, update: jest.fn() } as any)
      .mockResolvedValue({ id: 1 } as any);
    mockWod.findAll.mockResolvedValue([{ id: 5, imagen_url: null, esquema: null }] as any);
    mockResultado.count.mockResolvedValue(2);

    await expect(updateCompetencia(1, { wods: [wodBase({ id: 9 })] } as any)).rejects.toThrow(
      'ya tienen resultados',
    );
  });

  it('sincroniza wods: borra sin resultados, actualiza y crea', async () => {
    const update = jest.fn();
    mockCompetencia.findByPk.mockReset();
    mockCompetencia.findByPk
      .mockResolvedValueOnce({ id: 1, divisiones: null, rondas: 1, update } as any)
      .mockResolvedValue({ id: 1 } as any);
    mockWod.findAll.mockResolvedValue([
      { id: 5, imagen_url: null, esquema: null },
      { id: 6, imagen_url: null, esquema: null },
    ] as any);
    mockResultado.count.mockResolvedValue(0);
    mockWod.destroy.mockResolvedValue(1);
    mockWod.update.mockResolvedValue([1] as any);
    mockWod.create.mockResolvedValue({ id: 9 } as any);

    await updateCompetencia(1, {
      wods: [
        wodBase({ id: 6, nombre_ejercicio: 'Editado' }),
        wodBase({ nombre_ejercicio: 'Nuevo' }),
      ],
    } as any);

    expect(mockWod.destroy).toHaveBeenCalled();
    expect(mockWod.update).toHaveBeenCalled();
    expect(mockWod.create).toHaveBeenCalled();
  });

  it('propaga rondas a esquemas for_time/amrap cuando solo cambian rondas', async () => {
    const update = jest.fn();
    mockCompetencia.findByPk.mockReset();
    mockCompetencia.findByPk
      .mockResolvedValueOnce({ id: 1, divisiones: null, rondas: 1, update } as any)
      .mockResolvedValue({ id: 1 } as any);
    mockWod.findAll.mockResolvedValue([
      { id: 5, esquema: { modalidad: 'for_time', movimientos: [{ nombre: 'a' }] } },
    ] as any);
    mockWod.update.mockResolvedValue([1] as any);

    await updateCompetencia(1, { rondas: 4 } as any);

    expect(mockWod.update).toHaveBeenCalledWith(
      expect.objectContaining({ esquema: expect.objectContaining({ rondas: 4 }) }),
      expect.anything(),
    );
  });

  it('sincroniza categoria_ids en update', async () => {
    const update = jest.fn();
    mockCompetencia.findByPk.mockReset();
    mockCompetencia.findByPk
      .mockResolvedValueOnce({ id: 1, divisiones: ['Vieja'], rondas: 1, update } as any)
      .mockResolvedValue({ id: 1 } as any);
    mockCompetenciaCategoria.destroy.mockResolvedValue(1);
    mockCategoria.findAll.mockResolvedValue([{ id: 2, nombre: 'Scaled', genero: 'F' }]);
    mockCompetenciaCategoria.bulkCreate.mockResolvedValue([]);

    await updateCompetencia(1, { categoria_ids: [2] } as any);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ divisiones: ['Scaled F'] }),
      expect.anything(),
    );
  });
});

describe('assignCompetencia / removeAssignment', () => {
  it('lanza error si la competencia no existe', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);
    await expect(
      assignCompetencia({
        competencia_id: 1,
        wod_id: null,
        pares: [{ usuario_id: 1, participante_id: 2 }],
      }),
    ).rejects.toThrow('no encontrado');
  });

  it('lanza error si el wod no pertenece', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 1 } as any);
    mockWod.findOne.mockResolvedValue(null);
    await expect(
      assignCompetencia({
        competencia_id: 1,
        wod_id: 99,
        pares: [{ usuario_id: 1, participante_id: 2 }],
      }),
    ).rejects.toThrow('no pertenece');
  });

  it('lanza error sin pares', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 1 } as any);
    mockWod.findOne.mockResolvedValue({ id: 3 } as any);
    await expect(assignCompetencia({ competencia_id: 1, wod_id: 3, pares: [] })).rejects.toThrow(
      'al menos',
    );
  });

  it('crea asignaciones y difunde leaderboard', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 1 } as any);
    mockWod.findOne.mockResolvedValue({ id: 3 } as any);
    mockAsignacion.destroy.mockResolvedValue(0);
    mockAsignacion.bulkCreate.mockResolvedValue([]);
    const res = await assignCompetencia({
      competencia_id: 1,
      wod_id: null,
      pares: [
        { usuario_id: 1, participante_id: 2 },
        { usuario_id: 1, participante_id: 3 },
      ],
    });
    expect(res.total).toBe(2);
    expect(mockBroadcast).toHaveBeenCalledWith(1);
  });

  it('removeAssignment lanza si no existe y difunde al borrar', async () => {
    mockAsignacion.findByPk.mockResolvedValue(null);
    await expect(removeAssignment(99)).rejects.toThrow('no encontrada');

    mockAsignacion.findByPk.mockResolvedValue({ competencia_id: 4, destroy: jest.fn() } as any);
    await removeAssignment(7);
    expect(mockBroadcast).toHaveBeenCalledWith(4);
  });

  it('getCompetenciaAssignments retorna lista', async () => {
    mockAsignacion.findAll.mockResolvedValue([{ id: 1 }] as any);
    expect(await getCompetenciaAssignments(1)).toEqual([{ id: 1 }]);
  });
});

describe('getCompetenciasByJudge / getPublicCompetencias', () => {
  it('retorna [] si el juez no tiene asignaciones', async () => {
    mockAsignacion.findAll.mockResolvedValue([]);
    expect(await getCompetenciasByJudge(5)).toEqual([]);
  });

  it('recorta wods a los asignados y conserva todos si hay cobertura total', async () => {
    mockAsignacion.findAll.mockResolvedValue([
      { competencia_id: 1, wod_id: 10 },
      { competencia_id: 2, wod_id: null },
    ] as any);
    mockCompetencia.findAll.mockResolvedValue([
      {
        id: 1,
        toJSON: () => ({
          id: 1,
          divisiones: [{ nombre: 'RX', genero: 'M' }],
          rondas: 1,
          wods: [{ id: 10 }, { id: 11 }],
        }),
      },
      { id: 2, toJSON: () => ({ id: 2, divisiones: null, rondas: 1, wods: [{ id: 20 }] }) },
    ] as any);

    const res: any[] = await getCompetenciasByJudge(1);
    expect(res[0].wods).toEqual([{ id: 10 }]);
    expect(res[1].wods).toEqual([{ id: 20 }]);
    expect(res[0].divisiones).toEqual(['RX M']);
  });

  it('getPublicCompetencias sanea divisiones', async () => {
    mockCompetencia.findAll.mockResolvedValue([
      { toJSON: () => ({ id: 1, divisiones: [' RX '], rondas: 2, wods: [] }) },
    ] as any);
    const res = await getPublicCompetencias();
    expect(res[0].divisiones).toEqual(['RX']);
  });
});
