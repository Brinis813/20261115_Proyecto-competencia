jest.mock('../models', () => ({
  Heat: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
    max: jest.fn(),
    count: jest.fn(),
  },
  HeatParticipante: {
    findAll: jest.fn(),
    bulkCreate: jest.fn(),
    destroy: jest.fn(),
    count: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  },
  HeatHorario: {
    findAll: jest.fn(),
    bulkCreate: jest.fn(),
  },
  Categoria: {
    findByPk: jest.fn(),
  },
  Participante: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
  },
  Competencia: {
    findByPk: jest.fn(),
  },
}));

jest.mock('../config/database', () => ({
  sequelize: {
    transaction: jest.fn((fn: any) => fn({})),
  },
}));

jest.mock('../middleware/evento', () => ({}));

import {
  obtenerHeats,
  generarHeats,
  crearHeatVacio,
  moverAtleta,
  eliminarHeat,
  limpiarCategoria,
  programarHorarioAuto,
  programarHorarioManual,
} from '../services/heatService';
import {
  Heat,
  HeatParticipante,
  HeatHorario,
  Categoria,
  Participante,
  Competencia,
} from '../models';

const mockHeat = Heat as jest.Mocked<typeof Heat>;
const mockHeatParticipante = HeatParticipante as jest.Mocked<typeof HeatParticipante>;
const mockHeatHorario = HeatHorario as jest.Mocked<typeof HeatHorario>;
const mockCategoria = Categoria as jest.Mocked<typeof Categoria>;
const mockParticipante = Participante as jest.Mocked<typeof Participante>;
const mockCompetencia = Competencia as jest.Mocked<typeof Competencia>;

const superadmin = { activa: null, permitidas: null } as any;
const adminEvento1 = { activa: 1, permitidas: [1] } as any;

function stubVistaVacia() {
  mockHeat.findAll.mockResolvedValue([] as any);
  mockHeatParticipante.findAll.mockResolvedValue([] as any);
  mockHeatHorario.findAll.mockResolvedValue([] as any);
  mockParticipante.findAll.mockResolvedValue([] as any);
}

function categoriaMock(extra: Record<string, any> = {}) {
  return {
    id: 1,
    evento_id: 1,
    nombre: 'RX',
    genero: 'Masculino',
    ...extra,
  } as any;
}

beforeEach(() => jest.clearAllMocks());

describe('obtenerHeats — permisos de la categoría', () => {
  it('admite categorías legacy sin evento aunque no haya alcance', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock({ evento_id: null }));
    stubVistaVacia();

    const res = await obtenerHeats(1, null, undefined);

    expect(res.categoria).toEqual({ id: 1, nombre: 'RX', genero: 'Masculino' });
  });

  it('exige alcance cuando la categoría sí tiene evento', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());

    await expect(obtenerHeats(1, null, undefined)).rejects.toThrow('Sin alcance de evento');
  });

  it('el superadmin entra sin estar en la lista', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    stubVistaVacia();

    await expect(obtenerHeats(1, null, superadmin)).resolves.toBeDefined();
  });

  it('acepta al admin cuyo evento activo es el de la categoría', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    stubVistaVacia();

    const alcance = { activa: 1, permitidas: [9] } as any;
    await expect(obtenerHeats(1, null, alcance)).resolves.toBeDefined();
  });

  it('acepta al admin cuando el evento está en la lista sin evento activo', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock({ evento_id: 3 }));
    stubVistaVacia();

    const alcance = { activa: null, permitidas: [3] } as any;
    await expect(obtenerHeats(1, null, alcance)).resolves.toBeDefined();
  });

  it('rechaza al admin de otro evento', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock({ evento_id: 5 }));

    await expect(obtenerHeats(1, null, adminEvento1)).rejects.toThrow('No administras este evento');
  });
});

