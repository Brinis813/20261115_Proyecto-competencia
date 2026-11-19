jest.mock('../models', () => ({
  __esModule: true,
  Competencia: { findAll: jest.fn() },
  Evento: { findByPk: jest.fn() },
}));

jest.mock('../services/scoring/leaderboard', () => ({
  getLeaderboard: jest.fn(),
}));

import {
  getEventoLeaderboard,
  invalidateEventoLeaderboard,
} from '../services/scoring/eventoLeaderboard';
import { Evento, Competencia } from '../models';
import { getLeaderboard } from '../services/scoring/leaderboard';

const mockFindByPk = Evento.findByPk as jest.Mock;
const mockFindAll = Competencia.findAll as jest.Mock;
const mockGetLeaderboard = getLeaderboard as jest.MockedFunction<typeof getLeaderboard>;

type OpcionesEntrada = {
  puesto?: number;
  puntos?: number;
  categoria?: string;
  nombre?: string;
  apellidos?: string;
  wodsCompletados?: number;
};

function entrada(participanteId: number, opts: OpcionesEntrada = {}) {
  return {
    participante_id: participanteId,
    nombre: opts.nombre ?? `Nombre${participanteId}`,
    apellidos: opts.apellidos ?? `Apellido${participanteId}`,
    cedula: `${1000 + participanteId}`,
    box: 'Box Uno',
    categoria: opts.categoria ?? 'RX Masculino',
    puesto: opts.puesto ?? 1,
    puntos_total: opts.puntos ?? 10,
    wods_completados: opts.wodsCompletados ?? 1,
    resultados: [],
  };
}

function stubEvento(
  extra: {
    scoring_type?: string | null;
    tiebreak_policy?: string | null;
    tiebreak_competencia_id?: number | null;
  } = {},
) {
  mockFindByPk.mockResolvedValue({
    id: 1,
    nombre: 'Evento Demo',
    scoring_type: extra.scoring_type ?? null,
    tiebreak_policy: extra.tiebreak_policy ?? null,
    tiebreak_competencia_id: extra.tiebreak_competencia_id ?? null,
  } as any);
}

function stubCompetencias(ids: number[]) {
  mockFindAll.mockResolvedValue(ids.map((id) => ({ id, nombre: `C${id}` })) as any);
}

function stubLeaderboards(porCompetencia: Record<number, any[]>) {
  mockGetLeaderboard.mockImplementation((async (id: number) => ({
    leaderboard: porCompetencia[id] ?? [],
  })) as any);
}

/** La clasificación general solo existe en POINTS_ACCUMULATION. */
function generalDe(res: Awaited<ReturnType<typeof getEventoLeaderboard>>) {
  if (!res.general) throw new Error('Se esperaba una clasificación general');
  return res.general;
}

beforeEach(() => {
  jest.clearAllMocks();
  invalidateEventoLeaderboard();
});

describe('getEventoLeaderboard — errores', () => {
  it('lanza error si el evento no existe', async () => {
    mockFindByPk.mockResolvedValue(null);

    await expect(getEventoLeaderboard(999)).rejects.toThrow('Evento no encontrada');
  });
});

describe('getEventoLeaderboard — WINNER_PER_Competencia', () => {
  it('no arma general y marca al ganador de cada competencia', async () => {
    stubEvento({ scoring_type: 'WINNER_PER_Competencia', tiebreak_policy: 'NONE' });
    stubCompetencias([1, 2]);
    stubLeaderboards({
      1: [entrada(10, { puesto: 1, puntos: 100 }), entrada(11, { puesto: 2, puntos: 90 })],
      2: [entrada(12, { puesto: 1, puntos: 80 })],
    });

    const res = await getEventoLeaderboard(1);

    expect(res.general).toBeNull();
    expect(res.porCompetencia).toHaveLength(2);
    expect(res.porCompetencia[0].competencia).toEqual({ id: 1, nombre: 'C1' });
    expect(res.porCompetencia[0].ganador.participante_id).toBe(10);
    expect(res.porCompetencia[1].ganador.participante_id).toBe(12);
    expect(res.evento).toEqual({
      id: 1,
      nombre: 'Evento Demo',
      scoringType: 'WINNER_PER_Competencia',
      tiebreakPolicy: 'NONE',
      tiebreakCompetenciaId: null,
    });
    expect(typeof res.actualizado).toBe('string');
  });

  it('ganador es null cuando la competencia queda sin resultados tras filtrar', async () => {
    stubEvento({ scoring_type: 'WINNER_PER_Competencia' });
    stubCompetencias([1]);
    stubLeaderboards({ 1: [entrada(10, { categoria: 'RX Femenino' })] });

    const res = await getEventoLeaderboard(1, 'Masculino');

    expect(res.porCompetencia[0].ganador).toBeNull();
    expect(res.porCompetencia[0].leaderboard).toEqual([]);
  });
});

