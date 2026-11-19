jest.mock('../models', () => ({
  __esModule: true,
  Competencia: { findByPk: jest.fn() },
  Asignacion: { findOne: jest.fn() },
}));

jest.mock('../services/arranqueService', () => ({
  programarArranque: jest.fn(),
  obtenerSnapshot: jest.fn(),
  cambiarEstado: jest.fn(),
  pausarArranque: jest.fn(),
  reanudarArranque: jest.fn(),
}));

jest.mock('../sockets/handlers', () => ({ broadcastCompetenciaStart: jest.fn() }));

jest.mock('../utils/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import {
  armarCompetencia,
  estadoArranque,
  cancelarArranque,
  finalizarArranque,
  pausarArranque,
  reanudarArranque,
} from '../controllers/arranqueController';
import { Competencia, Asignacion } from '../models';
import * as arranqueService from '../services/arranqueService';
import { broadcastCompetenciaStart } from '../sockets/handlers';
import { log } from '../utils/logger';

const mockCompetencia = Competencia as unknown as { findByPk: jest.Mock };
const mockAsignacion = Asignacion as unknown as { findOne: jest.Mock };
const mockBroadcast = broadcastCompetenciaStart as jest.Mock;

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

function reqAdmin(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    user: { id: 1, cedula: '12345', rol: 'admin', tipo: 'usuario' },
    alcance: { activa: 1, permitidas: null },
    body: {},
    params: { id: '5' },
    ...overrides,
  } as AuthRequest;
}

/** Deja la competencia consultable y el permiso de edición resuelto. */
function competenciaDe(eventoId: number | null = 1) {
  mockCompetencia.findByPk.mockResolvedValue({ id: 5, evento_id: eventoId });
}

beforeEach(() => jest.clearAllMocks());

describe('puedeEditar — ramas de alcance', () => {
  it('admite competencias legacy sin evento', async () => {
    competenciaDe(null);
    (arranqueService.cambiarEstado as jest.Mock).mockResolvedValue(undefined);
    mockBroadcast.mockResolvedValue(undefined);

    const res = crearRes();
    await cancelarArranque(
      reqAdmin({ alcance: { activa: null, permitidas: [9] } }),
      res as Response,
    );

    expect(res.body).toEqual({ message: 'Arranque cancelado' });
  });

  it('bloquea al admin sin alcance resuelto', async () => {
    competenciaDe(1);

    const res = crearRes();
    await cancelarArranque(reqAdmin({ alcance: undefined }), res as Response);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No administras este evento' });
  });

  it('bloquea al admin cuyo evento no esté en la lista permitida', async () => {
    competenciaDe(1);

    const res = crearRes();
    await cancelarArranque(reqAdmin({ alcance: { activa: 2, permitidas: [2] } }), res as Response);

    expect(res.statusCode).toBe(403);
  });

  it('deja pasar al admin cuyo evento sí está en la lista permitida', async () => {
    competenciaDe(7);
    (arranqueService.cambiarEstado as jest.Mock).mockResolvedValue(undefined);
    mockBroadcast.mockResolvedValue(undefined);

    const res = crearRes();
    await cancelarArranque(reqAdmin({ alcance: { activa: 7, permitidas: [7] } }), res as Response);

    expect(res.statusCode).toBe(200);
    expect(arranqueService.cambiarEstado).toHaveBeenCalledWith(5, 'cancelado');
  });
});