describe('obtenerHeats — construcción de la vista', () => {
  it('arma heats, carriles, hora por competencia y la bolsa de sin asignar', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockHeat.findAll.mockResolvedValue([
      { id: 10, numero: 1, capacidad_maxima: 4 },
      { id: 11, numero: 2, capacidad_maxima: 4 },
    ] as any);
    mockHeatParticipante.findAll.mockResolvedValue([
      {
        heat_id: 10,
        participante_id: 5,
        carril_numero: 2,
        Participante: {
          nombre: 'Ana',
          apellidos: 'Rojas',
          cedula: '001',
          box: 'Box Uno',
          categoria: 'RX Masculino',
        },
      },
      { heat_id: 99, participante_id: 7, carril_numero: 1, Participante: null },
    ] as any);
    mockHeatHorario.findAll.mockResolvedValue([
      { heat_id: 10, competencia_id: 4, hora_inicio: '08:30:00' },
    ] as any);
    mockParticipante.findAll.mockResolvedValue([
      { id: 5, nombre: 'Ana', apellidos: 'Rojas', cedula: '001' },
      { id: 6, nombre: 'Beto', apellidos: 'Arias', cedula: '002', box: null },
    ] as any);

    const res = await obtenerHeats(1, 4, superadmin);

    expect(res.heats).toHaveLength(2);
    expect(res.heats[0]).toEqual({
      id: 10,
      numero: 1,
      capacidad_maxima: 4,
      ocupados: 1,
      hora_inicio: '08:30',
      participantes: [
        {
          id: 5,
          nombre: 'Ana',
          apellidos: 'Rojas',
          cedula: '001',
          box: 'Box Uno',
          categoria: 'RX Masculino',
          carril_numero: 2,
        },
      ],
    });
    // Sin horario en esa competencia queda en null.
    expect(res.heats[1].hora_inicio).toBeNull();
    expect(res.heats[1].ocupados).toBe(0);
    // El atleta 7 está en un heat de otra categoría: no aparece aquí.
    expect(res.sinAsignar.map((p) => p.id)).toEqual([6]);
    expect(res.sinAsignar[0].box).toBeNull();
    expect(mockHeatHorario.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ competencia_id: 4 }),
      }),
    );
  });

  it('sin heats no consulta participantes ni horarios', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockHeat.findAll.mockResolvedValue([] as any);
    mockParticipante.findAll.mockResolvedValue([{ id: 8 }] as any);

    const res = await obtenerHeats(1, 4, superadmin);

    expect(mockHeatParticipante.findAll).not.toHaveBeenCalled();
    expect(mockHeatHorario.findAll).not.toHaveBeenCalled();
    expect(res.heats).toEqual([]);
    expect(res.sinAsignar.map((p) => p.id)).toEqual([8]);
  });
});

describe('generarHeats', () => {
  it('en modo aleatorio mezcla el orden antes de repartir', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockHeat.destroy.mockResolvedValue([] as any);
    mockHeat.create.mockResolvedValue({ id: 100, numero: 1 } as any);
    mockHeatParticipante.bulkCreate.mockResolvedValue([] as any);

    const atletas = [1, 2, 3, 4, 5].map((n) => ({
      id: n,
      nombre: `N${n}`,
      apellidos: `A${n}`,
      cedula: `${n}`,
      categoria_id: 1,
      evento_id: 1,
    }));
    mockParticipante.findAll.mockResolvedValueOnce(atletas as any).mockResolvedValueOnce([] as any);
    stubVistaVacia();

    const res = await generarHeats(1, 2, 'aleatorio', superadmin);

    expect(mockHeat.create).toHaveBeenCalledTimes(3);
    expect(res).toBeDefined();
  });

  it('filtra los atletas por el evento de la categoría', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockHeat.destroy.mockResolvedValue([] as any);
    mockHeat.create.mockResolvedValue({ id: 100, numero: 1 } as any);
    mockHeatParticipante.bulkCreate.mockResolvedValue([] as any);
    mockParticipante.findAll
      .mockResolvedValueOnce([
        { id: 1, nombre: 'A', apellidos: 'B', categoria_id: 1, evento_id: 1 },
      ] as any)
      .mockResolvedValueOnce([] as any);
    stubVistaVacia();

    await generarHeats(1, 10, 'alfabetico', superadmin);

    expect(mockParticipante.findAll).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { categoria_id: 1, evento_id: 1 },
      }),
    );
  });
});