describe('getEventoLeaderboard — POINTS_ACCUMULATION', () => {
  it('suma puntos entre competencias y usa los defaults de política', async () => {
    stubEvento();
    stubCompetencias([1, 2]);
    stubLeaderboards({
      1: [entrada(1, { puesto: 1, puntos: 100 }), entrada(2, { puesto: 2, puntos: 90 })],
      2: [entrada(1, { puesto: 2, puntos: 50 }), entrada(2, { puesto: 1, puntos: 110 })],
    });

    const res = await getEventoLeaderboard(1);

    expect(res.evento.scoringType).toBe('POINTS_ACCUMULATION');
    expect(res.evento.tiebreakPolicy).toBe('BEST_INDIVIDUAL_RANK');
    const gen = generalDe(res);
    expect(gen).toHaveLength(2);

    const primero = gen[0];
    const segundo = gen[1];

    expect(primero.participante_id).toBe(2);
    expect(primero.puntos_total).toBe(200);
    expect(primero.wods_completados).toBe(2);
    expect(primero.puesto).toBe(1);
    expect(primero.comparte_puesto).toBe(false);

    expect(segundo.participante_id).toBe(1);
    expect(segundo.puntos_total).toBe(150);
    expect(segundo.puesto).toBe(2);

    // Proyección limpia: los campos internos de desempate no se filtran.
    expect(Object.keys(primero)).not.toContain('_cuenta');
    expect(Object.keys(primero)).not.toContain('_puestos');
    expect(Object.keys(primero)).not.toContain('_competencias');
  });

  it('filtra por etiqueta exacta de categoría antes de acumular', async () => {
    stubEvento();
    stubCompetencias([1]);
    stubLeaderboards({
      1: [
        entrada(1, { categoria: 'RX Femenino', puesto: 1, puntos: 50 }),
        entrada(2, { categoria: 'Masculino', puesto: 2, puntos: 40 }),
      ],
    });

    const res = await getEventoLeaderboard(1, 'RX Femenino');

    const gen = generalDe(res);
    expect(gen).toHaveLength(1);
    expect(gen[0].participante_id).toBe(1);
    expect(res.porCompetencia[0].ganador.participante_id).toBe(1);
  });

  it('sin competencias devuelve general vacío', async () => {
    stubEvento();
    stubCompetencias([]);

    const res = await getEventoLeaderboard(1);

    expect(res.general).toEqual([]);
    expect(res.porCompetencia).toEqual([]);
    expect(mockGetLeaderboard).not.toHaveBeenCalled();
  });
});

describe('getEventoLeaderboard — desempate global', () => {
  it('NONE: orden alfabético y puesto compartido en el empate', async () => {
    stubEvento({ tiebreak_policy: 'NONE' });
    stubCompetencias([1]);
    stubLeaderboards({
      1: [
        entrada(1, { apellidos: 'Zeta', puntos: 100, puesto: 2 }),
        entrada(2, { apellidos: 'Alfa', puntos: 100, puesto: 1 }),
        entrada(3, { apellidos: 'Mijo', puntos: 90, puesto: 3 }),
      ],
    });

    const res = await getEventoLeaderboard(1);

    const gen = generalDe(res);
    expect(gen.map((g) => g.apellidos)).toEqual(['Alfa', 'Zeta', 'Mijo']);
    expect(gen[0].puesto).toBe(1);
    expect(gen[1].puesto).toBe(1);
    expect(gen[0].comparte_puesto).toBe(true);
    expect(gen[1].comparte_puesto).toBe(true);
    // El siguiente salta al 3.º (dos 1.os comparten el puesto).
    expect(gen[2].puesto).toBe(3);
    expect(gen[2].comparte_puesto).toBe(false);
  });

  it('BEST_INDIVIDUAL_RANK: gana quien acumula más podios 1-2-3', async () => {
    stubEvento({ tiebreak_policy: 'BEST_INDIVIDUAL_RANK' });
    stubCompetencias([1, 2]);
    stubLeaderboards({
      1: [entrada(1, { puesto: 1, puntos: 100 }), entrada(2, { puesto: 2, puntos: 90 })],
      2: [entrada(1, { puesto: 3, puntos: 10 }), entrada(2, { puesto: 2, puntos: 20 })],
    });

    const res = await getEventoLeaderboard(1);

    const gen = generalDe(res);
    // Empate en el acumulado (110 vs 110): quien tiene un 1.º puesto pasa adelante.
    expect(gen[0].participante_id).toBe(1);
    expect(gen[1].participante_id).toBe(2);
    expect(gen[0].puesto).toBe(1);
    expect(gen[1].puesto).toBe(2);
  });

  it('DESIGNATED_TIEBREAK_Competencia: decide el puesto en la competencia designada', async () => {
    stubEvento({
      tiebreak_policy: 'DESIGNATED_TIEBREAK_Competencia',
      tiebreak_competencia_id: 2,
    });
    stubCompetencias([1, 2]);
    stubLeaderboards({
      1: [entrada(1, { puesto: 1, puntos: 100 }), entrada(2, { puesto: 2, puntos: 100 })],
      2: [entrada(1, { puesto: 3, puntos: 0 }), entrada(2, { puesto: 1, puntos: 0 })],
    });

    const res = await getEventoLeaderboard(1);

    const gen = generalDe(res);
    // Los dos suman 100; en la C2 el atleta 2 fue 1.º y el 1.º fue 3.º.
    expect(gen[0].participante_id).toBe(2);
    expect(gen[1].participante_id).toBe(1);
    expect(gen[0].puesto).toBe(1);
    expect(gen[1].puesto).toBe(2);
    expect(gen[0].comparte_puesto).toBe(false);
  });

  it('LAST_Competencia_SCORE: decide el puesto en la última competencia disputada', async () => {
    stubEvento({ tiebreak_policy: 'LAST_Competencia_SCORE' });
    stubCompetencias([1, 2]);
    stubLeaderboards({
      1: [entrada(1, { puesto: 1, puntos: 100 }), entrada(2, { puesto: 2, puntos: 90 })],
      2: [entrada(1, { puesto: 3, puntos: 0 }), entrada(2, { puesto: 1, puntos: 10 })],
    });

    const res = await getEventoLeaderboard(1);

    const gen = generalDe(res);
    // Empate a 100; la última competencia (C2) la ganó el atleta 2.
    expect(gen[0].participante_id).toBe(2);
    expect(gen[1].participante_id).toBe(1);
    expect(gen[0].puesto).toBe(1);
    expect(gen[1].puesto).toBe(2);
  });
});

