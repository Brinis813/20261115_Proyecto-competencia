import { Op } from 'sequelize';
import { filtroEvento, eventoDestino, type AlcanceEvento } from '../middleware/evento';
import { requireRoles, type AuthRequest } from '../middleware/auth';
import { perteneceAlAlcance } from '../controllers/helpers';
import type { Response } from 'express';

jest.mock('../models', () => ({
  Participante: { findOne: jest.fn() },
  Competencia: { findByPk: jest.fn() },
  Asignacion: { findOne: jest.fn() },
}));

jest.mock('../services/arranqueService', () => ({
  obtenerSnapshot: jest.fn(),
}));

import { Participante, Competencia, Asignacion } from '../models';
import { lookupParticipant } from '../controllers/participantController';
import { estadoArranque } from '../controllers/arranqueController';
import { obtenerSnapshot } from '../services/arranqueService';

/**
 * Pruebas cross-tenant (área 2: auth robusta multi-tenant).
 *
 * Regla: un juez del evento A NO puede ver ni escribir en B.
 * El filtro sale siempre del alcance resuelto en servidor (cabecera
 * X-Evento-Id validada), nunca del body/params del cliente. El
 * super_admin es la única excepción (permitidas = null -> sin acotar).
 */

function respuestaMock(): { res: Partial<Response>; estado: { codigo: number | null } } {
  const estado = { codigo: null as number | null };
  const res = {
    status: (codigo: number) => {
      estado.codigo = codigo;
      return { json: () => undefined };
    },
  } as unknown as Partial<Response>;
  return { res, estado };
}