describe('crearHeatVacio', () => {
  it('valida la capacidad antes de tocar la base', async () => {
    await expect(crearHeatVacio(1, 0)).rejects.toThrow(
      'La capacidad máxima debe estar entre 1 y 50',
    );
    expect(mockHeat.max).not.toHaveBeenCalled();
  });

  it('crea la serie con el siguiente número cuando no hay series', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockHeat.max.mockResolvedValue(null as any);
    mockHeat.create.mockResolvedValue({ id: 20, numero: 1 } as any);
    stubVistaVacia();

    await crearHeatVacio(1, 8, superadmin);

    expect(mockHeat.create).toHaveBeenCalledWith(
      expect.objectContaining({ numero: 1, capacidad_maxima: 8, categoria_id: 1 }),
      expect.anything(),
    );
  });

  it('crea la serie con el número siguiente al existente', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockHeat.max.mockResolvedValue(3 as any);
    mockHeat.create.mockResolvedValue({ id: 21, numero: 4 } as any);
    stubVistaVacia();

    await crearHeatVacio(1, 8, superadmin);

    expect(mockHeat.create).toHaveBeenCalledWith(
      expect.objectContaining({ numero: 4 }),
      expect.anything(),
    );
    // La vista se arma al final, sobre la categoría pedida.
    expect(mockHeat.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { categoria_id: 1 } }),
    );
  });
});

describe('moverAtleta — carriles', () => {
  function destinoLleno() {
    mockHeat.findByPk.mockResolvedValue({
      id: 10,
      categoria_id: 1,
      capacidad_maxima: 3,
      numero: 1,
    } as any);
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockParticipante.findByPk.mockResolvedValue({ id: 5, categoria_id: 1 } as any);
  }

  it('sin carril asignado elige el primero libre', async () => {
    destinoLleno();
    stubVistaVacia();
    // El primer findAll es el de "ocupados"; el de la vista vuelve vacío.
    mockHeatParticipante.findAll.mockResolvedValueOnce([
      { participante_id: 1, carril_numero: 1 },
      { participante_id: 2, carril_numero: 2 },
    ] as any);
    mockHeatParticipante.findOne.mockResolvedValue(null as any);
    mockHeatParticipante.create.mockResolvedValue({} as any);

    await moverAtleta(5, 10, null, superadmin);

    expect(mockHeatParticipante.create).toHaveBeenCalledWith(
      expect.objectContaining({ carril_numero: 3 }),
      expect.anything(),
    );
  });

  it('sin carril libre cuando el heat está completo', async () => {
    destinoLleno();
    mockHeatParticipante.findAll.mockResolvedValue([
      { participante_id: 1, carril_numero: 1 },
      { participante_id: 2, carril_numero: 2 },
      { participante_id: 3, carril_numero: 3 },
    ] as any);

    await expect(moverAtleta(5, 10, null, superadmin)).rejects.toThrow('El Heat 1 está lleno (3)');
  });

  it('rechaza un carril fuera del rango del heat', async () => {
    destinoLleno();
    mockHeatParticipante.findAll.mockResolvedValue([] as any);

    await expect(moverAtleta(5, 10, 9, superadmin)).rejects.toThrow(
      'El carril debe estar entre 1 y 3',
    );
  });

  it('actualiza la fila existente cuando el atleta ya tiene heat', async () => {
    destinoLleno();
    mockHeatParticipante.findAll.mockResolvedValue([
      { participante_id: 1, carril_numero: 1 },
    ] as any);
    const update = jest.fn().mockResolvedValue(undefined);
    mockHeatParticipante.findOne.mockResolvedValue({ participante_id: 5, update } as any);
    stubVistaVacia();

    await moverAtleta(5, 10, 2, superadmin);

    expect(update).toHaveBeenCalledWith({ heat_id: 10, carril_numero: 2 }, expect.anything());
    expect(mockHeatParticipante.create).not.toHaveBeenCalled();
  });
});

