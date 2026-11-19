jest.mock('../services/heatService', () => ({
  obtenerHeats: jest.fn(),
  generarHeats: jest.fn(),
  crearHeatVacio: jest.fn(),
  moverAtleta: jest.fn(),
  quitarAtleta: jest.fn(),
  eliminarHeat: jest.fn(),
  limpiarCategoria: jest.fn(),
  programarHorarioAuto: jest.fn(),
  programarHorarioManual: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import {
  vistaHeats,
  generarHeats,
  crearHeat,
  moverAtleta,
  quitarAtleta,
  eliminarHeat,
  limpiarCategoria,
  horarioAuto,
  horarioManual,
} from '../controllers/heatController';
import * as heatService from '../services/heatService';
import { log } from '../utils/logger';

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
    query: {},
    ...overrides,
  } as AuthRequest;
}

beforeEach(() => jest.clearAllMocks());

describe('vistaHeats', () => {
  it('pide la categoría cuando no llega', async () => {
    const res = crearRes();
    await vistaHeats(reqJuez({ query: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Indica la categoría (categoria_id)' });
  });

  it('retorna la vista con la competencia recibida', async () => {
    (heatService.obtenerHeats as jest.Mock).mockResolvedValue([{ id: 1 }]);

    const res = crearRes();
    await vistaHeats(
      reqJuez({ query: { categoria_id: '3', competencia_id: '7' } }),
      res as Response,
    );

    expect(heatService.obtenerHeats).toHaveBeenCalledWith(3, 7, expect.anything());
    expect(res.body).toEqual([{ id: 1 }]);
  });

  it('si la competencia no es válida consulta sin competencia', async () => {
    (heatService.obtenerHeats as jest.Mock).mockResolvedValue([]);

    const res = crearRes();
    await vistaHeats(
      reqJuez({ query: { categoria_id: '3', competencia_id: 'abc' } }),
      res as Response,
    );

    expect(heatService.obtenerHeats).toHaveBeenCalledWith(3, null, expect.anything());
  });

  it('acepta la categoría por body y responde 400 si el servicio falla', async () => {
    (heatService.obtenerHeats as jest.Mock).mockRejectedValue(new Error('constraint failed'));

    const res = crearRes();
    await vistaHeats(reqJuez({ body: { categoria_id: 4 } }), res as Response);

    expect(heatService.obtenerHeats).toHaveBeenCalledWith(4, null, expect.anything());
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
    expect(log.error).toHaveBeenCalledWith('vistaHeats error:', 'constraint failed');
  });
});

describe('generarHeats', () => {
  it('valida la categoría antes de llamar al servicio', async () => {
    const res = crearRes();
    await generarHeats(reqJuez({ body: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Indica la categoría (categoria_id)' });
    expect(heatService.generarHeats).not.toHaveBeenCalled();
  });

  it('genera los heats y responde 201', async () => {
    (heatService.generarHeats as jest.Mock).mockResolvedValue({ heats: 3 });

    const res = crearRes();
    await generarHeats(
      reqJuez({ body: { categoria_id: 2, capacidad_maxima: 10, modo: 'alfabetico' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ heats: 3 });
    expect(heatService.generarHeats).toHaveBeenCalledWith(2, 10, 'alfabetico', expect.anything());
  });

  it('responde 400 con mensaje seguro si el servicio falla', async () => {
    (heatService.generarHeats as jest.Mock).mockRejectedValue(new Error('SQL: sin tabla'));

    const res = crearRes();
    await generarHeats(reqJuez({ body: { categoria_id: 2 } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
  });
});

describe('crearHeat', () => {
  it('valida la categoría', async () => {
    const res = crearRes();
    await crearHeat(reqJuez({ body: { capacidad_maxima: 8 } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(heatService.crearHeatVacio).not.toHaveBeenCalled();
  });

  it('crea el heat vacío y responde 201', async () => {
    (heatService.crearHeatVacio as jest.Mock).mockResolvedValue({ id: 12 });

    const res = crearRes();
    await crearHeat(reqJuez({ body: { categoria_id: 2, capacidad_maxima: 8 } }), res as Response);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ id: 12 });
    expect(heatService.crearHeatVacio).toHaveBeenCalledWith(2, 8, expect.anything());
  });

  it('responde 400 si el servicio falla', async () => {
    (heatService.crearHeatVacio as jest.Mock).mockRejectedValue(new Error('capacidad invalida'));

    const res = crearRes();
    await crearHeat(reqJuez({ body: { categoria_id: 2 } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'capacidad invalida' });
    expect(log.error).toHaveBeenCalledWith('crearHeat error:', 'capacidad invalida');
  });
});

describe('moverAtleta', () => {
  it('exige participante_id y heat_id enteros', async () => {
    const res = crearRes();
    await moverAtleta(reqJuez({ body: { participante_id: 'x' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Indica participante_id y heat_id' });
  });

  it('mueve el atleta al carril indicado', async () => {
    (heatService.moverAtleta as jest.Mock).mockResolvedValue({ ok: true });

    const res = crearRes();
    await moverAtleta(
      reqJuez({ body: { participante_id: 5, heat_id: 2, carril_numero: 3 } }),
      res as Response,
    );

    expect(heatService.moverAtleta).toHaveBeenCalledWith(5, 2, 3, expect.anything());
    expect(res.body).toEqual({ ok: true });
  });

  it('sin carril envía null', async () => {
    (heatService.moverAtleta as jest.Mock).mockResolvedValue({ ok: true });

    const res = crearRes();
    await moverAtleta(reqJuez({ body: { participante_id: 5, heat_id: 2 } }), res as Response);

    expect(heatService.moverAtleta).toHaveBeenCalledWith(5, 2, null, expect.anything());
  });

  it('responde 400 si el servicio falla', async () => {
    (heatService.moverAtleta as jest.Mock).mockRejectedValue(new Error('heat inexistente'));

    const res = crearRes();
    await moverAtleta(reqJuez({ body: { participante_id: 5, heat_id: 2 } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'heat inexistente' });
  });
});

describe('quitarAtleta', () => {
  it('valida los identificadores de ruta y body', async () => {
    const res = crearRes();
    await quitarAtleta(
      reqJuez({ params: { participanteId: 'abc' }, body: { categoria_id: 1 } }),
      res as Response,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Identificadores inválidos' });
  });

  it('quita el atleta de la categoría', async () => {
    (heatService.quitarAtleta as jest.Mock).mockResolvedValue({ ok: true });

    const res = crearRes();
    await quitarAtleta(
      reqJuez({ params: { participanteId: '5' }, body: { categoria_id: 2 } }),
      res as Response,
    );

    expect(heatService.quitarAtleta).toHaveBeenCalledWith(5, 2, expect.anything());
    expect(res.body).toEqual({ ok: true });
  });

  it('responde 400 si el servicio falla', async () => {
    (heatService.quitarAtleta as jest.Mock).mockRejectedValue(new Error('sin asignacion'));

    const res = crearRes();
    await quitarAtleta(
      reqJuez({ params: { participanteId: '5' }, body: { categoria_id: 2 } }),
      res as Response,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'sin asignacion' });
  });
});

describe('eliminarHeat', () => {
  it('valida el identificador de la ruta', async () => {
    const res = crearRes();
    await eliminarHeat(reqJuez({ params: { heatId: '0' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador inválido' });
  });

  it('elimina el heat', async () => {
    (heatService.eliminarHeat as jest.Mock).mockResolvedValue({ ok: true });

    const res = crearRes();
    await eliminarHeat(reqJuez({ params: { heatId: '4' } }), res as Response);

    expect(heatService.eliminarHeat).toHaveBeenCalledWith(4, expect.anything());
    expect(res.body).toEqual({ ok: true });
  });

  it('responde 400 si el servicio falla', async () => {
    (heatService.eliminarHeat as jest.Mock).mockRejectedValue(new Error('SQL: foranea'));

    const res = crearRes();
    await eliminarHeat(reqJuez({ params: { heatId: '4' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
  });
});

describe('limpiarCategoria', () => {
  it('valida el identificador de la ruta', async () => {
    const res = crearRes();
    await limpiarCategoria(reqJuez({ params: { categoriaId: 'x' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador inválido' });
  });

  it('limpia los heats de la categoría', async () => {
    (heatService.limpiarCategoria as jest.Mock).mockResolvedValue({ borrados: 2 });

    const res = crearRes();
    await limpiarCategoria(reqJuez({ params: { categoriaId: '6' } }), res as Response);

    expect(heatService.limpiarCategoria).toHaveBeenCalledWith(6, expect.anything());
    expect(res.body).toEqual({ borrados: 2 });
  });

  it('responde 400 si el servicio falla', async () => {
    (heatService.limpiarCategoria as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = crearRes();
    await limpiarCategoria(reqJuez({ params: { categoriaId: '6' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(log.error).toHaveBeenCalledWith('limpiarCategoria error:', 'caida');
  });
});

describe('horarioAuto', () => {
  it('exige categoria_id y competencia_id enteros', async () => {
    const res = crearRes();
    await horarioAuto(reqJuez({ body: { categoria_id: 1 } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Indica categoria_id y competencia_id' });
  });

  it('programa el horario automático', async () => {
    (heatService.programarHorarioAuto as jest.Mock).mockResolvedValue({ horas: 5 });

    const res = crearRes();
    await horarioAuto(
      reqJuez({
        body: { categoria_id: 1, competencia_id: 2, hora_heat_1: '08:00', transicion_min: 5 },
      }),
      res as Response,
    );

    expect(heatService.programarHorarioAuto).toHaveBeenCalledWith(
      1,
      2,
      '08:00',
      5,
      expect.anything(),
    );
    expect(res.body).toEqual({ horas: 5 });
  });

  it('responde 400 si el servicio falla', async () => {
    (heatService.programarHorarioAuto as jest.Mock).mockRejectedValue(new Error('hora invalida'));

    const res = crearRes();
    await horarioAuto(reqJuez({ body: { categoria_id: 1, competencia_id: 2 } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'hora invalida' });
  });
});

describe('horarioManual', () => {
  it('exige categoria_id y competencia_id enteros', async () => {
    const res = crearRes();
    await horarioManual(reqJuez({ body: { competencia_id: 2 } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Indica categoria_id y competencia_id' });
  });

  it('programa los horarios manuales', async () => {
    (heatService.programarHorarioManual as jest.Mock).mockResolvedValue({ guardados: 3 });
    const horarios = [{ heat_id: 1, hora: '08:00' }];

    const res = crearRes();
    await horarioManual(
      reqJuez({ body: { categoria_id: 1, competencia_id: 2, horarios } }),
      res as Response,
    );

    expect(heatService.programarHorarioManual).toHaveBeenCalledWith(
      1,
      2,
      horarios,
      expect.anything(),
    );
    expect(res.body).toEqual({ guardados: 3 });
  });

  it('responde 400 si el servicio falla', async () => {
    (heatService.programarHorarioManual as jest.Mock).mockRejectedValue(new Error('horario malo'));

    const res = crearRes();
    await horarioManual(reqJuez({ body: { categoria_id: 1, competencia_id: 2 } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(log.error).toHaveBeenCalledWith('horarioManual error:', 'horario malo');
  });
});
