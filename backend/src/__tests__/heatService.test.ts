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

import { generarHeats, moverAtleta, quitarAtleta } from '../services/heatService';
import { Heat, HeatParticipante, HeatHorario, Categoria, Participante } from '../models';

const mockHeat = Heat as jest.Mocked<typeof Heat>;
const mockHeatParticipante = HeatParticipante as jest.Mocked<typeof HeatParticipante>;
const mockHeatHorario = HeatHorario as jest.Mocked<typeof HeatHorario>;
const mockCategoria = Categoria as jest.Mocked<typeof Categoria>;
const mockParticipante = Participante as jest.Mocked<typeof Participante>;

const superadminAlcance = { permitidas: null } as any;

function stubConstruirVista() {
  mockHeat.findAll.mockResolvedValue([]);
  mockHeatParticipante.findAll.mockResolvedValue([]);
  mockHeatHorario.findAll.mockResolvedValue([]);
  mockParticipante.findAll.mockResolvedValue([]);
}

beforeEach(() => jest.clearAllMocks());

describe('generarHeats', () => {
  it('lanza error si la categoría no existe', async () => {
    mockCategoria.findByPk.mockResolvedValue(null);

    await expect(generarHeats(99, 4, 'alfabetico', superadminAlcance)).rejects.toThrow(
      'Categoría no encontrada',
    );
  });

  it('lanza error si no hay atletas inscritos', async () => {
    mockCategoria.findByPk.mockResolvedValue({
      id: 1,
      evento_id: 10,
      nombre: 'RX',
      genero: 'Masculino',
    } as any);
    mockHeat.destroy.mockResolvedValue([] as any);
    mockParticipante.findAll.mockResolvedValue([]);

    await expect(generarHeats(1, 4, 'alfabetico', superadminAlcance)).rejects.toThrow(
      'La categoría no tiene atletas inscritos',
    );
  });

  it('crea heats con participantes en modo alfabético', async () => {
    mockCategoria.findByPk.mockResolvedValue({
      id: 1,
      evento_id: 10,
      nombre: 'RX',
      genero: 'Masculino',
    } as any);
    mockHeat.destroy.mockResolvedValue([] as any);

    const atletas = [
      { id: 1, nombre: 'Ana', apellidos: 'Rojas', cedula: '001', categoria_id: 1, evento_id: 10 },
      {
        id: 2,
        nombre: 'Carlos',
        apellidos: 'Duarte',
        cedula: '002',
        categoria_id: 1,
        evento_id: 10,
      },
      { id: 3, nombre: 'Luis', apellidos: 'Perez', cedula: '003', categoria_id: 1, evento_id: 10 },
    ];
    mockParticipante.findAll.mockResolvedValueOnce(atletas as any).mockResolvedValue([]);
    mockHeat.create.mockResolvedValue({ id: 100, numero: 1 } as any);
    mockHeatParticipante.bulkCreate.mockResolvedValue([] as any);

    stubConstruirVista();
    // Restore Participante.findAll for the athlete query since stubConstruirVista reset it
    mockParticipante.findAll.mockResolvedValueOnce(atletas as any).mockResolvedValue([] as any);
    mockHeat.findAll.mockResolvedValue([]);
    mockHeatParticipante.findAll.mockResolvedValue([]);
    mockHeatHorario.findAll.mockResolvedValue([]);

    const result = await generarHeats(1, 2, 'alfabetico', superadminAlcance);

    expect(mockHeat.create).toHaveBeenCalledTimes(2);
    expect(mockHeatParticipante.bulkCreate).toHaveBeenCalledTimes(2);
    expect(result.heats).toBeDefined();
  });

  it('lanza error con modo inválido', async () => {
    mockCategoria.findByPk.mockResolvedValue({
      id: 1,
      evento_id: 10,
    } as any);

    await expect(generarHeats(1, 4, 'otro' as any, superadminAlcance)).rejects.toThrow(
      'Modo inválido: usa alfabetico o aleatorio',
    );
  });

  it('lanza error si capacidad es inválida', async () => {
    await expect(generarHeats(1, 0, 'alfabetico')).rejects.toThrow(
      'La capacidad máxima debe estar entre 1 y 50',
    );
    await expect(generarHeats(1, 60, 'alfabetico')).rejects.toThrow(
      'La capacidad máxima debe estar entre 1 y 50',
    );
  });
});