describe('armarCompetencia', () => {
  it('valida el identificador de la ruta', async () => {
    const res = crearRes();
    await armarCompetencia(reqAdmin({ params: { id: 'abc' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador invalido' });
  });

  it('responde 404 si la competencia no existe', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await armarCompetencia(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Competencia no encontrado' });
  });

  it('responde 403 si el admin no administra el evento', async () => {
    competenciaDe(3);

    const res = crearRes();
    await armarCompetencia(reqAdmin({ alcance: { activa: 1, permitidas: [1] } }), res as Response);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No administras este evento' });
    expect(arranqueService.programarArranque).not.toHaveBeenCalled();
  });

  it('arma la competencia, difunde el arranque y responde 201', async () => {
    competenciaDe(1);
    (arranqueService.programarArranque as jest.Mock).mockResolvedValue({ estado: 'armado' });
    mockBroadcast.mockResolvedValue(undefined);

    const res = crearRes();
    await armarCompetencia(reqAdmin({ body: { modo: 'sincronizado' } }), res as Response);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ estado: 'armado' });
    expect(arranqueService.programarArranque).toHaveBeenCalledWith(5, { modo: 'sincronizado' }, 1);
    expect(mockBroadcast).toHaveBeenCalledWith(5);
  });

  it('responde 400 si el servicio falla', async () => {
    competenciaDe(1);
    (arranqueService.programarArranque as jest.Mock).mockRejectedValue(
      new Error('SQL: wods incompletos'),
    );

    const res = crearRes();
    await armarCompetencia(reqAdmin({ body: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
    expect(mockBroadcast).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(
      '[arranque] armarCompetencia error:',
      'SQL: wods incompletos',
      undefined,
    );
  });
});

describe('estadoArranque', () => {
  it('valida el identificador de la ruta', async () => {
    const res = crearRes();
    await estadoArranque(reqAdmin({ params: { id: '0' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador invalido' });
  });

  it('responde 404 si la competencia no existe', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await estadoArranque(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(404);
  });

  it('al juez sin asignación le responde 403', async () => {
    competenciaDe(1);
    mockAsignacion.findOne.mockResolvedValue(null);

    const res = crearRes();
    await estadoArranque(
      reqAdmin({ user: { id: 2, cedula: '67890', rol: 'juez', tipo: 'usuario' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No estás asignado a esta competencia' });
    expect(arranqueService.obtenerSnapshot).not.toHaveBeenCalled();
  });

  it('el juez asignado lee el snapshot sin pedir membresía de evento', async () => {
    competenciaDe(99);
    mockAsignacion.findOne.mockResolvedValue({ id: 4, usuario_id: 2 });
    (arranqueService.obtenerSnapshot as jest.Mock).mockResolvedValue({ estado: 'corriendo' });

    const res = crearRes();
    await estadoArranque(
      reqAdmin({
        user: { id: 2, cedula: '67890', rol: 'juez', tipo: 'usuario' },
        alcance: { activa: null, permitidas: [] },
      }),
      res as Response,
    );

    expect(mockAsignacion.findOne).toHaveBeenCalledWith({
      where: { competencia_id: 5, usuario_id: 2 },
    });
    expect(res.body).toEqual({ estado: 'corriendo' });
  });

  it('al admin de otro evento le responde 403', async () => {
    competenciaDe(3);

    const res = crearRes();
    await estadoArranque(reqAdmin({ alcance: { activa: 1, permitidas: [1] } }), res as Response);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No administras este evento' });
  });

  it('el admin con acceso recibe el snapshot', async () => {
    competenciaDe(1);
    (arranqueService.obtenerSnapshot as jest.Mock).mockResolvedValue({ estado: 'pausado' });

    const res = crearRes();
    await estadoArranque(reqAdmin(), res as Response);

    expect(res.body).toEqual({ estado: 'pausado' });
  });

  it('responde 500 con mensaje seguro si el servicio falla', async () => {
    competenciaDe(1);
    (arranqueService.obtenerSnapshot as jest.Mock).mockRejectedValue(
      new Error('select * from arranques'),
    );

    const res = crearRes();
    await estadoArranque(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
  });
});

describe('finalizarArranque', () => {
  it('valida el identificador de la ruta', async () => {
    const res = crearRes();
    await finalizarArranque(reqAdmin({ params: { id: 'x' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador invalido' });
  });

  it('responde 404 sin competencia', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await finalizarArranque(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(404);
  });

  it('responde 403 sin permiso sobre el evento', async () => {
    competenciaDe(3);

    const res = crearRes();
    await finalizarArranque(reqAdmin({ alcance: { activa: 1, permitidas: [1] } }), res as Response);

    expect(res.statusCode).toBe(403);
  });

  it('finaliza el heat y difunde el cambio', async () => {
    competenciaDe(1);
    (arranqueService.cambiarEstado as jest.Mock).mockResolvedValue(undefined);
    mockBroadcast.mockResolvedValue(undefined);

    const res = crearRes();
    await finalizarArranque(reqAdmin(), res as Response);

    expect(arranqueService.cambiarEstado).toHaveBeenCalledWith(5, 'finalizado');
    expect(mockBroadcast).toHaveBeenCalledWith(5);
    expect(res.body).toEqual({ message: 'Heat finalizado' });
  });

  it('responde 400 si el servicio falla', async () => {
    competenciaDe(1);
    (arranqueService.cambiarEstado as jest.Mock).mockRejectedValue(new Error('caida mysql'));

    const res = crearRes();
    await finalizarArranque(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(400);
    expect(log.error).toHaveBeenCalledWith(
      '[arranque] finalizarArranque error:',
      'caida mysql',
      undefined,
    );
  });
});

describe('pausarArranque', () => {
  it('valida el identificador de la ruta', async () => {
    const res = crearRes();
    await pausarArranque(reqAdmin({ params: { id: '-2' } }), res as Response);

    expect(res.statusCode).toBe(400);
  });

  it('responde 404 sin competencia', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await pausarArranque(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(404);
  });

  it('responde 403 sin permiso sobre el evento', async () => {
    competenciaDe(3);

    const res = crearRes();
    await pausarArranque(reqAdmin({ alcance: { activa: 1, permitidas: [1] } }), res as Response);

    expect(res.statusCode).toBe(403);
  });

  it('pausa el heat y devuelve el snapshot', async () => {
    competenciaDe(1);
    (arranqueService.pausarArranque as jest.Mock).mockResolvedValue({ estado: 'pausado' });
    mockBroadcast.mockResolvedValue(undefined);

    const res = crearRes();
    await pausarArranque(reqAdmin(), res as Response);

    expect(arranqueService.pausarArranque).toHaveBeenCalledWith(5);
    expect(res.body).toEqual({ message: 'Heat en pausa', arranque: { estado: 'pausado' } });
  });

  it('responde 400 si el servicio falla', async () => {
    competenciaDe(1);
    (arranqueService.pausarArranque as jest.Mock).mockRejectedValue(new Error('sin arranque'));

    const res = crearRes();
    await pausarArranque(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(400);
    expect(log.error).toHaveBeenCalledWith('pausarArranque error:', 'sin arranque');
  });
});

describe('reanudarArranque', () => {
  it('valida el identificador de la ruta', async () => {
    const res = crearRes();
    await reanudarArranque(reqAdmin({ params: { id: 'abc' } }), res as Response);

    expect(res.statusCode).toBe(400);
  });

  it('responde 404 sin competencia', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await reanudarArranque(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(404);
  });

  it('responde 403 sin permiso sobre el evento', async () => {
    competenciaDe(3);

    const res = crearRes();
    await reanudarArranque(reqAdmin({ alcance: { activa: 1, permitidas: [1] } }), res as Response);

    expect(res.statusCode).toBe(403);
  });

  it('reanuda el heat y devuelve el snapshot', async () => {
    competenciaDe(1);
    (arranqueService.reanudarArranque as jest.Mock).mockResolvedValue({ estado: 'corriendo' });
    mockBroadcast.mockResolvedValue(undefined);

    const res = crearRes();
    await reanudarArranque(reqAdmin(), res as Response);

    expect(arranqueService.reanudarArranque).toHaveBeenCalledWith(5);
    expect(mockBroadcast).toHaveBeenCalledWith(5);
    expect(res.body).toEqual({ message: 'Heat reanudado', arranque: { estado: 'corriendo' } });
  });

  it('responde 400 si el servicio falla', async () => {
    competenciaDe(1);
    (arranqueService.reanudarArranque as jest.Mock).mockRejectedValue(
      new Error('no estaba pausado'),
    );

    const res = crearRes();
    await reanudarArranque(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(400);
    expect(log.error).toHaveBeenCalledWith('reanudarArranque error:', 'no estaba pausado');
  });
});
