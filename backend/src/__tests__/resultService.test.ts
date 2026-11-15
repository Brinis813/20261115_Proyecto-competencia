jest.mock('../models', () => ({
  Resultado: {
    create: jest.fn(),
    findAll: jest.fn(),
    destroy: jest.fn(),
  },
  Wod: {
    findByPk: jest.fn(),
  },
  Participante: {},
  Competencia: {
    findByPk: jest.fn(),
  },
  AuditLog: {
    create: jest.fn(),
  },
  ResultHistory: {
    create: jest.fn(),
  },
}));

jest.mock('../models/ResultadoSplit', () => ({
  __esModule: true,
  default: {
    destroy: jest.fn(),
    bulkCreate: jest.fn(),
    findAll: jest.fn(),
  },
}));

jest.mock('../config/database', () => ({
  sequelize: {
    transaction: jest.fn((fn: any) => fn({})),
  },
}));

jest.mock('../sockets/handlers', () => ({
  broadcastLeaderboard: jest.fn(),
}));

import {
  saveResult,
  resetResult,
  getResultsByParticipant,
} from '../services/resultService';
import { Resultado, Wod, AuditLog, ResultHistory, Competencia } from '../models';
import ResultadoSplit from '../models/ResultadoSplit';
import { broadcastLeaderboard } from '../sockets/handlers';

const mockResultado = Resultado as jest.Mocked<typeof Resultado>;
const mockWod = Wod as jest.Mocked<typeof Wod>;
const mockAuditLog = AuditLog as jest.Mocked<typeof AuditLog>;
const mockResultHistory = ResultHistory as jest.Mocked<typeof ResultHistory>;
const mockCompetencia = Competencia as jest.Mocked<typeof Competencia>;
const mockResultadoSplit = ResultadoSplit as jest.Mocked<typeof ResultadoSplit>;
const mockBroadcast = broadcastLeaderboard as jest.MockedFunction<typeof broadcastLeaderboard>;

beforeEach(() => jest.clearAllMocks());

describe('saveResult', () => {
  it('lanza error si el WOD no existe', async () => {
    mockWod.findByPk.mockResolvedValue(null);

    await expect(
      saveResult({
        participante_id: 1,
        wod_id: 99,
        juez_id: 2,
        valor_bruto: '120',
      })
    ).rejects.toThrow('WOD no encontrado');
  });

  it('crea resultado con los campos correctos', async () => {
    mockWod.findByPk.mockResolvedValue({ id: 10, competencia_id: 5 } as any);
    mockCompetencia.findByPk.mockResolvedValue({ evento_id: 3 } as any);
    const created = { id: 42 };
    mockResultado.create.mockResolvedValue(created as any);
    mockResultHistory.create.mockResolvedValue({} as any);
    mockAuditLog.create.mockResolvedValue({} as any);

    await saveResult({
      participante_id: 1,
      wod_id: 10,
      juez_id: 2,
      valor_bruto: '180',
    });

    expect(mockResultado.create).toHaveBeenCalledWith(
      expect.objectContaining({
        participante_id: 1,
        wod_id: 10,
        juez_id: 2,
        valor_bruto: '180',
        puntos_calculados: 0,
        abandono: false,
        capado: false,
        disqualificado: false,
      }),
      expect.anything()
    );
  });

  it('registra historial y auditoría', async () => {
    mockWod.findByPk.mockResolvedValue({ id: 10, competencia_id: 5 } as any);
    mockCompetencia.findByPk.mockResolvedValue({ evento_id: 3 } as any);
    mockResultado.create.mockResolvedValue({ id: 7 } as any);
    mockResultHistory.create.mockResolvedValue({} as any);
    mockAuditLog.create.mockResolvedValue({} as any);

    await saveResult({
      participante_id: 1,
      wod_id: 10,
      juez_id: 2,
      valor_bruto: '90',
    });

    expect(mockResultHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        resultado_id: 7,
        participante_id: 1,
        wod_id: 10,
        accion: 'creado',
      }),
      expect.anything()
    );

    expect(mockAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'resultado.creado',
        entidad: 'resultados',
        entidad_id: 7,
        usuario_id: 2,
      }),
      expect.anything()
    );
  });

  it('llama a broadcastLeaderboard con la competencia', async () => {
    mockWod.findByPk.mockResolvedValue({ id: 10, competencia_id: 5 } as any);
    mockCompetencia.findByPk.mockResolvedValue({ evento_id: 3 } as any);
    const created = { id: 42 };
    mockResultado.create.mockResolvedValue(created as any);
    mockResultHistory.create.mockResolvedValue({} as any);
    mockAuditLog.create.mockResolvedValue({} as any);

    await saveResult({
      participante_id: 1,
      wod_id: 10,
      juez_id: 2,
      valor_bruto: '120',
    });

    expect(mockBroadcast).toHaveBeenCalledWith(5, created);
  });
});

describe('resetResult', () => {
  it('lanza error si el WOD no existe', async () => {
    mockWod.findByPk.mockResolvedValue(null);

    await expect(resetResult(1, 99)).rejects.toThrow('WOD no encontrado');
  });

  it('lanza error si no existe resultado para resetear', async () => {
    mockWod.findByPk.mockResolvedValue({ id: 10, competencia_id: 5 } as any);
    mockResultado.destroy.mockResolvedValue(0);

    await expect(resetResult(1, 10)).rejects.toThrow(
      'No se encontro un resultado para resetear'
    );
  });

  it('elimina el resultado y registra historial', async () => {
    mockWod.findByPk.mockResolvedValue({ id: 10, competencia_id: 5 } as any);
    mockResultado.destroy.mockResolvedValue(1);
    mockResultHistory.create.mockResolvedValue({} as any);

    const result = await resetResult(3, 10, 2);

    expect(result).toBe(1);
    expect(mockResultado.destroy).toHaveBeenCalledWith({
      where: { participante_id: 3, wod_id: 10 },
      transaction: expect.anything(),
    });
    expect(mockResultHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        participante_id: 3,
        wod_id: 10,
        juez_id: 2,
        accion: 'reseteado',
      }),
      expect.anything()
    );
  });

  it('llama a broadcastLeaderboard después de eliminar', async () => {
    mockWod.findByPk.mockResolvedValue({ id: 10, competencia_id: 5 } as any);
    mockResultado.destroy.mockResolvedValue(2);
    mockResultHistory.create.mockResolvedValue({} as any);

    await resetResult(1, 10);

    expect(mockBroadcast).toHaveBeenCalledWith(5);
  });
});

describe('getResultsByParticipant', () => {
  it('retorna resultados con include de Wod', async () => {
    const fakeResults = [{ id: 1, participante_id: 3, wod_id: 10 }];
    mockResultado.findAll.mockResolvedValue(fakeResults as any);

    const results = await getResultsByParticipant(3);

    expect(results).toEqual(fakeResults);
    expect(mockResultado.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { participante_id: 3 },
        include: expect.arrayContaining([
          expect.objectContaining({ model: expect.anything() }),
        ]),
      })
    );
  });
});