describe('moverAtleta', () => {
  it('lanza error si el heat destino no existe', async () => {
    mockHeat.findByPk.mockResolvedValue(null);

    await expect(moverAtleta(1, 99, null)).rejects.toThrow('Heat no encontrado');
  });

  it('lanza error si el atleta no existe', async () => {
    mockHeat.findByPk.mockResolvedValue({ id: 10, categoria_id: 1 } as any);
    mockCategoria.findByPk.mockResolvedValue({
      id: 1,
      evento_id: 10,
    } as any);
    mockParticipante.findByPk.mockResolvedValue(null);

    await expect(moverAtleta(999, 10, null, superadminAlcance)).rejects.toThrow(
      'Atleta no encontrado',
    );
  });

  it('lanza error si el atleta no pertenece a la categoría', async () => {
    mockHeat.findByPk.mockResolvedValue({ id: 10, categoria_id: 1 } as any);
    mockCategoria.findByPk.mockResolvedValue({
      id: 1,
      evento_id: 10,
    } as any);
    mockParticipante.findByPk.mockResolvedValue({
      id: 5,
      categoria_id: 2,
    } as any);

    await expect(moverAtleta(5, 10, null, superadminAlcance)).rejects.toThrow(
      'El atleta no pertenece a esta categoría',
    );
  });

  it('lanza error si el heat está lleno', async () => {
    mockHeat.findByPk.mockResolvedValue({
      id: 10,
      categoria_id: 1,
      capacidad_maxima: 2,
      numero: 1,
    } as any);
    mockCategoria.findByPk.mockResolvedValue({
      id: 1,
      evento_id: 10,
    } as any);
    mockParticipante.findByPk.mockResolvedValue({
      id: 5,
      categoria_id: 1,
    } as any);
    mockHeatParticipante.findAll.mockResolvedValue([
      { participante_id: 1, carril_numero: 1 },
      { participante_id: 2, carril_numero: 2 },
    ] as any);

    await expect(moverAtleta(5, 10, 1, superadminAlcance)).rejects.toThrow('está lleno');
  });

  it('mueve atleta a otro heat con carril específico', async () => {
    mockHeat.findByPk.mockResolvedValue({
      id: 10,
      categoria_id: 1,
      capacidad_maxima: 4,
      numero: 1,
    } as any);
    mockCategoria.findByPk.mockResolvedValue({
      id: 1,
      evento_id: 10,
    } as any);
    mockParticipante.findByPk.mockResolvedValue({
      id: 5,
      categoria_id: 1,
    } as any);
    mockHeatParticipante.findAll.mockResolvedValue([
      { participante_id: 1, carril_numero: 1 },
    ] as any);
    mockHeatParticipante.findOne.mockResolvedValue(null);
    mockHeatParticipante.create.mockResolvedValue({} as any);

    stubConstruirVista();

    await moverAtleta(5, 10, 2, superadminAlcance);

    expect(mockHeatParticipante.create).toHaveBeenCalledWith(
      expect.objectContaining({
        heat_id: 10,
        participante_id: 5,
        carril_numero: 2,
      }),
      expect.anything(),
    );
  });

  it('lanza error si el carril ya está ocupado', async () => {
    mockHeat.findByPk.mockResolvedValue({
      id: 10,
      categoria_id: 1,
      capacidad_maxima: 4,
      numero: 1,
    } as any);
    mockCategoria.findByPk.mockResolvedValue({
      id: 1,
      evento_id: 10,
    } as any);
    mockParticipante.findByPk.mockResolvedValue({
      id: 5,
      categoria_id: 1,
    } as any);
    mockHeatParticipante.findAll.mockResolvedValue([
      { participante_id: 1, carril_numero: 1 },
    ] as any);

    await expect(moverAtleta(5, 10, 1, superadminAlcance)).rejects.toThrow(
      'El carril 1 ya está ocupado',
    );
  });
});

describe('quitarAtleta', () => {
  it('lanza error si el atleta no está en ningún heat', async () => {
    mockCategoria.findByPk.mockResolvedValue({
      id: 1,
      evento_id: 10,
    } as any);
    mockHeatParticipante.destroy.mockResolvedValue(0);

    await expect(quitarAtleta(5, 1, superadminAlcance)).rejects.toThrow(
      'El atleta no está en ningún heat',
    );
  });

  it('elimina al atleta del heat correctamente', async () => {
    mockCategoria.findByPk.mockResolvedValue({
      id: 1,
      evento_id: 10,
      nombre: 'RX',
      genero: 'Masculino',
    } as any);
    mockHeatParticipante.destroy.mockResolvedValue(1);

    stubConstruirVista();

    const result = await quitarAtleta(5, 1, superadminAlcance);

    expect(mockHeatParticipante.destroy).toHaveBeenCalledWith({
      where: { participante_id: 5 },
      // quitarAtleta borra dentro de una transacción (atomicidad).
      transaction: expect.anything(),
    });
    expect(result).toBeDefined();
    expect(result.categoria.id).toBe(1);
  });
});