describe('eliminarHeat', () => {
  it('lanza error si la serie no existe', async () => {
    mockHeat.findByPk.mockResolvedValue(null);

    await expect(eliminarHeat(99, superadmin)).rejects.toThrow('Heat no encontrado');
  });

  it('rechaza eliminar un heat con atletas', async () => {
    mockHeat.findByPk.mockResolvedValue({
      id: 10,
      categoria_id: 1,
      numero: 2,
    } as any);
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockHeatParticipante.count.mockResolvedValue(2 as any);

    await expect(eliminarHeat(10, superadmin)).rejects.toThrow('Vacía el heat antes de eliminarlo');
    expect(mockHeat.findByPk).toHaveBeenCalledTimes(1); // solo se consulta una vez
  });

  it('elimina la serie y renumera las siguientes sin huecos', async () => {
    const destroy = jest.fn().mockResolvedValue(undefined);
    const update3 = jest.fn().mockResolvedValue(undefined);
    const update4 = jest.fn().mockResolvedValue(undefined);
    mockHeat.findByPk.mockResolvedValue({
      id: 10,
      categoria_id: 1,
      numero: 2,
      destroy,
    } as any);
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockHeatParticipante.count.mockResolvedValue(0 as any);
    mockHeat.findAll.mockResolvedValue([
      { id: 11, numero: 3, update: update3 },
      { id: 12, numero: 4, update: update4 },
    ] as any);
    mockHeatParticipante.findAll.mockResolvedValue([] as any);
    mockHeatHorario.findAll.mockResolvedValue([] as any);
    mockParticipante.findAll.mockResolvedValue([] as any);

    await eliminarHeat(10, superadmin);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(update3).toHaveBeenCalledWith({ numero: 2 }, expect.anything());
    expect(update4).toHaveBeenCalledWith({ numero: 3 }, expect.anything());
    expect(mockHeat.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoria_id: 1 }),
      }),
    );
  });
});

describe('limpiarCategoria', () => {
  it('informa cuántas series borró', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockHeat.destroy.mockResolvedValue(3 as any);

    const res = await limpiarCategoria(1, superadmin);

    expect(res).toEqual({ message: '3 heats eliminados' });
    expect(mockHeat.destroy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { categoria_id: 1 } }),
    );
  });

  it('informa cuando no había series', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockHeat.destroy.mockResolvedValue(0 as any);

    const res = await limpiarCategoria(1, superadmin);

    expect(res).toEqual({ message: 'La categoría no tenía heats' });
  });
});

