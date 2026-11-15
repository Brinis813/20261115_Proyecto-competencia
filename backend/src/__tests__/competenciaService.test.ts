jest.mock('../models/Competencia', () => ({
  Competencia: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
  },
  TIPOS_PARTICIPACION: ['Individual', 'Pareja', 'Equipos'],
  COMPETENCIA_TIEBREAK_POLICIES: ['NONE', 'TIEBREAK_MARK', 'DESIGNATED_CIRCUIT_SPLIT'],
}));

jest.mock('../models', () => ({
  Competencia: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
  },
  Wod: {
    findAll: jest.fn(),
    count: jest.fn(),
  },
  Resultado: {
    count: jest.fn(),
  },
  Asignacion: {
    count: jest.fn(),
  },
  Categoria: { findAll: jest.fn() },
  CompetenciaCategoria: { destroy: jest.fn(), bulkCreate: jest.fn() },
  Usuario: {},
  Participante: {},
}));

jest.mock('../config/database', () => ({
  sequelize: { transaction: jest.fn((fn: any) => fn({})) },
}));

jest.mock('../sockets/handlers', () => ({
  broadcastLeaderboard: jest.fn(),
}));

jest.mock('../types/medicion', () => ({}));

import { deleteCompetencia } from '../services/competenciaService';
import { Competencia, Resultado, Asignacion } from '../models';

const mockCompetencia = Competencia as jest.Mocked<typeof Competencia>;
const mockResultado = Resultado as jest.Mocked<typeof Resultado>;
const mockAsignacion = Asignacion as jest.Mocked<typeof Asignacion>;

beforeEach(() => jest.clearAllMocks());

describe('deleteCompetencia', () => {
  it('lanza error si la competencia no existe', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);

    await expect(deleteCompetencia(999)).rejects.toThrow('Competencia no encontrado');
  });

  it('lanza error si la competencia tiene resultados', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, destroy: jest.fn() } as any);
    mockResultado.count.mockResolvedValue(3);
    mockAsignacion.count.mockResolvedValue(0);

    await expect(deleteCompetencia(1)).rejects.toThrow('resultado(s) registrado(s)');
  });

  it('lanza error si la competencia tiene asignaciones', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 2, destroy: jest.fn() } as any);
    mockResultado.count.mockResolvedValue(0);
    mockAsignacion.count.mockResolvedValue(5);

    await expect(deleteCompetencia(2)).rejects.toThrow('asignacion(es) activa(s)');
  });

  it('lanza error si tiene tanto resultados como asignaciones (resultados primero)', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 3, destroy: jest.fn() } as any);
    mockResultado.count.mockResolvedValue(2);
    mockAsignacion.count.mockResolvedValue(1);

    await expect(deleteCompetencia(3)).rejects.toThrow('resultado(s) registrado(s)');
  });

  it('elimina competencia si no tiene dependencias', async () => {
    const destroyMock = jest.fn();
    mockCompetencia.findByPk.mockResolvedValue({ id: 4, destroy: destroyMock } as any);
    mockResultado.count.mockResolvedValue(0);
    mockAsignacion.count.mockResolvedValue(0);

    await expect(deleteCompetencia(4)).resolves.not.toThrow();
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it('verifica resultados y asignaciones en paralelo', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 5, destroy: jest.fn() } as any);
    mockResultado.count.mockResolvedValue(0);
    mockAsignacion.count.mockResolvedValue(0);

    await deleteCompetencia(5);

    expect(mockResultado.count).toHaveBeenCalledTimes(1);
    expect(mockAsignacion.count).toHaveBeenCalledTimes(1);
  });
});