describe('aislamiento multi-tenant', () => {
  test('el juez de A queda acotado a A aunque pida B', () => {
    // resolverEvento ya validó la cabecera: si B no está permitida,
    // el alcance nunca la contiene. Aquí se verifica el contrato río abajo.
    const alcanceA: AlcanceEvento = { activa: 1, permitidas: [1] };
    expect(filtroEvento(alcanceA)).toEqual({ evento_id: 1 });
    expect(eventoDestino(alcanceA)).toBe(1);
  });

  test('sin evento activa, el filtro se limita al conjunto permitido', () => {
    const alcance: AlcanceEvento = { activa: null, permitidas: [1, 2] };
    expect(filtroEvento(alcance)).toEqual({ evento_id: { [Op.in]: [1, 2] } });
    expect(() => eventoDestino(alcance)).toThrow('Elige primero en que evento');
  });

  test('nadie sin alcance ve nada', () => {
    const alcance: AlcanceEvento = { activa: null, permitidas: [] };
    expect(filtroEvento(alcance)).toEqual({ evento_id: { [Op.in]: [] } });
  });

  test('super_admin: bypass total (permitidas null)', () => {
    const alcance: AlcanceEvento = { activa: null, permitidas: null };
    expect(filtroEvento(alcance)).toEqual({});
    expect(eventoDestino(alcance)).toBeNull();
  });

  test('RBAC: un juez no pasa un guard adminOnly', () => {
    const { res, estado } = respuestaMock();
    const next = jest.fn();
    const req = { user: { id: 9, cedula: 'x', rol: 'juez', tipo: 'usuario' } } as AuthRequest;
    requireRoles('admin')(req, res as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(estado.codigo).toBe(403);
  });

  test('RBAC: participante no entra a rutas staff', () => {
    const { res, estado } = respuestaMock();
    const next = jest.fn();
    const req = { user: { id: 3, cedula: 'y', rol: 'participante', tipo: 'participante' } } as AuthRequest;
    requireRoles('admin', 'juez')(req, res as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(estado.codigo).toBe(403);
  });
});

function reqJuez(alcance: AlcanceEvento, juezId = 2): AuthRequest {
  return {
    user: { id: juezId, cedula: 'j1', rol: 'juez', tipo: 'usuario' },
    alcance,
    body: {},
    params: {},
  } as unknown as AuthRequest;
}

function resCaptura(): { res: Partial<Response>; estado: { codigo: number | null; cuerpo: any } } {
  const estado = { codigo: null as number | null, cuerpo: null as any };
  const res = {
    status: (codigo: number) => ({
      json: (cuerpo: any) => {
        estado.codigo = codigo;
        estado.cuerpo = cuerpo;
        return undefined;
      },
    }),
    json: (cuerpo: any) => {
      estado.codigo = 200;
      estado.cuerpo = cuerpo;
      return undefined;
    },
  } as unknown as Partial<Response>;
  return { res, estado };
}

/**
 * Regresión del bug reportado en producción (juez/8/19):
 * `POST /api/participant/lookup` devolvía 403 "No tienes acceso a este
 * participante" y `GET /api/competencias/8/arranque` 403 aunque el juez
 * tenía asignación explícita. Causas: participantes/jueces creados por CSV
 * sin evento_id ni EventoUsuario, y chequeo solo por evento sin fallback
 * por asignación.
 */
describe('juez asignado puede ver a su participante (bug prod juez/8/19)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('legacy sin evento_id: perteneceAlAlcance permite al staff', () => {
    expect(perteneceAlAlcance({ activa: 1, permitidas: [1] }, null)).toBe(true);
    expect(perteneceAlAlcance({ activa: null, permitidas: [] }, null)).toBe(true);
    expect(perteneceAlAlcance(undefined, 1)).toBe(false);
  });

  test('lookup: mismo evento -> 200', async () => {
    (Participante.findOne as jest.Mock).mockResolvedValue({
      id: 7, nombre: 'Ana', apellidos: 'Ruiz', cedula: '10203040',
      box: 'B', categoria: 'RX', evento_id: 1,
    });
    const req = reqJuez({ activa: 1, permitidas: [1] });
    req.body = { cedula: '10203040' };
    const { res, estado } = resCaptura();
    await lookupParticipant(req, res as Response);
    expect(estado.codigo).toBe(200);
    expect(estado.cuerpo.cedula).toBe('10203040');
  });

  test('lookup: evento distinto pero con asignación -> 200 (fallback)', async () => {
    (Participante.findOne as jest.Mock).mockResolvedValue({
      id: 7, nombre: 'Ana', apellidos: 'Ruiz', cedula: '10203040',
      box: 'B', categoria: 'RX', evento_id: 2,
    });
    (Asignacion.findOne as jest.Mock).mockResolvedValue({ id: 1 });
    const req = reqJuez({ activa: 1, permitidas: [1] });
    req.body = { cedula: '10203040' };
    const { res, estado } = resCaptura();
    await lookupParticipant(req, res as Response);
    expect(Asignacion.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usuario_id: 2, participante_id: 7 } }),
    );
    expect(estado.codigo).toBe(200);
  });

  test('lookup: evento distinto y sin asignación -> 403', async () => {
    (Participante.findOne as jest.Mock).mockResolvedValue({
      id: 7, nombre: 'Ana', apellidos: 'Ruiz', cedula: '10203040',
      box: 'B', categoria: 'RX', evento_id: 2,
    });
    (Asignacion.findOne as jest.Mock).mockResolvedValue(null);
    const req = reqJuez({ activa: 1, permitidas: [1] });
    req.body = { cedula: '10203040' };
    const { res, estado } = resCaptura();
    await lookupParticipant(req, res as Response);
    expect(estado.codigo).toBe(403);
    expect(estado.cuerpo.message).toMatch(/acceso a este participante/);
  });

  test('lookup: participante legacy sin evento -> 200 sin exigir asignación', async () => {
    (Participante.findOne as jest.Mock).mockResolvedValue({
      id: 7, nombre: 'Ana', apellidos: 'Ruiz', cedula: '10203040',
      box: 'B', categoria: 'RX', evento_id: null,
    });
    const req = reqJuez({ activa: null, permitidas: [] });
    req.body = { cedula: '10203040' };
    const { res, estado } = resCaptura();
    await lookupParticipant(req, res as Response);
    expect(estado.codigo).toBe(200);
  });

  test('arranque: juez asignado entra aunque no tenga membresía de evento', async () => {
    (Competencia.findByPk as jest.Mock).mockResolvedValue({ id: 8, evento_id: 5 });
    (Asignacion.findOne as jest.Mock).mockResolvedValue({ id: 9 });
    (obtenerSnapshot as jest.Mock).mockResolvedValue({ estado: 'armado' });
    const req = reqJuez({ activa: null, permitidas: [] });
    req.params = { id: '8' };
    const { res, estado } = resCaptura();
    await estadoArranque(req, res as Response);
    expect(estado.codigo).toBe(200);
    expect(estado.cuerpo).toEqual({ estado: 'armado' });
  });

  test('arranque: juez sin asignación -> 403', async () => {
    (Competencia.findByPk as jest.Mock).mockResolvedValue({ id: 8, evento_id: 5 });
    (Asignacion.findOne as jest.Mock).mockResolvedValue(null);
    const req = reqJuez({ activa: null, permitidas: [] });
    req.params = { id: '8' };
    const { res, estado } = resCaptura();
    await estadoArranque(req, res as Response);
    expect(estado.codigo).toBe(403);
    expect(estado.cuerpo.message).toMatch(/asignado/);
  });
});
