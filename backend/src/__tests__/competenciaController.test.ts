jest.mock('../models', () => ({
  __esModule: true,
  Competencia: { findByPk: jest.fn() },
  Asignacion: { findByPk: jest.fn() },
}));

jest.mock('../services/competenciaService', () => ({
  createCompetencia: jest.fn(),
  getAllCompetencias: jest.fn(),
  getPublicCompetencias: jest.fn(),
  getCompetenciaById: jest.fn(),
  updateCompetencia: jest.fn(),
  deleteCompetencia: jest.fn(),
  assignCompetencia: jest.fn(),
  removeAssignment: jest.fn(),
  getCompetenciaAssignments: jest.fn(),
  getCompetenciasByJudge: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import {
  createCompetencia,
  getCompetencias,
  getPublicCompetencias,
  getCompetencia,
  updateCompetencia,
  deleteCompetencia,
  assignCompetencia,
  removeAssignment,
  getCompetenciaAssignments,
  getJudgeCompetencias,
} from '../controllers/competenciaController';
import { Competencia, Asignacion } from '../models';
import * as competenciaService from '../services/competenciaService';

const mockCompetencia = Competencia as unknown as { findByPk: jest.Mock };
const mockAsignacion = Asignacion as unknown as { findByPk: jest.Mock };

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
    params: {},
    query: {},
    ...overrides,
  } as AuthRequest;
}

beforeEach(() => jest.clearAllMocks());

describe('createCompetencia', () => {
  it('crea la competencia en el evento de la sesión y responde 201', async () => {
    (competenciaService.createCompetencia as jest.Mock).mockResolvedValue({ id: 4 });

    const res = crearRes();
    await createCompetencia(reqAdmin({ body: { nombre: 'Final' } }), res as Response);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ message: 'Competencia creado', competencia: { id: 4 } });
    expect(competenciaService.createCompetencia).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Final', evento_id: 1 }),
    );
  });

  it('responde 400 si no hay evento activo en el alcance', async () => {
    const res = crearRes();
    await createCompetencia(
      reqAdmin({ alcance: { activa: null, permitidas: [1] }, body: {} }),
      res as Response,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Elige primero en que evento');
  });

  it('responde 400 con mensaje seguro si el servicio falla', async () => {
    (competenciaService.createCompetencia as jest.Mock).mockRejectedValue(
      new Error('constraint unique'),
    );

    const res = crearRes();
    await createCompetencia(reqAdmin({ body: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
  });
});

describe('getCompetencias', () => {
  it('lista las competencias del filtro del alcance', async () => {
    (competenciaService.getAllCompetencias as jest.Mock).mockResolvedValue([{ id: 1 }]);

    const res = crearRes();
    await getCompetencias(reqAdmin({ alcance: { activa: 1, permitidas: [1] } }), res as Response);

    expect(competenciaService.getAllCompetencias).toHaveBeenCalledWith({ evento_id: 1 });
    expect(res.body).toEqual([{ id: 1 }]);
  });

  it('responde 500 si el servicio falla', async () => {
    (competenciaService.getAllCompetencias as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = crearRes();
    await getCompetencias(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'Error al obtener las competencias' });
  });
});

describe('getPublicCompetencias', () => {
  it('acota al evento recibido en la query', async () => {
    (competenciaService.getPublicCompetencias as jest.Mock).mockResolvedValue([{ id: 2 }]);

    const res = crearRes();
    await getPublicCompetencias(reqAdmin({ query: { evento: '3' } } as any), res as Response);

    expect(competenciaService.getPublicCompetencias).toHaveBeenCalledWith(3);
    expect(res.body).toEqual([{ id: 2 }]);
  });

  it('sin evento válido consulta todas', async () => {
    (competenciaService.getPublicCompetencias as jest.Mock).mockResolvedValue([]);

    const res = crearRes();
    await getPublicCompetencias(reqAdmin({ query: {} } as any), res as Response);

    expect(competenciaService.getPublicCompetencias).toHaveBeenCalledWith(null);
  });

  it('responde 500 si el servicio falla', async () => {
    (competenciaService.getPublicCompetencias as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = crearRes();
    await getPublicCompetencias(reqAdmin({ query: {} } as any), res as Response);

    expect(res.statusCode).toBe(500);
  });
});

describe('getCompetencia', () => {
  it('rechaza un id de ruta no numérico', async () => {
    const res = crearRes();
    await getCompetencia(reqAdmin({ params: { id: 'abc' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador invalido' });
  });

  it('responde 404 si no existe', async () => {
    (competenciaService.getCompetenciaById as jest.Mock).mockResolvedValue(null);

    const res = crearRes();
    await getCompetencia(reqAdmin({ params: { id: '4' } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Competencia no encontrado' });
  });

  it('responde 403 si es de otro evento', async () => {
    (competenciaService.getCompetenciaById as jest.Mock).mockResolvedValue({
      id: 4,
      evento_id: 9,
    });

    const res = crearRes();
    await getCompetencia(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { id: '4' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No tienes acceso a esta competencia' });
  });

  it('retorna la competencia con acceso', async () => {
    (competenciaService.getCompetenciaById as jest.Mock).mockResolvedValue({
      id: 4,
      evento_id: 1,
    });

    const res = crearRes();
    await getCompetencia(reqAdmin({ params: { id: '4' } }), res as Response);

    expect(res.body).toEqual({ id: 4, evento_id: 1 });
  });

  it('responde 500 si el servicio falla', async () => {
    (competenciaService.getCompetenciaById as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = crearRes();
    await getCompetencia(reqAdmin({ params: { id: '4' } }), res as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'Error al obtener la competencia' });
  });
});

describe('updateCompetencia', () => {
  it('responde 404 si la competencia no existe', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await updateCompetencia(reqAdmin({ params: { id: '4' }, body: {} }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Competencia no encontrado' });
  });

  it('responde 403 si queda fuera del alcance', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 4, evento_id: 9 });

    const res = crearRes();
    await updateCompetencia(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { id: '4' }, body: {} }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(competenciaService.updateCompetencia).not.toHaveBeenCalled();
  });

  it('actualiza la competencia', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 4, evento_id: 1 });
    (competenciaService.updateCompetencia as jest.Mock).mockResolvedValue({ id: 4 });

    const res = crearRes();
    await updateCompetencia(
      reqAdmin({ params: { id: '4' }, body: { nombre: 'Nuevo' } }),
      res as Response,
    );

    expect(res.body).toEqual({ message: 'Competencia actualizado', competencia: { id: 4 } });
    expect(competenciaService.updateCompetencia).toHaveBeenCalledWith(4, { nombre: 'Nuevo' });
  });

  it('responde 400 con mensaje seguro si el servicio falla', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 4, evento_id: 1 });
    (competenciaService.updateCompetencia as jest.Mock).mockRejectedValue(
      new Error('SQL: columna rota'),
    );

    const res = crearRes();
    await updateCompetencia(reqAdmin({ params: { id: '4' }, body: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
  });
});

describe('deleteCompetencia', () => {
  it('responde 404 si la competencia no existe', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await deleteCompetencia(reqAdmin({ params: { id: '4' } }), res as Response);

    expect(res.statusCode).toBe(404);
  });

  it('responde 403 si queda fuera del alcance', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 4, evento_id: 9 });

    const res = crearRes();
    await deleteCompetencia(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { id: '4' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(competenciaService.deleteCompetencia).not.toHaveBeenCalled();
  });

  it('elimina la competencia', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 4, evento_id: 1 });
    (competenciaService.deleteCompetencia as jest.Mock).mockResolvedValue(undefined);

    const res = crearRes();
    await deleteCompetencia(reqAdmin({ params: { id: '4' } }), res as Response);

    expect(res.body).toEqual({ message: 'Competencia eliminado' });
    expect(competenciaService.deleteCompetencia).toHaveBeenCalledWith(4);
  });

  it('responde 404 si el servicio rechaza el borrado', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 4, evento_id: 1 });
    (competenciaService.deleteCompetencia as jest.Mock).mockRejectedValue(
      new Error('tiene resultados registrados'),
    );

    const res = crearRes();
    await deleteCompetencia(reqAdmin({ params: { id: '4' } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toContain('resultados registrados');
  });
});

describe('assignCompetencia', () => {
  it('pide competencia_id en el cuerpo', async () => {
    const res = crearRes();
    await assignCompetencia(reqAdmin({ body: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'competencia_id es requerido' });
  });

  it('responde 403 si la competencia no existe o es de otro evento', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await assignCompetencia(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, body: { competencia_id: 4 } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(competenciaService.assignCompetencia).not.toHaveBeenCalled();
  });

  it('asigna y devuelve la creación', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ evento_id: 1 });
    (competenciaService.assignCompetencia as jest.Mock).mockResolvedValue({ id: 11 });

    const res = crearRes();
    await assignCompetencia(
      reqAdmin({ body: { competencia_id: 4, participante_id: 7 } }),
      res as Response,
    );

    expect(res.body).toEqual({ id: 11 });
    expect(competenciaService.assignCompetencia).toHaveBeenCalledWith({
      competencia_id: 4,
      participante_id: 7,
    });
  });

  it('responde 400 con mensaje seguro si el servicio falla', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ evento_id: 1 });
    (competenciaService.assignCompetencia as jest.Mock).mockRejectedValue(
      new Error('duplicate entry'),
    );

    const res = crearRes();
    await assignCompetencia(reqAdmin({ body: { competencia_id: 4 } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
  });
});

