jest.mock('../models', () => ({
  __esModule: true,
  Participante: { findByPk: jest.fn() },
  EventoUsuario: { findAll: jest.fn() },
}));

jest.mock('../services/userService', () => ({
  createJuez: jest.fn(),
  createParticipante: jest.fn(),
  getAllAdmins: jest.fn(),
  createAdmin: jest.fn(),
  getAllJueces: jest.fn(),
  getAllParticipantes: jest.fn(),
  updateUsuario: jest.fn(),
  updateParticipante: jest.fn(),
  resetPasswordJuez: jest.fn(),
  deleteUsuario: jest.fn(),
  deleteParticipante: jest.fn(),
  parseCSV: jest.fn(),
  bulkCreate: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { Response } from 'express';
import { Op } from 'sequelize';
import type { AuthRequest } from '../middleware/auth';
import {
  createJuez,
  createParticipante,
  getAdmins,
  createAdmin,
  getJueces,
  getParticipantes,
  updateUsuario,
  updateParticipante,
  resetPasswordJuez,
  deleteUsuario,
  deleteParticipante,
  bulkUpload,
} from '../controllers/userController';
import * as userService from '../services/userService';
import { Participante, EventoUsuario } from '../models';
import { log } from '../utils/logger';

const mockParticipante = Participante as unknown as { findByPk: jest.Mock };
const mockEventoUsuario = EventoUsuario as unknown as { findAll: jest.Mock };

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

describe('createJuez', () => {
  it('crea el juez en el evento del alcance y devuelve la contraseña temporal', async () => {
    (userService.createJuez as jest.Mock).mockResolvedValue({
      usuario: { id: 9, nombre: 'Juan' },
      tempPassword: 'abc123',
    });

    const res = crearRes();
    await createJuez(
      reqAdmin({ body: { nombre: 'Juan', apellidos: 'Perez', cedula: '1', box: 'Box' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.tempPassword).toBe('abc123');
    expect(userService.createJuez).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Juan', evento_id: 1 }),
    );
  });

  it('responde 400 con mensaje seguro si el servicio falla', async () => {
    (userService.createJuez as jest.Mock).mockRejectedValue(new Error('duplicate entry cedula'));

    const res = crearRes();
    await createJuez(reqAdmin({ body: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
    expect(log.error).toHaveBeenCalledWith(
      'createJuez error:',
      'duplicate entry cedula',
      undefined,
    );
  });
});

describe('createParticipante', () => {
  it('crea el atleta en el evento del alcance', async () => {
    (userService.createParticipante as jest.Mock).mockResolvedValue({ id: 4 });

    const res = crearRes();
    await createParticipante(reqAdmin({ body: { nombre: 'Ana' } }), res as Response);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ message: 'Participante creado', participante: { id: 4 } });
    expect(userService.createParticipante).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Ana', evento_id: 1 }),
    );
  });

  it('responde 400 si el servicio rechaza los datos', async () => {
    (userService.createParticipante as jest.Mock).mockRejectedValue(new Error('cedula ya usada'));

    const res = crearRes();
    await createParticipante(reqAdmin({ body: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'cedula ya usada' });
  });
});

describe('getAdmins', () => {
  it('filtra por el box recibido en la query', async () => {
    (userService.getAllAdmins as jest.Mock).mockResolvedValue([{ id: 1 }]);

    const res = crearRes();
    await getAdmins(reqAdmin({ query: { box: '7' } } as any), res as Response);

    expect(userService.getAllAdmins).toHaveBeenCalledWith(7);
    expect(res.body).toEqual([{ id: 1 }]);
  });

  it('sin box o con box inválido consulta todos', async () => {
    (userService.getAllAdmins as jest.Mock).mockResolvedValue([]);

    const res = crearRes();
    await getAdmins(reqAdmin({ query: { box: 'abc' } } as any), res as Response);

    expect(userService.getAllAdmins).toHaveBeenCalledWith(null);
    expect(res.body).toEqual([]);
  });

  it('responde 500 si la consulta falla', async () => {
    (userService.getAllAdmins as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = crearRes();
    await getAdmins(reqAdmin({ query: {} } as any), res as Response);

    expect(res.statusCode).toBe(500);
    expect(log.error).toHaveBeenCalledWith('getAdmins error');
  });
});

describe('createAdmin', () => {
  it('crea el administrador y muestra la contraseña una sola vez', async () => {
    (userService.createAdmin as jest.Mock).mockResolvedValue({
      usuario: { id: 2 },
      tempPassword: 'clave',
    });

    const res = crearRes();
    await createAdmin(reqAdmin({ body: { nombre: 'Root' } }), res as Response);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      message: 'Administrador creado',
      usuario: { id: 2 },
      tempPassword: 'clave',
    });
  });

  it('devuelve el mensaje crudo del servicio en el 400', async () => {
    (userService.createAdmin as jest.Mock).mockRejectedValue(new Error('ya existe el admin'));

    const res = crearRes();
    await createAdmin(reqAdmin({ body: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'ya existe el admin' });
  });
});

describe('getJueces', () => {
  it('consulta con el filtro de eventos del alcance', async () => {
    (userService.getAllJueces as jest.Mock).mockResolvedValue([{ id: 3 }]);

    const res = crearRes();
    await getJueces(reqAdmin({ alcance: { activa: 1, permitidas: [1] } }), res as Response);

    expect(userService.getAllJueces).toHaveBeenCalledWith({ evento_id: 1 });
    expect(res.body).toEqual([{ id: 3 }]);
  });

  it('responde 500 si la consulta falla', async () => {
    (userService.getAllJueces as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = crearRes();
    await getJueces(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'Error al obtener los jueces' });
  });
});

describe('getParticipantes', () => {
  it('consulta con el filtro de eventos del alcance', async () => {
    (userService.getAllParticipantes as jest.Mock).mockResolvedValue([{ id: 4 }]);

    const res = crearRes();
    await getParticipantes(
      reqAdmin({ alcance: { activa: null, permitidas: [1, 2] } }),
      res as Response,
    );

    expect(userService.getAllParticipantes).toHaveBeenCalledWith({
      evento_id: { [Op.in]: [1, 2] },
    });
    expect(res.body).toEqual([{ id: 4 }]);
  });

  it('responde 500 si la consulta falla', async () => {
    (userService.getAllParticipantes as jest.Mock).mockRejectedValue(new Error('caida'));

    const res = crearRes();
    await getParticipantes(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'Error al obtener los participantes' });
  });
});

describe('updateUsuario', () => {
  it('rechaza un id de ruta no numérico', async () => {
    const res = crearRes();
    await updateUsuario(reqAdmin({ params: { id: 'abc' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Identificador invalido' });
  });

  it('responde 403 si el usuario no comparte eventos con el admin', async () => {
    mockEventoUsuario.findAll.mockResolvedValue([{ evento_id: 9 }]);

    const res = crearRes();
    await updateUsuario(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { id: '5' }, body: {} }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No tienes acceso a este usuario' });
    expect(userService.updateUsuario).not.toHaveBeenCalled();
  });

  it('actualiza el usuario', async () => {
    (userService.updateUsuario as jest.Mock).mockResolvedValue({ id: 5 });

    const res = crearRes();
    await updateUsuario(reqAdmin({ params: { id: '5' }, body: { rol: 'juez' } }), res as Response);

    expect(res.body).toEqual({ message: 'Usuario actualizado', usuario: { id: 5 } });
    expect(userService.updateUsuario).toHaveBeenCalledWith(5, { rol: 'juez' });
  });

  it('responde 400 si el servicio falla', async () => {
    (userService.updateUsuario as jest.Mock).mockRejectedValue(new Error('constraint failed'));

    const res = crearRes();
    await updateUsuario(reqAdmin({ params: { id: '5' }, body: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
  });
});

describe('updateParticipante', () => {
  it('responde 404 si el atleta no existe', async () => {
    mockParticipante.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await updateParticipante(reqAdmin({ params: { id: '5' }, body: {} }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Participante no encontrado' });
  });

  it('responde 403 si el atleta es de otro evento', async () => {
    mockParticipante.findByPk.mockResolvedValue({ evento_id: 9 });

    const res = crearRes();
    await updateParticipante(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { id: '5' }, body: {} }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No tienes acceso a este participante' });
  });

  it('actualiza el atleta', async () => {
    mockParticipante.findByPk.mockResolvedValue({ evento_id: 1 });
    (userService.updateParticipante as jest.Mock).mockResolvedValue({ id: 5 });

    const res = crearRes();
    await updateParticipante(
      reqAdmin({ params: { id: '5' }, body: { box: 'Otro' } }),
      res as Response,
    );

    expect(res.body).toEqual({ message: 'Participante actualizado', participante: { id: 5 } });
    expect(userService.updateParticipante).toHaveBeenCalledWith(5, { box: 'Otro' });
  });

  it('responde 400 si el servicio falla', async () => {
    mockParticipante.findByPk.mockResolvedValue({ evento_id: 1 });
    (userService.updateParticipante as jest.Mock).mockRejectedValue(new Error('SQL: columna mala'));

    const res = crearRes();
    await updateParticipante(reqAdmin({ params: { id: '5' }, body: {} }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
  });
});

describe('resetPasswordJuez', () => {
  it('devuelve la contraseña temporal nueva', async () => {
    (userService.resetPasswordJuez as jest.Mock).mockResolvedValue({
      nombre: 'Juan',
      cedula: '1',
      tempPassword: 'nueva',
    });

    const res = crearRes();
    await resetPasswordJuez(reqAdmin({ params: { id: '7' } }), res as Response);

    expect(res.body.tempPassword).toBe('nueva');
    expect(userService.resetPasswordJuez).toHaveBeenCalledWith(7);
  });

  it('responde 403 sin gestión permitida', async () => {
    mockEventoUsuario.findAll.mockResolvedValue([{ evento_id: 9 }]);

    const res = crearRes();
    await resetPasswordJuez(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { id: '7' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'No tienes acceso a este usuario' });
  });

  it('responde 400 si el servicio falla', async () => {
    (userService.resetPasswordJuez as jest.Mock).mockRejectedValue(
      new Error('Usuario no encontrado'),
    );

    const res = crearRes();
    await resetPasswordJuez(reqAdmin({ params: { id: '7' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'Usuario no encontrado' });
  });
});

describe('deleteUsuario', () => {
  it('elimina el usuario', async () => {
    (userService.deleteUsuario as jest.Mock).mockResolvedValue(undefined);

    const res = crearRes();
    await deleteUsuario(reqAdmin({ params: { id: '7' } }), res as Response);

    expect(res.body).toEqual({ message: 'Usuario eliminado' });
    expect(userService.deleteUsuario).toHaveBeenCalledWith(7);
  });

  it('responde 403 sin gestión permitida', async () => {
    mockEventoUsuario.findAll.mockResolvedValue([{ evento_id: 9 }]);

    const res = crearRes();
    await deleteUsuario(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { id: '7' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
  });

  it('responde 400 si el servicio rechaza el borrado', async () => {
    (userService.deleteUsuario as jest.Mock).mockRejectedValue(
      new Error('No se puede eliminar el unico administrador del sistema'),
    );

    const res = crearRes();
    await deleteUsuario(reqAdmin({ params: { id: '7' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('unico administrador');
  });
});

describe('deleteParticipante', () => {
  it('responde 404 si el atleta no existe', async () => {
    mockParticipante.findByPk.mockResolvedValue(null);

    const res = crearRes();
    await deleteParticipante(reqAdmin({ params: { id: '7' } }), res as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Participante no encontrado' });
  });

  it('responde 403 si el atleta es de otro evento', async () => {
    mockParticipante.findByPk.mockResolvedValue({ evento_id: 9 });

    const res = crearRes();
    await deleteParticipante(
      reqAdmin({ alcance: { activa: 1, permitidas: [1] }, params: { id: '7' } }),
      res as Response,
    );

    expect(res.statusCode).toBe(403);
  });

  it('elimina el atleta', async () => {
    mockParticipante.findByPk.mockResolvedValue({ evento_id: 1 });
    (userService.deleteParticipante as jest.Mock).mockResolvedValue(undefined);

    const res = crearRes();
    await deleteParticipante(reqAdmin({ params: { id: '7' } }), res as Response);

    expect(res.body).toEqual({ message: 'Participante eliminado' });
    expect(userService.deleteParticipante).toHaveBeenCalledWith(7);
  });

  it('responde 400 si el servicio rechaza el borrado', async () => {
    mockParticipante.findByPk.mockResolvedValue({ evento_id: 1 });
    (userService.deleteParticipante as jest.Mock).mockRejectedValue(
      new Error('resultado(s) registrado(s)'),
    );

    const res = crearRes();
    await deleteParticipante(reqAdmin({ params: { id: '7' } }), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('resultado(s)');
  });
});

describe('bulkUpload', () => {
  it('rechaza la petición sin archivo', async () => {
    const res = crearRes();
    await bulkUpload(reqAdmin(), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('No se envió ningún archivo CSV');
  });

  it('rechaza un CSV sin filas', async () => {
    (userService.parseCSV as jest.Mock).mockReturnValue([]);

    const res = crearRes();
    await bulkUpload(reqAdmin({ file: { buffer: Buffer.from('') } } as any), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('vacío');
    expect(userService.bulkCreate).not.toHaveBeenCalled();
  });

  it('crea los registros del CSV en el evento del alcance', async () => {
    const filas = [{ tipo: 'atleta', nombre: 'Ana' }];
    (userService.parseCSV as jest.Mock).mockReturnValue(filas);
    (userService.bulkCreate as jest.Mock).mockResolvedValue({ exitosos: 1, fallidos: 0 });

    const res = crearRes();
    await bulkUpload(reqAdmin({ file: { buffer: Buffer.from('csv') } } as any), res as Response);

    expect(userService.parseCSV).toHaveBeenCalledWith('csv');
    expect(userService.bulkCreate).toHaveBeenCalledWith(filas, 1);
    expect(res.body).toEqual({ exitosos: 1, fallidos: 0 });
  });

  it('responde 400 con mensaje seguro si el procesamiento falla', async () => {
    (userService.parseCSV as jest.Mock).mockImplementation(() => {
      throw new Error('select * from usuarios');
    });

    const res = crearRes();
    await bulkUpload(reqAdmin({ file: { buffer: Buffer.from('x') } } as any), res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'No se pudo completar la operacion' });
  });
});
