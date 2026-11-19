jest.mock('../models', () => ({
  __esModule: true,
  Categoria: { findByPk: jest.fn() },
}));

jest.mock('../services/categoryService', () => ({
  getAllCategories: jest.fn(),
  getCategoryById: jest.fn(),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController';
import { Categoria } from '../models';
import * as categoryService from '../services/categoryService';
import { log } from '../utils/logger';

const mockFindByPk = Categoria.findByPk as jest.Mock;

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

describe('getAllCategories', () => {
  it('lista las categorías del filtro del alcance', async () => {
    (categoryService.getAllCategories as jest.Mock).mockResolvedValue([{ id: 1 }]);

    const res = crearRes();
    await getAllCategories(reqAdmin({ alcance: { activa: 1, permitidas: [1] } }), res as Response);

    expect(categoryService.getAllCategories).toHaveBeenCalledWith({ evento_id: 1 });
    expect(res.body).toEqual([{ id: 1 }]);
  });

  it('responde 500 si el servicio falla', async () => {
    (categoryService.getAllCategories as jest.Mock).mockRejectedValue(
      new Error('conexion perdida'),
    );

    const res = crearRes();
    await getAllCategories(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'conexion perdida' });
    expect(log.error).toHaveBeenCalledWith('getAllCategories error:', 'conexion perdida');
  });
});

describe('getCategoryById', () => {
  it('rechaza un id de ruta no numérico', async () => {
    const res = crearRes();
    await getCategoryById(reqAdmin({ params: { id: 'abc' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'ID de categoría inválido' });
  });

  it('responde 404 si la categoría no existe', async () => {
    mockFindByPk.mockResolvedValue(null);

    const res = crearRes();
    await getCategoryById(reqAdmin({ params: { id: '3' } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Categoria no encontrada' });
  });

  it('responde 403 si la categoría es de otro evento', async () => {
    mockFindByPk.mockResolvedValue({ evento_id: 9 });

    const res = crearRes();
    await getCategoryById(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { id: '3' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No tienes acceso a esta categoría' });
    expect(categoryService.getCategoryById).not.toHaveBeenCalled();
  });

  it('retorna la categoría completa', async () => {
    mockFindByPk.mockResolvedValue({ evento_id: 1 });
    (categoryService.getCategoryById as jest.Mock).mockResolvedValue({ id: 3, nombre: 'RX' });

    const res = crearRes();
    await getCategoryById(reqAdmin({ params: { id: '3' } }), res as Response);

    expect(res.body).toEqual({ id: 3, nombre: 'RX' });
    expect(categoryService.getCategoryById).toHaveBeenCalledWith(3);
  });

  it('responde 404 cuando el servicio lanza "no encontrada"', async () => {
    mockFindByPk.mockResolvedValue({ evento_id: 1 });
    (categoryService.getCategoryById as jest.Mock).mockRejectedValue(
      new Error('Categoría no encontrada'),
    );

    const res = crearRes();
    await getCategoryById(reqAdmin({ params: { id: '3' } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Categoría no encontrada' });
  });
});

describe('createCategory', () => {
  it('crea la categoría en el evento del alcance y responde 201', async () => {
    (categoryService.createCategory as jest.Mock).mockResolvedValue({ id: 8, nombre: 'RX' });

    const res = crearRes();
    await createCategory(
      reqAdmin({ body: { nombre: 'RX', genero: 'Masculino' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ id: 8, nombre: 'RX' });
    expect(categoryService.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'RX', genero: 'Masculino', evento_id: 1 }),
    );
  });

  it('sin evento activo en el alcance responde 400', async () => {
    const res = crearRes();
    await createCategory(
      reqAdmin({ alcance: { activa: null, permitidas: [1] }, body: {} }),
      res as Response,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Elige primero en que evento');
    expect(categoryService.createCategory).not.toHaveBeenCalled();
  });

  it('responde 400 si el servicio rechaza el duplicado', async () => {
    (categoryService.createCategory as jest.Mock).mockRejectedValue(
      new Error('Ya existe la categoría "RX" para el género Masculino'),
    );

    const res = crearRes();
    await createCategory(reqAdmin({ body: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Ya existe la categoría');
  });
});

describe('updateCategory', () => {
  it('rechaza un id de ruta no numérico', async () => {
    const res = crearRes();
    await updateCategory(reqAdmin({ params: { id: 'x' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'ID de categoría inválido' });
  });

  it('responde 404 si la categoría no existe', async () => {
    mockFindByPk.mockResolvedValue(null);

    const res = crearRes();
    await updateCategory(reqAdmin({ params: { id: '3' } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Categoria no encontrada' });
  });

  it('responde 403 si la categoría es de otro evento', async () => {
    mockFindByPk.mockResolvedValue({ evento_id: 9 });

    const res = crearRes();
    await updateCategory(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { id: '3' }, body: {} }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(categoryService.updateCategory).not.toHaveBeenCalled();
  });

  it('actualiza la categoría', async () => {
    mockFindByPk.mockResolvedValue({ evento_id: 1 });
    (categoryService.updateCategory as jest.Mock).mockResolvedValue({ id: 3, nombre: 'Nuevo' });

    const res = crearRes();
    await updateCategory(
      reqAdmin({ params: { id: '3' }, body: { nombre: 'Nuevo' } }),
      res as Response,
    );

    expect(res.body).toEqual({ id: 3, nombre: 'Nuevo' });
    expect(categoryService.updateCategory).toHaveBeenCalledWith(3, { nombre: 'Nuevo' });
  });

  it('responde 400 si el servicio rechaza la edición', async () => {
    mockFindByPk.mockResolvedValue({ evento_id: 1 });
    (categoryService.updateCategory as jest.Mock).mockRejectedValue(
      new Error('Ya existe otra categoría con el nombre "RX" y género Masculino'),
    );

    const res = crearRes();
    await updateCategory(reqAdmin({ params: { id: '3' }, body: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Ya existe otra categoría');
  });
});

describe('deleteCategory', () => {
  it('rechaza un id de ruta no numérico', async () => {
    const res = crearRes();
    await deleteCategory(reqAdmin({ params: { id: 'nulo' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'ID de categoría inválido' });
  });

  it('responde 404 si la categoría no existe', async () => {
    mockFindByPk.mockResolvedValue(null);

    const res = crearRes();
    await deleteCategory(reqAdmin({ params: { id: '3' } }), res as Response);

    expect(res.statusCode).toBe(404);
  });

  it('responde 403 si la categoría es de otro evento', async () => {
    mockFindByPk.mockResolvedValue({ evento_id: 9 });

    const res = crearRes();
    await deleteCategory(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { id: '3' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(categoryService.deleteCategory).not.toHaveBeenCalled();
  });

  it('elimina la categoría', async () => {
    mockFindByPk.mockResolvedValue({ evento_id: 1 });
    (categoryService.deleteCategory as jest.Mock).mockResolvedValue({
      message: 'Categoría eliminada correctamente',
    });

    const res = crearRes();
    await deleteCategory(reqAdmin({ params: { id: '3' } }), res as Response);

    expect(res.body).toEqual({ message: 'Categoría eliminada correctamente' });
    expect(categoryService.deleteCategory).toHaveBeenCalledWith(3);
  });

  it('responde 400 si el servicio rechaza el borrado', async () => {
    mockFindByPk.mockResolvedValue({ evento_id: 1 });
    (categoryService.deleteCategory as jest.Mock).mockRejectedValue(
      new Error('No se puede eliminar la categoría porque tiene atletas'),
    );

    const res = crearRes();
    await deleteCategory(reqAdmin({ params: { id: '3' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('No se puede eliminar');
    expect(log.error).toHaveBeenCalledWith(
      'deleteCategory error:',
      'No se puede eliminar la categoría porque tiene atletas',
    );
  });
});
