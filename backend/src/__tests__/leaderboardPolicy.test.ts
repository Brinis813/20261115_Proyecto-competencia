jest.mock('../models', () => ({
  __esModule: true,
  Asignacion: { findAll: jest.fn() },
  Competencia: { findAll: jest.fn() },
  Wod: { findAll: jest.fn() },
  Resultado: { findAll: jest.fn() },
  Participante: {},
}));

import { getParticipantPosition } from '../services/scoring/leaderboard';
import { Asignacion, Competencia, Wod, Resultado } from '../models';

const DOS_IGUALES = [
  {
    id: 1,
    participante_id: 1,
    wod_id: 11,
    valor_bruto: '50',
    abandono: false,
    capado: false,
    disqualificado: false,
    desempate: 1,
  },
  {
    id: 2,
    participante_id: 2,
    wod_id: 11,
    valor_bruto: '50',
    abandono: false,
    capado: false,
    disqualificado: false,
    desempate: 2,
  },
];

function mocks(policy: string | null) {
  (Asignacion as any).findAll.mockResolvedValue([{ competencia_id: 1 }]);
  (Competencia as any).findAll.mockResolvedValue([
    { id: 1, nombre: 'C1', tiebreak_policy: policy },
  ]);
  (Wod as any).findAll.mockResolvedValue([
    { id: 11, competencia_id: 1, tipo_medicion: 'repeticiones', puntaje_maximo: 100 },
  ]);
  (Resultado as any).findAll.mockResolvedValue(DOS_IGUALES);
}

describe('getParticipantPosition converge con el leaderboard (policy)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('NONE: misma marca = mismo puesto y mismos puntos (desempate ignorado)', async () => {
    mocks('NONE');
    const pos = await getParticipantPosition(1);
    expect(pos[0].puntos_total).toBe(100);
    const pos2 = await getParticipantPosition(2);
    expect(pos2[0].puntos_total).toBe(100);
  });

  it('estándar: el menor desempate gana (100 vs 99)', async () => {
    mocks('DESIGNATED_CIRCUIT_SPLIT');
    const pos = await getParticipantPosition(1);
    expect(pos[0].puntos_total).toBe(100);
    const pos2 = await getParticipantPosition(2);
    expect(pos2[0].puntos_total).toBe(99);
  });

  it('sin competencias asignadas → []', async () => {
    (Asignacion as any).findAll.mockResolvedValue([]);
    await expect(getParticipantPosition(1)).resolves.toEqual([]);
  });
});
