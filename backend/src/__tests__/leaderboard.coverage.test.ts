jest.mock('../models', () => ({
  __esModule: true,
  Resultado: { findAll: jest.fn(), bulkCreate: jest.fn() },
  Wod: { findAll: jest.fn(), findByPk: jest.fn() },
  Participante: {},
  Asignacion: { findAll: jest.fn() },
  Competencia: { findByPk: jest.fn(), findAll: jest.fn() },
}));

import {
  calcularPuntuaciones,
  getLeaderboard,
  invalidateLeaderboardCache,
} from '../services/scoring/leaderboard';
import { Resultado, Wod, Asignacion, Competencia } from '../models';

const mockResultado = Resultado as unknown as { findAll: jest.Mock; bulkCreate: jest.Mock };
const mockWod = Wod as unknown as { findAll: jest.Mock };
const mockAsignacion = Asignacion as unknown as { findAll: jest.Mock };
const mockCompetencia = Competencia as unknown as { findByPk: jest.Mock };

const WOD_BASE = {
  id: 11,
  orden: 1,
  nombre_ejercicio: 'WOD 1',
  tipo_medicion: 'repeticiones',
  unidad_distancia: null,
  imagen_url: null,
  tiempo_cap: null,
  esquema: null,
  puntaje_maximo: 100,
};

function fila(
  id: number,
  participanteId: number,
  extra: Record<string, any> = {},
): Record<string, any> {
  return {
    id,
    participante_id: participanteId,
    wod_id: 11,
    valor_bruto: '50',
    abandono: false,
    capado: false,
    disqualificado: false,
    desempate: null,
    puntos_calculados: 0,
    ...extra,
  };
}

function asignacionDe(participante: Record<string, any> | null) {
  return { get: jest.fn().mockReturnValue(participante) };
}

beforeEach(() => {
  jest.clearAllMocks();
  invalidateLeaderboardCache();
});

describe('calcularPuntuaciones', () => {
  it('retorna mapa vacío si la competencia no tiene wods', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, tiebreak_policy: null });
    mockWod.findAll.mockResolvedValue([]);

    const res = await calcularPuntuaciones(1);

    expect(res.size).toBe(0);
    expect(mockResultado.findAll).not.toHaveBeenCalled();
  });

  it('lee política y wods de la base cuando no vienen precargados', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, tiebreak_policy: 'NONE' });
    mockWod.findAll.mockResolvedValue([WOD_BASE]);
    mockResultado.findAll.mockResolvedValue([]);

    await calcularPuntuaciones(1);

    expect(mockCompetencia.findByPk).toHaveBeenCalledWith(1, {
      attributes: ['id', 'tiebreak_policy'],
    });
    expect(mockWod.findAll).toHaveBeenCalledWith({
      where: { competencia_id: 1 },
      attributes: ['id', 'tipo_medicion', 'puntaje_maximo'],
      order: [['orden', 'ASC']],
    });
  });

  it('usa la política por defecto cuando la competencia no existe', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);
    mockWod.findAll.mockResolvedValue([WOD_BASE]);
    mockResultado.findAll.mockResolvedValue([
      fila(100, 1, { valor_bruto: '50', desempate: 5 }),
      fila(101, 2, { valor_bruto: '50', desempate: 1 }),
    ]);

    const res = await calcularPuntuaciones(1);

    // Sin política cargada manda el desempate del juez: gana el menor.
    const filas = res.get(11);
    expect(filas?.map((f) => f.participante_id)).toEqual([2, 1]);
    expect(filas?.[0].puntos).toBe(100);
    expect(filas?.[1].puntos).toBe(99);
  });

  it('persiste en una sola escritura solo los puntos que cambiaron', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, tiebreak_policy: 'NONE' });
    mockWod.findAll.mockResolvedValue([WOD_BASE]);
    mockResultado.findAll.mockResolvedValue([
      fila(100, 1, { valor_bruto: '70', puntos_calculados: 100 }),
      fila(101, 2, { valor_bruto: '40', puntos_calculados: 0 }),
    ]);

    await calcularPuntuaciones(1);

    // El 1.º ya tenía 100 puntos: solo se actualiza el segundo.
    expect(mockResultado.bulkCreate).toHaveBeenCalledTimes(1);
    expect(mockResultado.bulkCreate).toHaveBeenCalledWith([{ id: 101, puntos_calculados: 99 }], {
      updateOnDuplicate: ['puntos_calculados'],
    });
  });

  it('no escribe nada cuando ningún punto cambia', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, tiebreak_policy: 'NONE' });
    mockWod.findAll.mockResolvedValue([WOD_BASE]);
    mockResultado.findAll.mockResolvedValue([
      fila(100, 1, { valor_bruto: '70', puntos_calculados: 100 }),
      fila(101, 2, { valor_bruto: '40', puntos_calculados: 99 }),
    ]);

    await calcularPuntuaciones(1);

    expect(mockResultado.bulkCreate).not.toHaveBeenCalled();
  });

  it('quiebra la caché del leaderboard tras recalcular', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);
    mockWod.findAll.mockResolvedValue([]);
    mockResultado.findAll.mockResolvedValue([]);

    await calcularPuntuaciones(42);

    const res = await calcularPuntuaciones(42);
    expect(res.size).toBe(0);
    // La caché se limpia en cada recálculo: la segunda llamada vuelve a consultar.
    expect(mockCompetencia.findByPk).toHaveBeenCalledTimes(2);
  });
});

