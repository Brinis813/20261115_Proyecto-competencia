jest.mock('../models', () => ({
  __esModule: true,
  Resultado: { findOne: jest.fn(), findByPk: jest.fn() },
  Wod: { findByPk: jest.fn(), findAll: jest.fn() },
  Participante: { findByPk: jest.fn() },
  Asignacion: { findOne: jest.fn() },
  Arranque: { findOne: jest.fn() },
  Competencia: { findByPk: jest.fn() },
  EventoUsuario: { findAll: jest.fn() },
}));

jest.mock('../services/resultService', () => ({
  saveResult: jest.fn(),
  resetResult: jest.fn(),
  getSplits: jest.fn(),
  getResultsByParticipant: jest.fn(),
  getResultsByCompetencia: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import {
  saveResult,
  checkParticipant,
  getSplits,
  resetResult,
  getResultsByParticipant,
  getResultsByCompetencia,
} from '../controllers/resultController';
import { Resultado, Wod, Participante, Asignacion, Arranque, Competencia } from '../models';
import * as resultService from '../services/resultService';
import { log } from '../utils/logger';

const mockResultado = Resultado as unknown as { findOne: jest.Mock; findByPk: jest.Mock };
const mockWod = Wod as unknown as { findByPk: jest.Mock; findAll: jest.Mock };
const mockParticipante = Participante as unknown as { findByPk: jest.Mock };
const mockAsignacion = Asignacion as unknown as { findOne: jest.Mock };
const mockArranque = Arranque as unknown as { findOne: jest.Mock };
const mockCompetencia = Competencia as unknown as { findByPk: jest.Mock };

function crearRes() {
  const res: any = { statusCode: 200, body: undefined as any };
  res.status = jest.fn((codigo: number) => {
    res.statusCode = codigo;
    return res;
  });
  res.json = jest.fn((payload: any) => {
    res.body = payload;
    return res;
  });
  return res;
}

function reqJuez(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    user: { id: 2, cedula: '67890', rol: 'juez', tipo: 'usuario' },
    alcance: { activa: 1, permitidas: null },
    body: {},
    params: {},
    ...overrides,
  } as AuthRequest;
}

/** Deja el escenario listo para que saveResult llegue al servicio. */
function escenarioSaveResult() {
  mockWod.findByPk.mockResolvedValue({ id: 11, competencia_id: 1 });
  mockParticipante.findByPk.mockResolvedValue({ id: 5 });
  mockResultado.findOne.mockResolvedValue(null);
  mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
  mockAsignacion.findOne.mockResolvedValue({ id: 7, wod_id: null });
  mockArranque.findOne.mockResolvedValue(null);
  (resultService.saveResult as jest.Mock).mockResolvedValue({ id: 99 });
}

beforeEach(() => jest.clearAllMocks());

describe('saveResult', () => {
  it('responde 404 si el WOD no existe', async () => {
    mockWod.findByPk.mockResolvedValue(null);
    mockParticipante.findByPk.mockResolvedValue({ id: 5 });
    mockResultado.findOne.mockResolvedValue(null);

    const res = crearRes();
    await saveResult(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'WOD no encontrado' });
  });

  it('responde 404 si el participante no existe', async () => {
    mockWod.findByPk.mockResolvedValue({ id: 11, competencia_id: 1 });
    mockParticipante.findByPk.mockResolvedValue(null);
    mockResultado.findOne.mockResolvedValue(null);

    const res = crearRes();
    await saveResult(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Participante no encontrado' });
  });

  it('responde 409 si ya tiene resultado en ese WOD', async () => {
    mockWod.findByPk.mockResolvedValue({ id: 11, competencia_id: 1 });
    mockParticipante.findByPk.mockResolvedValue({ id: 5 });
    mockResultado.findOne.mockResolvedValue({ id: 3 });

    const res = crearRes();
    await saveResult(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toContain('ya tiene un resultado');
  });

  it('responde 403 si la competencia queda fuera del alcance', async () => {
    mockWod.findByPk.mockResolvedValue({ id: 11, competencia_id: 1 });
    mockParticipante.findByPk.mockResolvedValue({ id: 5 });
    mockResultado.findOne.mockResolvedValue(null);
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 99 });

    const res = crearRes();
    await saveResult(
      reqJuez({
        alcance: { activa: 1, permitidas: [1] },
        body: { participante_id: 5, wod_id: 11 },
      }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No tienes acceso a esta competencia' });
    expect(resultService.saveResult).not.toHaveBeenCalled();
  });

  it('responde 403 si el juez no está asignado al WOD', async () => {
    escenarioSaveResult();
    mockAsignacion.findOne.mockResolvedValue(null);

    const res = crearRes();
    await saveResult(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No estas asignado a este WOD' });
    expect(mockAsignacion.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ competencia_id: 1 }) }),
    );
  });

  it('responde 409 mientras el heat está en pausa', async () => {
    escenarioSaveResult();
    mockArranque.findOne.mockResolvedValue({ estado: 'pausado' });

    const res = crearRes();
    await saveResult(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toContain('Heat en pausa');
    expect(resultService.saveResult).not.toHaveBeenCalled();
  });

  it('responde 409 cuando el heat ya finalizó', async () => {
    escenarioSaveResult();
    mockArranque.findOne.mockResolvedValue({ estado: 'finalizado' });

    const res = crearRes();
    await saveResult(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toContain('Heat finalizado');
  });

  it('registra el resultado del juez y responde 201', async () => {
    escenarioSaveResult();

    const res = crearRes();
    await saveResult(
      reqJuez({
        body: {
          participante_id: 5,
          wod_id: 11,
          valor_bruto: '50',
          abandono: false,
          detalle: { total_reps: 50 },
          es_desempate: true,
        },
      }),
      res as Response,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ message: 'Resultado guardado', resultado: { id: 99 } });
    expect(resultService.saveResult).toHaveBeenCalledWith(
      expect.objectContaining({
        participante_id: 5,
        wod_id: 11,
        juez_id: 2,
        valor_bruto: '50',
        es_desempate: true,
        splits: undefined,
      }),
    );
  });

  it('envía los splits en la misma llamada al servicio', async () => {
    escenarioSaveResult();
    const splits = [{ segmento_numero: 1, tiempo_acumulado_ms: 1000 }];

    const res = crearRes();
    await saveResult(
      reqJuez({ body: { participante_id: 5, wod_id: 11, detalle: { splits } } }),
      res as Response,
    );

    expect(resultService.saveResult).toHaveBeenCalledWith(
      expect.objectContaining({ splits, es_desempate: false }),
    );
  });

  it('convierte una carrera de duplicado en 409', async () => {
    escenarioSaveResult();
    (resultService.saveResult as jest.Mock).mockRejectedValue({
      name: 'SequelizeUniqueConstraintError',
      message: 'duplicate',
    });

    const res = crearRes();
    await saveResult(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toContain('ya tiene un resultado');
  });

  it('devuelve 400 con mensaje seguro ante cualquier otro fallo', async () => {
    escenarioSaveResult();
    (resultService.saveResult as jest.Mock).mockRejectedValue(
      new Error('SQLSTATE: conexion perdida'),
    );

    const res = crearRes();
    await saveResult(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
  });
});

describe('checkParticipant', () => {
  it('responde 404 si el WOD no existe', async () => {
    mockWod.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await checkParticipant(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'WOD no encontrado' });
  });

  it('responde 403 sin acceso a la competencia del WOD', async () => {
    mockWod.findByPk.mockResolvedValue({ competencia_id: 1 });
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 42 });

    const res = crearRes();
    await checkParticipant(
      reqJuez({
        alcance: { activa: 1, permitidas: [1] },
        body: { participante_id: 5, wod_id: 11 },
      }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No tienes acceso a este WOD' });
  });

  it('informa que no existe resultado previo', async () => {
    mockWod.findByPk.mockResolvedValue({ competencia_id: 1 });
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
    mockResultado.findOne.mockResolvedValue(null);

    const res = crearRes();
    await checkParticipant(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.body).toEqual({ exists: false, message: '' });
  });

  it('muestra el nombre del atleta que ya tiene resultado', async () => {
    mockWod.findByPk.mockResolvedValue({ competencia_id: 1 });
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
    mockResultado.findOne.mockResolvedValue({
      get: jest.fn().mockReturnValue({ nombre: 'Ana', apellidos: 'Zapata', cedula: '1' }),
    });

    const res = crearRes();
    await checkParticipant(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.body).toEqual({
      exists: true,
      message: 'Ana Zapata ya tiene un resultado registrado en este WOD',
    });
  });

  it('responde 500 cuando la verificación revienta', async () => {
    mockWod.findByPk.mockResolvedValue({ competencia_id: 1 });
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
    mockResultado.findOne.mockRejectedValue(new Error('caida'));

    const res = crearRes();
    await checkParticipant(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(500);
    expect(log.error).toHaveBeenCalledWith('checkParticipant error:', 'caida');
  });
});

describe('getSplits', () => {
  it('responde 404 si el resultado no existe', async () => {
    mockResultado.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await getSplits(reqJuez({ params: { id: '7' } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Resultado no encontrado' });
  });

  it('responde 404 si el resultado no tiene WOD', async () => {
    mockResultado.findByPk.mockResolvedValue({ wod_id: null });

    const res = crearRes();
    await getSplits(reqJuez({ params: { id: '7' } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Resultado sin WOD asociado' });
  });

  it('responde 404 si el WOD del resultado desapareció', async () => {
    mockResultado.findByPk.mockResolvedValue({ wod_id: 11 });
    mockWod.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await getSplits(reqJuez({ params: { id: '7' } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'WOD no encontrado' });
  });

  it('responde 403 si la competencia queda fuera del alcance', async () => {
    mockResultado.findByPk.mockResolvedValue({ wod_id: 11 });
    mockWod.findByPk.mockResolvedValue({ competencia_id: 1 });
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 9 });

    const res = crearRes();
    await getSplits(
      reqJuez({ alcance: { activa: 1, permitidas: [1] }, params: { id: '7' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No tienes acceso a este resultado' });
  });

  it('retorna los splits del resultado', async () => {
    mockResultado.findByPk.mockResolvedValue({ wod_id: 11 });
    mockWod.findByPk.mockResolvedValue({ competencia_id: 1 });
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
    const fake = [{ segmento_numero: 1 }];
    (resultService.getSplits as jest.Mock).mockResolvedValue(fake);

    const res = crearRes();
    await getSplits(reqJuez({ params: { id: '7' } }), res as Response);

    expect(res.body).toEqual(fake);
    expect(resultService.getSplits).toHaveBeenCalledWith(7);
  });

  it('responde 400 con mensaje seguro si el servicio falla', async () => {
    mockResultado.findByPk.mockResolvedValue({ wod_id: 11 });
    mockWod.findByPk.mockResolvedValue({ competencia_id: 1 });
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
    (resultService.getSplits as jest.Mock).mockRejectedValue(new Error('constraint failed'));

    const res = crearRes();
    await getSplits(reqJuez({ params: { id: '7' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
  });
});

describe('resetResult', () => {
  it('responde 404 si el WOD no existe', async () => {
    mockWod.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await resetResult(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'WOD no encontrado' });
  });

  it('responde 403 sin acceso a la competencia', async () => {
    mockWod.findByPk.mockResolvedValue({ competencia_id: 1 });
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 9 });

    const res = crearRes();
    await resetResult(
      reqJuez({
        alcance: { activa: 1, permitidas: [1] },
        body: { participante_id: 5, wod_id: 11 },
      }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No tienes acceso a este WOD' });
  });

  it('resetea la medición', async () => {
    mockWod.findByPk.mockResolvedValue({ competencia_id: 1 });
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
    (resultService.resetResult as jest.Mock).mockResolvedValue(undefined);

    const res = crearRes();
    await resetResult(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.body).toEqual({ message: 'Medicion reseteada correctamente' });
    expect(resultService.resetResult).toHaveBeenCalledWith(5, 11);
  });

  it('devuelve 404 cuando el servicio no encuentra la medición', async () => {
    mockWod.findByPk.mockResolvedValue({ competencia_id: 1 });
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
    (resultService.resetResult as jest.Mock).mockRejectedValue(
      new Error('No se encontro la medicion'),
    );

    const res = crearRes();
    await resetResult(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toContain('No se encontro');
  });

  it('devuelve 400 ante otros fallos del servicio', async () => {
    mockWod.findByPk.mockResolvedValue({ competencia_id: 1 });
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
    (resultService.resetResult as jest.Mock).mockRejectedValue(new Error('bloqueo de fila'));

    const res = crearRes();
    await resetResult(reqJuez({ body: { participante_id: 5, wod_id: 11 } }), res as Response);

    expect(res.statusCode).toBe(400);
  });
});

describe('getResultsByParticipant', () => {
  it('responde 400 con identificador no numérico', async () => {
    const res = crearRes();
    await getResultsByParticipant(reqJuez({ params: { participantId: 'abc' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador invalido' });
  });

  it('un atleta no puede leer los resultados de otro', async () => {
    const res = crearRes();
    await getResultsByParticipant(
      reqJuez({
        user: { id: 3, cedula: 'y', rol: 'participante', tipo: 'participante' },
        params: { participantId: '7' },
      }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'Solo puedes consultar tus propios resultados' });
    expect(resultService.getResultsByParticipant).not.toHaveBeenCalled();
  });

  it('un atleta sí puede leer los suyos', async () => {
    const fake = [{ id: 1 }];
    (resultService.getResultsByParticipant as jest.Mock).mockResolvedValue(fake);

    const res = crearRes();
    await getResultsByParticipant(
      reqJuez({
        user: { id: 7, cedula: 'y', rol: 'participante', tipo: 'participante' },
        params: { participantId: '7' },
      }),
      res as Response,
    );

    expect(res.body).toEqual(fake);
    expect(resultService.getResultsByParticipant).toHaveBeenCalledWith(7);
  });

  it('el staff no ve atletas de otro evento', async () => {
    mockParticipante.findByPk.mockResolvedValue({ evento_id: 42 });

    const res = crearRes();
    await getResultsByParticipant(
      reqJuez({ alcance: { activa: 1, permitidas: [1] }, params: { participantId: '7' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No tienes acceso a este participante' });
  });

  it('el staff sí ve los atletas de su evento', async () => {
    mockParticipante.findByPk.mockResolvedValue({ evento_id: 1 });
    const fake = [{ id: 4 }];
    (resultService.getResultsByParticipant as jest.Mock).mockResolvedValue(fake);

    const res = crearRes();
    await getResultsByParticipant(reqJuez({ params: { participantId: '7' } }), res as Response);

    expect(res.body).toEqual(fake);
  });

  it('si el atleta no existe el staff sigue sin enumerar usuarios', async () => {
    mockParticipante.findByPk.mockResolvedValue(null);
    (resultService.getResultsByParticipant as jest.Mock).mockResolvedValue([]);

    const res = crearRes();
    await getResultsByParticipant(reqJuez({ params: { participantId: '7' } }), res as Response);

    expect(res.body).toEqual([]);
  });

  it('responde 500 si el servicio falla', async () => {
    (resultService.getResultsByParticipant as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = crearRes();
    await getResultsByParticipant(reqJuez({ params: { participantId: '7' } }), res as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'Error al obtener los resultados' });
    expect(log.error).toHaveBeenCalledWith('getResultsByParticipant error:', 'caida');
  });
});

describe('getResultsByCompetencia', () => {
  it('responde 400 con identificador no numérico', async () => {
    const res = crearRes();
    await getResultsByCompetencia(reqJuez({ params: { competenciaId: 'x' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador invalido' });
  });

  it('responde 403 sin acceso a la competencia', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 9 });

    const res = crearRes();
    await getResultsByCompetencia(
      reqJuez({ alcance: { activa: 1, permitidas: [1] }, params: { competenciaId: '1' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No tienes acceso a esta competencia' });
    expect(resultService.getResultsByCompetencia).not.toHaveBeenCalled();
  });

  it('responde 403 si el juez no está asignado a la competencia', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
    mockAsignacion.findOne.mockResolvedValue(null);

    const res = crearRes();
    await getResultsByCompetencia(reqJuez({ params: { competenciaId: '1' } }), res as Response);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No estas asignado a esta competencia' });
  });

  it('entrega los wods y las filas de resultados aplanadas', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
    mockAsignacion.findOne.mockResolvedValue({ id: 3 });
    const wods = [{ id: 11, orden: 1, nombre_ejercicio: 'WOD 1' }];
    mockWod.findAll.mockResolvedValue(wods);
    (resultService.getResultsByCompetencia as jest.Mock).mockResolvedValue([
      {
        id: 90,
        participante_id: 5,
        wod_id: 11,
        valor_bruto: '50',
        puntos_calculados: 100,
        abandono: false,
        capado: false,
        timestamp_servidor: new Date('2026-01-01T00:00:00Z'),
        Participante: { nombre: 'Ana', apellidos: 'Zapata', cedula: '1', categoria: 'RX' },
      },
      {
        id: 91,
        participante_id: 6,
        wod_id: 11,
        valor_bruto: 'DNF',
        puntos_calculados: 0,
        abandono: true,
        capado: false,
        timestamp_servidor: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    const res = crearRes();
    await getResultsByCompetencia(reqJuez({ params: { competenciaId: '1' } }), res as Response);

    expect(res.body.wods).toEqual(wods);
    expect(res.body.participantes).toHaveLength(2);
    expect(res.body.participantes[0]).toMatchObject({
      resultado_id: 90,
      participante_id: 5,
      nombre: 'Ana',
      apellidos: 'Zapata',
      categoria: 'RX',
      valor_bruto: '50',
      puntos_calculados: 100,
    });
    // Fila sin datos personales: no inventa nombres.
    expect(res.body.participantes[1]).toMatchObject({ nombre: '', apellidos: '', categoria: null });
    expect(mockWod.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { competencia_id: 1 } }),
    );
  });

  it('responde 500 si el servicio falla', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 1, evento_id: 1 });
    mockAsignacion.findOne.mockResolvedValue({ id: 3 });
    mockWod.findAll.mockResolvedValue([]);
    (resultService.getResultsByCompetencia as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = crearRes();
    await getResultsByCompetencia(reqJuez({ params: { competenciaId: '1' } }), res as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'Error al obtener los resultados' });
    expect(log.error).toHaveBeenCalledWith('getResultsByCompetencia error:', 'caida');
  });
});
