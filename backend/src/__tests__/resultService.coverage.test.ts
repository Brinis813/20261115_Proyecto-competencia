jest.mock('../models', () => ({
  Resultado: {
    create: jest.fn(),
    findAll: jest.fn(),
    destroy: jest.fn(),
  },
  Wod: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
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
  getResultsByCompetencia,
  saveSplits,
  getSplits,
} from '../services/resultService';
import { Resultado, Wod } from '../models';
import ResultadoSplit from '../models/ResultadoSplit';
import { broadcastLeaderboard } from '../sockets/handlers';

const mockResultado = Resultado as jest.Mocked<typeof Resultado>;
const mockWod = Wod as unknown as { findByPk: jest.Mock; findAll: jest.Mock };
const mockSplit = ResultadoSplit as jest.Mocked<typeof ResultadoSplit>;
const mockBroadcast = broadcastLeaderboard as jest.MockedFunction<typeof broadcastLeaderboard>;

beforeEach(() => jest.clearAllMocks());

describe('getResultsByCompetencia', () => {
  it('retorna [] si la competencia no tiene wods', async () => {
    mockWod.findAll.mockResolvedValue([]);
    const res = await getResultsByCompetencia(1);
    expect(res).toEqual([]);
    expect(mockWod.findAll).toHaveBeenCalledWith({ where: { competencia_id: 1 } });
  });

  it('busca resultados de los wods de la competencia con includes', async () => {
    mockWod.findAll.mockResolvedValue([{ id: 10 }, { id: 11 }] as any);
    const fake = [{ id: 1 }, { id: 2 }];
    mockResultado.findAll.mockResolvedValue(fake as any);

    const res = await getResultsByCompetencia(5);

    expect(res).toEqual(fake);
    expect(mockResultado.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { wod_id: [10, 11] },
        include: expect.any(Array),
      })
    );
  });
});

describe('saveResult flags', () => {
  it('guarda abandono, capado, disqualificado, detalle y desempate', async () => {
    (mockWod.findByPk as jest.Mock).mockResolvedValue({ id: 10, competencia_id: 5 } as any);
    const { Competencia, ResultHistory, AuditLog } = require('../models');
    (Competencia.findByPk as jest.Mock).mockResolvedValue(null);
    (mockResultado.create as jest.Mock).mockResolvedValue({ id: 9 } as any);
    (ResultHistory.create as jest.Mock).mockResolvedValue({} as any);
    (AuditLog.create as jest.Mock).mockResolvedValue({} as any);

    await saveResult({
      participante_id: 1,
      wod_id: 10,
      juez_id: 2,
      valor_bruto: 'DNF',
      abandono: true,
      capado: true,
      disqualificado: true,
      detalle: { total_reps: 10 } as any,
      desempate: 123,
      es_desempate: true,
    });

    expect(mockResultado.create).toHaveBeenCalledWith(
      expect.objectContaining({
        abandono: true,
        capado: true,
        disqualificado: true,
        detalle: { total_reps: 10 },
        desempate: 123,
        es_desempate: true,
      }),
      expect.anything()
    );
    // Sin evento vinculado -> evento_id null en auditoria
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ evento_id: null }),
      expect.anything()
    );
    expect(mockBroadcast).toHaveBeenCalledWith(5, { id: 9 });
  });
});

describe('resetResult sin juez', () => {
  it('usa juez_id 0 en el historial cuando no se pasa', async () => {
    (mockWod.findByPk as jest.Mock).mockResolvedValue({ id: 10, competencia_id: 5 } as any);
    const { ResultHistory } = require('../models');
    (mockResultado.destroy as jest.Mock).mockResolvedValue(1);
    (ResultHistory.create as jest.Mock).mockResolvedValue({} as any);

    await resetResult(1, 10);

    expect(ResultHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ juez_id: 0, accion: 'reseteado', resultado_id: null }),
      expect.anything()
    );
  });
});

describe('saveSplits', () => {
  it('no hace nada sin splits o con lista vacia', async () => {
    await saveSplits(1, undefined);
    await saveSplits(1, []);
    expect(mockSplit.destroy).not.toHaveBeenCalled();
    expect(mockSplit.bulkCreate).not.toHaveBeenCalled();
  });

  it('limpia e inserta splits en transaccion', async () => {
    (mockSplit.destroy as jest.Mock).mockResolvedValue(0);
    (mockSplit.bulkCreate as jest.Mock).mockResolvedValue([] as any);

    await saveSplits(7, [
      { segmento_numero: 1, segmento_nombre: 'Run', tiempo_acumulado_ms: 1000, tiempo_parcial_ms: 1000 },
      { segmento_numero: 2, segmento_nombre: 'Row', tiempo_acumulado_ms: 2500, tiempo_parcial_ms: 1500 },
    ]);

    expect(mockSplit.destroy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { resultado_id: 7 } })
    );
    expect(mockSplit.bulkCreate).toHaveBeenCalledWith(
      [
        expect.objectContaining({ resultado_id: 7, segmento_numero: 1, segmento_nombre: 'Run' }),
        expect.objectContaining({ resultado_id: 7, segmento_numero: 2, segmento_nombre: 'Row' }),
      ],
      expect.anything()
    );
  });
});

describe('getSplits', () => {
  it('retorna splits ordenados por segmento', async () => {
    const fake = [{ segmento_numero: 1 }, { segmento_numero: 2 }];
    (mockSplit.findAll as jest.Mock).mockResolvedValue(fake as any);

    const res = await getSplits(7);

    expect(res).toEqual(fake);
    expect(mockSplit.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { resultado_id: 7 },
        order: [['segmento_numero', 'ASC']],
      })
    );
  });
});