describe('getLeaderboard', () => {
  function stubEscenario(opts: { policy?: string | null; desempateId?: number | null } = {}) {
    mockCompetencia.findByPk.mockResolvedValue({
      id: 1,
      nombre: 'Final',
      descripcion: 'La final',
      divisiones: ['RX'],
      tiebreak_policy: opts.policy ?? 'DESIGNATED_CIRCUIT_SPLIT',
      wod_desempate_id: opts.desempateId ?? null,
    });
    mockWod.findAll.mockResolvedValue([WOD_BASE]);
    mockAsignacion.findAll.mockResolvedValue([]);
    mockResultado.findAll.mockResolvedValue([]);
  }

  it('retorna vacío cuando no hay atletas asignados', async () => {
    stubEscenario();

    const res = await getLeaderboard(1);

    expect(res.competencia).toEqual({
      id: 1,
      nombre: 'Final',
      descripcion: 'La final',
      divisiones: ['RX'],
      tiebreakPolicy: 'DESIGNATED_CIRCUIT_SPLIT',
    });
    expect(res.leaderboard).toEqual([]);
    expect(res.wods).toEqual([
      {
        id: 11,
        orden: 1,
        nombre_ejercicio: 'WOD 1',
        tipo_medicion: 'repeticiones',
        unidad_distancia: 'm',
        imagen_url: null,
        tiempo_cap: null,
        esquema: null,
        puntaje_maximo: 100,
      },
    ]);
    expect(typeof res.actualizado).toBe('string');
  });

  it('arma una fila por atleta con sus resultados puntuados', async () => {
    stubEscenario();
    mockAsignacion.findAll.mockResolvedValue([
      asignacionDe({
        id: 1,
        nombre: 'Ana',
        apellidos: 'Zapata',
        cedula: '111',
        box: 'Box Uno',
        categoria: 'RX',
      }),
      asignacionDe({
        id: 2,
        nombre: 'Beto',
        apellidos: 'Arias',
        cedula: '222',
        box: 'Box Dos',
        categoria: 'RX',
      }),
      asignacionDe(null),
      asignacionDe({ id: 1, nombre: 'Ana', apellidos: 'Zapata', cedula: '111' }),
    ]);
    mockResultado.findAll.mockResolvedValue([
      fila(100, 1, { valor_bruto: '70' }),
      fila(101, 2, { valor_bruto: '40' }),
    ]);

    const res = await getLeaderboard(1);

    // Sin participante y duplicados no generan fila.
    expect(res.leaderboard).toHaveLength(2);

    const ana = res.leaderboard[0];
    expect(ana.participante_id).toBe(1);
    expect(ana.box).toBe('Box Uno');
    expect(ana.puntos_total).toBe(100);
    expect(ana.wods_completados).toBe(1);
    expect(ana.puesto).toBe(1);
    expect(ana.comparte_puesto).toBe(false);
    expect(ana.resultados[0]).toMatchObject({
      resultado_id: 100,
      wod_id: 11,
      valor_bruto: '70',
      puntos_calculados: 100,
      posicion: 1,
      abandono: false,
      capado: false,
    });

    const beto = res.leaderboard[1];
    expect(beto.puntos_total).toBe(99);
    expect(beto.puesto).toBe(2);
  });

  it('el atleta sin resultados conserva la fila vacía con cero puntos', async () => {
    stubEscenario();
    mockAsignacion.findAll.mockResolvedValue([
      asignacionDe({ id: 9, nombre: 'Solo', apellidos: 'Asignado', cedula: '9', box: null }),
    ]);
    mockResultado.findAll.mockResolvedValue([]);

    const res = await getLeaderboard(1);

    expect(res.leaderboard).toHaveLength(1);
    expect(res.leaderboard[0].puntos_total).toBe(0);
    expect(res.leaderboard[0].wods_completados).toBe(0);
    expect(res.leaderboard[0].box).toBeNull();
    expect(res.leaderboard[0].categoria).toBeNull();
    expect(res.leaderboard[0].resultados[0]).toMatchObject({
      resultado_id: 0,
      valor_bruto: null,
      posicion: null,
    });
  });

  it('comparte el puesto cuando dos atletas suman los mismos puntos', async () => {
    stubEscenario({ policy: 'NONE' });
    mockAsignacion.findAll.mockResolvedValue([
      asignacionDe({ id: 1, nombre: 'Ana', apellidos: 'Zapata', cedula: '1' }),
      asignacionDe({ id: 2, nombre: 'Beto', apellidos: 'Arias', cedula: '2' }),
      asignacionDe({ id: 3, nombre: 'Cami', apellidos: 'Mora', cedula: '3' }),
    ]);
    mockResultado.findAll.mockResolvedValue([
      fila(100, 1, { valor_bruto: '50' }),
      fila(101, 2, { valor_bruto: '50' }),
      fila(102, 3, { valor_bruto: '10' }),
    ]);

    const res = await getLeaderboard(1);

    expect(res.leaderboard.map((e) => e.apellidos)).toEqual(['Arias', 'Zapata', 'Mora']);
    expect(res.leaderboard[0].puesto).toBe(1);
    expect(res.leaderboard[1].puesto).toBe(1);
    expect(res.leaderboard[0].comparte_puesto).toBe(true);
    expect(res.leaderboard[1].comparte_puesto).toBe(true);
    expect(res.leaderboard[2].puesto).toBe(3);
    expect(res.leaderboard[2].comparte_puesto).toBe(false);
  });

  it('rompe el empate con el wod designado como desempate', async () => {
    const wod2 = { ...WOD_BASE, id: 12, orden: 2, nombre_ejercicio: 'WOD 2' };
    mockCompetencia.findByPk.mockResolvedValue({
      id: 1,
      nombre: 'Final',
      descripcion: null,
      divisiones: null,
      tiebreak_policy: 'DESIGNATED_CIRCUIT_SPLIT',
      wod_desempate_id: 11,
    });
    mockWod.findAll.mockResolvedValue([WOD_BASE, wod2]);
    mockAsignacion.findAll.mockResolvedValue([
      asignacionDe({ id: 1, nombre: 'Ana', apellidos: 'Zapata', cedula: '1' }),
      asignacionDe({ id: 2, nombre: 'Beto', apellidos: 'Arias', cedula: '2' }),
    ]);
    // Mismos puntos (199 vs 199): en el wod designado (11) el atleta 1 fue 1.º.
    mockResultado.findAll.mockResolvedValue([
      fila(100, 1, { wod_id: 11, valor_bruto: '70' }),
      fila(101, 2, { wod_id: 11, valor_bruto: '40' }),
      fila(102, 2, { wod_id: 12, valor_bruto: '70' }),
      fila(103, 1, { wod_id: 12, valor_bruto: '40' }),
    ]);

    const res = await getLeaderboard(1);

    // Sin el wod designado mandaría el alfabético (Arias primero).
    expect(res.leaderboard[0].participante_id).toBe(1);
    expect(res.leaderboard[1].participante_id).toBe(2);
    expect(res.leaderboard[0].puntos_total).toBe(199);
    expect(res.leaderboard[1].puntos_total).toBe(199);
  });

  it('con empate de puntos gana quien tenga mejor posición individual', async () => {
    const wod2 = { ...WOD_BASE, id: 12, orden: 2, nombre_ejercicio: 'WOD 2' };
    mockCompetencia.findByPk.mockResolvedValue({
      id: 1,
      nombre: 'Final',
      descripcion: null,
      divisiones: null,
      tiebreak_policy: 'DESIGNATED_CIRCUIT_SPLIT',
      wod_desempate_id: null,
    });
    mockWod.findAll.mockResolvedValue([WOD_BASE, wod2]);
    mockAsignacion.findAll.mockResolvedValue([
      asignacionDe({ id: 1, nombre: 'Ana', apellidos: 'Zapata', cedula: '1' }),
      asignacionDe({ id: 2, nombre: 'Beto', apellidos: 'Arias', cedula: '2' }),
    ]);
    // El atleta 3 no está asignado: solo existe para repartir posiciones.
    // Totales: Ana 100+98 = 198 (fue 1.ª y 3.ª); Beto 99+99 = 198 (siempre 2.º).
    mockResultado.findAll.mockResolvedValue([
      fila(100, 1, { wod_id: 11, valor_bruto: '70' }),
      fila(101, 2, { wod_id: 11, valor_bruto: '40' }),
      fila(102, 3, { wod_id: 11, valor_bruto: '30' }),
      fila(103, 3, { wod_id: 12, valor_bruto: '70' }),
      fila(104, 2, { wod_id: 12, valor_bruto: '40' }),
      fila(105, 1, { wod_id: 12, valor_bruto: '10' }),
    ]);

    const res = await getLeaderboard(1);

    // Ana tiene mejor posición individual (1.ª) pese a que el alfabético pondría a Beto.
    expect(res.leaderboard[0].participante_id).toBe(1);
    expect(res.leaderboard[1].participante_id).toBe(2);
    expect(res.leaderboard[0].puntos_total).toBe(198);
    expect(res.leaderboard[1].puntos_total).toBe(198);
    expect(res.leaderboard[0].puesto).toBe(1);
    expect(res.leaderboard[1].puesto).toBe(1);
    expect(res.leaderboard[0].comparte_puesto).toBe(true);
  });

  it('caea al orden alfabético cuando todo empata', async () => {
    stubEscenario({ policy: 'DESIGNATED_CIRCUIT_SPLIT' });
    mockAsignacion.findAll.mockResolvedValue([
      asignacionDe({ id: 1, nombre: 'Ana', apellidos: 'Zapata', cedula: '1' }),
      asignacionDe({ id: 2, nombre: 'Beto', apellidos: 'Arias', cedula: '2' }),
    ]);
    mockResultado.findAll.mockResolvedValue([
      fila(100, 1, { valor_bruto: '50', desempate: 3 }),
      fila(101, 2, { valor_bruto: '50', desempate: 3 }),
    ]);

    const res = await getLeaderboard(1);

    expect(res.leaderboard.map((e) => e.apellidos)).toEqual(['Arias', 'Zapata']);
    expect(res.leaderboard[0].puesto).toBe(1);
    expect(res.leaderboard[1].puesto).toBe(1);
    expect(res.leaderboard[0].comparte_puesto).toBe(true);
  });

  it('retorna null en competencia cuando la base no la tiene', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);
    mockWod.findAll.mockResolvedValue([]);
    mockAsignacion.findAll.mockResolvedValue([]);
    mockResultado.findAll.mockResolvedValue([]);

    const res = await getLeaderboard(7);

    expect(res.competencia).toBeNull();
  });

  it('sirve desde la caché sin volver a consultar', async () => {
    stubEscenario();

    const primera = await getLeaderboard(1);
    const segunda = await getLeaderboard(1);

    expect(segunda).toBe(primera);
    expect(mockCompetencia.findByPk).toHaveBeenCalledTimes(1);
    expect(mockAsignacion.findAll).toHaveBeenCalledTimes(1);
  });

  it('invalidateLeaderboardCache(id) solo limpia esa competencia', async () => {
    stubEscenario();

    await getLeaderboard(1);
    await getLeaderboard(2);
    expect(mockCompetencia.findByPk).toHaveBeenCalledTimes(2);

    invalidateLeaderboardCache(1);
    await getLeaderboard(1);
    expect(mockCompetencia.findByPk).toHaveBeenCalledTimes(3);

    await getLeaderboard(2);
    expect(mockCompetencia.findByPk).toHaveBeenCalledTimes(3);
  });

  it('invalidateLeaderboardCache() sin argumento limpia todo', async () => {
    stubEscenario();

    await getLeaderboard(1);
    await getLeaderboard(2);
    invalidateLeaderboardCache();
    await getLeaderboard(1);
    await getLeaderboard(2);

    expect(mockCompetencia.findByPk).toHaveBeenCalledTimes(4);
  });
});