describe('programarHorarioAuto', () => {
  function escenarioAuto(extra: Record<string, any> = {}) {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockCompetencia.findByPk.mockResolvedValue({
      id: 4,
      evento_id: 1,
      duracion_minutos: 45,
      ...extra,
    } as any);
  }

  it('rechaza una transición fuera de rango', async () => {
    escenarioAuto();

    await expect(programarHorarioAuto(1, 4, '08:00', -1, superadmin)).rejects.toThrow(
      'La transición debe estar entre 0 y 180 minutos',
    );
    await expect(programarHorarioAuto(1, 4, '08:00', 200, superadmin)).rejects.toThrow(
      'La transición debe estar entre 0 y 180 minutos',
    );
  });

  it('exige que la competencia pertenezca al evento de la categoría', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock({ evento_id: 1 }));
    mockCompetencia.findByPk.mockResolvedValue({ id: 4, evento_id: 9 } as any);

    await expect(programarHorarioAuto(1, 4, '08:00', 5, superadmin)).rejects.toThrow(
      'La competencia no pertenece al evento de la categoría',
    );
  });

  it('lanza error si la competencia no existe', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockCompetencia.findByPk.mockResolvedValue(null);

    await expect(programarHorarioAuto(1, 4, '08:00', 5, superadmin)).rejects.toThrow(
      'Competencia no encontrado',
    );
  });

  it('rechaza una hora mal formada', async () => {
    escenarioAuto();

    await expect(programarHorarioAuto(1, 4, '25:99', 5, superadmin)).rejects.toThrow(
      'Hora inválida',
    );
  });

  it('pide armar las series si la categoría está vacía', async () => {
    escenarioAuto();
    mockHeat.findAll.mockResolvedValue([] as any);

    await expect(programarHorarioAuto(1, 4, '08:00', 5, superadmin)).rejects.toThrow(
      'Primero arma las series de la categoría',
    );
  });

  it('reparte las horas sumando duración y transición', async () => {
    escenarioAuto();
    mockHeat.findAll.mockResolvedValue([
      { id: 1, numero: 1 },
      { id: 2, numero: 2 },
    ] as any);
    mockHeatHorario.bulkCreate.mockResolvedValue([] as any);

    const res = await programarHorarioAuto(1, 4, '08:30', 5, superadmin);

    expect(res.sinDuracion).toBe(false);
    expect(res.heats[0]).toMatchObject({ heat_id: 1, numero: 1, hora_inicio: '08:30:00' });
    // 08:30 + 45 min de prueba + 5 de transición = 09:20
    expect(res.heats[1]).toMatchObject({ heat_id: 2, numero: 2, hora_inicio: '09:20:00' });
    expect(mockHeatHorario.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ competencia_id: 4, heat_id: 1 })]),
      { updateOnDuplicate: ['hora_inicio'] },
    );
  });

  it('sin duración cargada solo suma la transición y lo avisa', async () => {
    escenarioAuto({ duracion_minutos: null });
    mockHeat.findAll.mockResolvedValue([
      { id: 1, numero: 1 },
      { id: 2, numero: 2 },
    ] as any);
    mockHeatHorario.bulkCreate.mockResolvedValue([] as any);

    const res = await programarHorarioAuto(1, 4, '23:50', 15, superadmin);

    expect(res.sinDuracion).toBe(true);
    expect(res.heats[0].hora_inicio).toBe('23:50:00');
    // Da la vuelta a medianoche: 23:50 + 15 = 00:05
    expect(res.heats[1].hora_inicio).toBe('00:05:00');
  });
});

describe('programarHorarioManual', () => {
  function escenarioManual() {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock());
    mockCompetencia.findByPk.mockResolvedValue({ id: 4, evento_id: 1 } as any);
    mockHeat.findAll.mockResolvedValue([
      { id: 1, numero: 1 },
      { id: 2, numero: 2 },
    ] as any);
    mockHeatHorario.bulkCreate.mockResolvedValue([] as any);
  }

  it('exige al menos un horario', async () => {
    escenarioManual();

    await expect(programarHorarioManual(1, 4, [], superadmin)).rejects.toThrow(
      'Envía al menos un horario',
    );
    await expect(programarHorarioManual(1, 4, undefined as any, superadmin)).rejects.toThrow(
      'Envía al menos un horario',
    );
  });

  it('rechaza un heat que no pertenece a la categoría', async () => {
    escenarioManual();

    await expect(
      programarHorarioManual(1, 4, [{ heat_id: 77, hora_inicio: '08:00' }], superadmin),
    ).rejects.toThrow('El heat 77 no es de esta categoría');
  });

  it('guarda las horas exactas con su número de serie', async () => {
    escenarioManual();

    const res = await programarHorarioManual(
      1,
      4,
      [
        { heat_id: 1, hora_inicio: '9:05' },
        { heat_id: 2, hora_inicio: '11:00' },
      ],
      superadmin,
    );

    expect(res.heats).toEqual([
      { heat_id: 1, competencia_id: 4, hora_inicio: '09:05:00', numero: 1 },
      { heat_id: 2, competencia_id: 4, hora_inicio: '11:00:00', numero: 2 },
    ]);
    expect(mockHeatHorario.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ heat_id: 1, hora_inicio: '09:05:00' })]),
      { updateOnDuplicate: ['hora_inicio'] },
    );
  });

  it('rechaza una hora mal formada', async () => {
    escenarioManual();

    await expect(
      programarHorarioManual(1, 4, [{ heat_id: 1, hora_inicio: 'las diez' }], superadmin),
    ).rejects.toThrow('Hora inválida');
  });
});