describe('caché del leaderboard de evento', () => {
  it('una segunda lectura dentro del TTL no vuelve a consultar', async () => {
    stubEvento();
    stubCompetencias([1]);
    stubLeaderboards({ 1: [entrada(1, { puntos: 10 })] });

    const primera = await getEventoLeaderboard(1);
    const segunda = await getEventoLeaderboard(1);

    expect(segunda).toBe(primera);
    expect(mockFindByPk).toHaveBeenCalledTimes(1);
    expect(mockGetLeaderboard).toHaveBeenCalledTimes(1);
  });

  it('pasado el TTL vuelve a calcular', async () => {
    stubEvento();
    stubCompetencias([]);

    await getEventoLeaderboard(1);
    expect(mockFindByPk).toHaveBeenCalledTimes(1);

    const ahora = Date.now();
    const espia = jest.spyOn(Date, 'now').mockReturnValue(ahora + 6_000);
    try {
      await getEventoLeaderboard(1);
    } finally {
      espia.mockRestore();
    }

    expect(mockFindByPk).toHaveBeenCalledTimes(2);
  });

  it('invalidateEventoLeaderboard(id) borra solo las claves de ese evento', async () => {
    stubEvento();
    stubCompetencias([]);

    await getEventoLeaderboard(1);
    await getEventoLeaderboard(2);
    expect(mockFindByPk).toHaveBeenCalledTimes(2);

    invalidateEventoLeaderboard(1);
    await getEventoLeaderboard(1);
    expect(mockFindByPk).toHaveBeenCalledTimes(3);

    await getEventoLeaderboard(2);
    expect(mockFindByPk).toHaveBeenCalledTimes(3);
  });

  it('invalidateEventoLeaderboard() sin argumento limpia todo', async () => {
    stubEvento();
    stubCompetencias([]);

    await getEventoLeaderboard(1);
    await getEventoLeaderboard(2);
    invalidateEventoLeaderboard();
    await getEventoLeaderboard(1);
    await getEventoLeaderboard(2);

    expect(mockFindByPk).toHaveBeenCalledTimes(4);
  });

  it('la caché LRU expulsa la entrada más vieja al llegar a 100', async () => {
    stubEvento();
    stubCompetencias([]);

    await getEventoLeaderboard(1);
    for (let id = 2; id <= 101; id++) await getEventoLeaderboard(id);
    expect(mockFindByPk).toHaveBeenCalledTimes(101);

    // La primera clave fue expulsada: vuelve a calcular.
    await getEventoLeaderboard(1);
    expect(mockFindByPk).toHaveBeenCalledTimes(102);

    // La última sigue cacheada.
    await getEventoLeaderboard(101);
    expect(mockFindByPk).toHaveBeenCalledTimes(102);
  });
});