describe('removeAssignment', () => {
  it('rechaza un id de ruta no numérico', async () => {
    const res = crearRes();
    await removeAssignment(reqAdmin({ params: { asignacionId: 'x' } }), res as Response);

    expect(res.statusCode).toBe(400);
  });

  it('responde 404 si la asignación no existe', async () => {
    mockAsignacion.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await removeAssignment(reqAdmin({ params: { asignacionId: '11' } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Asignacion no encontrada' });
  });

  it('responde 403 si la competencia de la asignación es de otro evento', async () => {
    mockAsignacion.findByPk.mockResolvedValue({ competencia_id: 4 });
    mockCompetencia.findByPk.mockResolvedValue({ evento_id: 9 });

    const res = crearRes();
    await removeAssignment(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { asignacionId: '11' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(competenciaService.removeAssignment).not.toHaveBeenCalled();
  });

  it('elimina la asignación', async () => {
    mockAsignacion.findByPk.mockResolvedValue({ competencia_id: 4 });
    mockCompetencia.findByPk.mockResolvedValue({ evento_id: 1 });
    (competenciaService.removeAssignment as jest.Mock).mockResolvedValue(undefined);

    const res = crearRes();
    await removeAssignment(reqAdmin({ params: { asignacionId: '11' } }), res as Response);

    expect(res.body).toEqual({ message: 'Asignacion eliminada' });
    expect(competenciaService.removeAssignment).toHaveBeenCalledWith(11);
  });

  it('responde 404 si el servicio rechaza el borrado', async () => {
    mockAsignacion.findByPk.mockResolvedValue({ competencia_id: 4 });
    mockCompetencia.findByPk.mockResolvedValue({ evento_id: 1 });
    (competenciaService.removeAssignment as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = crearRes();
    await removeAssignment(reqAdmin({ params: { asignacionId: '11' } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'caida' });
  });
});

describe('getCompetenciaAssignments', () => {
  it('responde 404 si la competencia no existe', async () => {
    mockCompetencia.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await getCompetenciaAssignments(reqAdmin({ params: { id: '4' } }), res as Response);

    expect(res.statusCode).toBe(404);
  });

  it('responde 403 si queda fuera del alcance', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 4, evento_id: 9 });

    const res = crearRes();
    await getCompetenciaAssignments(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { id: '4' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
  });

  it('retorna las asignaciones', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 4, evento_id: 1 });
    (competenciaService.getCompetenciaAssignments as jest.Mock).mockResolvedValue([{ id: 1 }]);

    const res = crearRes();
    await getCompetenciaAssignments(reqAdmin({ params: { id: '4' } }), res as Response);

    expect(res.body).toEqual([{ id: 1 }]);
    expect(competenciaService.getCompetenciaAssignments).toHaveBeenCalledWith(4);
  });

  it('responde 500 si el servicio falla', async () => {
    mockCompetencia.findByPk.mockResolvedValue({ id: 4, evento_id: 1 });
    (competenciaService.getCompetenciaAssignments as jest.Mock).mockRejectedValue(
      new Error('caida'),
    );

    const res = crearRes();
    await getCompetenciaAssignments(reqAdmin({ params: { id: '4' } }), res as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'Error al obtener las asignaciones' });
  });
});

describe('getJudgeCompetencias', () => {
  it('el admin ve todas las competencias de su alcance', async () => {
    (competenciaService.getAllCompetencias as jest.Mock).mockResolvedValue([{ id: 1 }]);

    const res = crearRes();
    await getJudgeCompetencias(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] } }),
      res as Response,
    );

    expect(competenciaService.getAllCompetencias).toHaveBeenCalledWith({ evento_id: 1 });
    expect(competenciaService.getCompetenciasByJudge).not.toHaveBeenCalled();
    expect(res.body).toEqual([{ id: 1 }]);
  });

  it('el juez solo ve las suyas', async () => {
    (competenciaService.getCompetenciasByJudge as jest.Mock).mockResolvedValue([{ id: 2 }]);

    const res = crearRes();
    await getJudgeCompetencias(
      reqAdmin({ user: { id: 9, cedula: '67890', rol: 'juez', tipo: 'usuario' } }),
      res as Response,
    );

    expect(competenciaService.getCompetenciasByJudge).toHaveBeenCalledWith(9);
    expect(res.body).toEqual([{ id: 2 }]);
  });

  it('responde 500 si el servicio falla', async () => {
    (competenciaService.getCompetenciasByJudge as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = crearRes();
    await getJudgeCompetencias(
      reqAdmin({ user: { id: 9, cedula: '67890', rol: 'juez', tipo: 'usuario' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'Error al obtener las competencias' });
  });
});
