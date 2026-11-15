const mockAsignacionCount = jest.fn();
const mockResultadoCount = jest.fn();

jest.mock('../models', () => ({
  Usuario: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  Participante: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
  },
  EventoUsuario: { create: jest.fn(), findOrCreate: jest.fn() },
  Box: { findByPk: jest.fn() },
  Evento: { findByPk: jest.fn() },
  Asignacion: { count: mockAsignacionCount },
  Resultado: { count: mockResultadoCount },
}));

import { createJuez, deleteUsuario, deleteParticipante, bulkCreate, resetPasswordJuez } from '../services/userService';
import { Usuario, Participante, EventoUsuario, Box, Evento } from '../models';

const mockUsuario = Usuario as jest.Mocked<typeof Usuario>;
const mockParticipante = Participante as jest.Mocked<typeof Participante>;
const mockEvento = Evento as jest.Mocked<typeof Evento>;
const mockEventoUsuario = EventoUsuario as jest.Mocked<typeof EventoUsuario>;

beforeEach(() => jest.clearAllMocks());

describe('createJuez', () => {
  it('crea juez con password temporal y retorna tempPassword', async () => {
    mockUsuario.findOne.mockResolvedValue(null);
    mockEvento.findByPk.mockResolvedValue({ id: 5, box_id: 2 } as any);

    const instanceMock = {
      toJSON: () => ({
        id: 1, nombre: 'Juan', apellidos: 'Perez', cedula: '12345',
        rol: 'juez', box_id: 2, email_verificado: true,
      }),
      id: 1,
    };
    mockUsuario.create.mockResolvedValue(instanceMock as any);
    mockEventoUsuario.create.mockResolvedValue({} as any);

    const result = await createJuez({
      nombre: 'Juan', apellidos: 'Perez', cedula: '12345',
      box: 'CrossFit', evento_id: 5,
    });

    expect(result.tempPassword).toBeDefined();
    expect(typeof result.tempPassword).toBe('string');
    expect(result.tempPassword.length).toBeGreaterThan(0);
    expect(result.usuario).toBeDefined();
    expect(mockUsuario.create).toHaveBeenCalledTimes(1);
    expect(mockEventoUsuario.create).toHaveBeenCalledWith(
      expect.objectContaining({ evento_id: 5, usuario_id: 1, rol: 'juez' }),
    );
  });

  it('lanza error si la cedula ya existe', async () => {
    mockUsuario.findOne.mockResolvedValue({ id: 99 } as any);

    await expect(
      createJuez({ nombre: 'X', apellidos: 'Y', cedula: '12345', box: 'B' }),
    ).rejects.toThrow('Ya existe un usuario con esta cedula');
  });

  it('asigna box_id null cuando no hay evento_id', async () => {
    mockUsuario.findOne.mockResolvedValue(null);
    const instanceMock = {
      toJSON: () => ({
        id: 2, nombre: 'Ana', apellidos: 'Lopez', cedula: '67890',
        rol: 'juez', box_id: null,
      }),
      id: 2,
    };
    mockUsuario.create.mockResolvedValue(instanceMock as any);

    const result = await createJuez({
      nombre: 'Ana', apellidos: 'Lopez', cedula: '67890', box: 'Box',
    });

    expect(mockUsuario.create).toHaveBeenCalledWith(
      expect.objectContaining({ box_id: null, rol: 'juez' }),
    );
    expect(result.usuario).toBeDefined();
  });

  it('no crea EventoUsuario cuando no hay evento_id', async () => {
    mockUsuario.findOne.mockResolvedValue(null);
    const instanceMock = {
      toJSON: () => ({
        id: 3, nombre: 'Test', apellidos: 'User', cedula: '11111',
        rol: 'juez', box_id: null,
      }),
      id: 3,
    };
    mockUsuario.create.mockResolvedValue(instanceMock as any);

    await createJuez({
      nombre: 'Test', apellidos: 'User', cedula: '11111', box: 'B',
    });

    expect(mockEventoUsuario.create).not.toHaveBeenCalled();
  });
});

describe('bulkCreate con evento (bug prod: CSV dejaba jueces sin alcance)', () => {
  it('asigna evento_id al participante y membresía al juez', async () => {
    mockUsuario.findOne.mockResolvedValue(null);
    mockParticipante.findOne.mockResolvedValue(null);
    const juezInst = { id: 10 };
    mockUsuario.create.mockResolvedValue(juezInst as any);
    mockParticipante.create.mockResolvedValue({ id: 20 } as any);
    (mockEventoUsuario.findOrCreate as jest.Mock).mockResolvedValue([{}, true]);

    const filas = [
      { tipo: 'juez', nombre: 'J', apellidos: 'U', cedula: 'J1', box: 'B' },
      { tipo: 'atleta', nombre: 'A', apellidos: 'P', cedula: 'A1', box: 'B', fecha_nacimiento: '2000-01-01' },
    ];
    const res = await bulkCreate(filas as any, 5);

    expect(res.exitosos).toBe(2);
    expect(mockParticipante.create).toHaveBeenCalledWith(expect.objectContaining({ evento_id: 5 }));
    expect(mockEventoUsuario.findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { evento_id: 5, usuario_id: 10 } }),
    );
  });

  it('sin evento_id mantiene legacy (null) sin romper', async () => {
    mockUsuario.findOne.mockResolvedValue(null);
    mockParticipante.findOne.mockResolvedValue(null);
    mockUsuario.create.mockResolvedValue({ id: 11 } as any);
    mockParticipante.create.mockResolvedValue({ id: 21 } as any);

    const filas = [
      { tipo: 'atleta', nombre: 'A', apellidos: 'P', cedula: 'A2', box: 'B', fecha_nacimiento: '2000-01-01' },
    ];
    const res = await bulkCreate(filas as any);

    expect(res.exitosos).toBe(1);
    expect(mockParticipante.create).toHaveBeenCalledWith(expect.objectContaining({ evento_id: null }));
    expect(mockEventoUsuario.findOrCreate as jest.Mock).not.toHaveBeenCalled();
  });
});

describe('deleteUsuario', () => {
  it('lanza error si el usuario no existe', async () => {
    mockUsuario.findByPk.mockResolvedValue(null);

    await expect(deleteUsuario(999)).rejects.toThrow('Usuario no encontrado');
  });

  it('lanza error si se intenta borrar el ultimo admin', async () => {
    mockUsuario.findByPk.mockResolvedValue({ id: 1, rol: 'admin' } as any);
    mockUsuario.count.mockResolvedValue(1);

    await expect(deleteUsuario(1)).rejects.toThrow(
      'No se puede eliminar el unico administrador del sistema',
    );
  });

  it('permite borrar admin si hay mas de uno', async () => {
    const destroyMock = jest.fn();
    mockUsuario.findByPk.mockResolvedValue({
      id: 1, rol: 'admin', destroy: destroyMock,
    } as any);
    mockUsuario.count.mockResolvedValue(2);
    mockAsignacionCount.mockResolvedValue(0);
    mockResultadoCount.mockResolvedValue(0);

    await expect(deleteUsuario(1)).resolves.not.toThrow();
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it('lanza error si el usuario tiene asignaciones', async () => {
    mockUsuario.findByPk.mockResolvedValue({
      id: 2, rol: 'juez', destroy: jest.fn(),
    } as any);
    mockUsuario.count.mockResolvedValue(5);
    mockAsignacionCount.mockResolvedValue(3);
    mockResultadoCount.mockResolvedValue(0);

    await expect(deleteUsuario(2)).rejects.toThrow('asignacion(es) activa(s)');
  });

  it('lanza error si el usuario tiene resultados como juez', async () => {
    mockUsuario.findByPk.mockResolvedValue({
      id: 3, rol: 'juez', destroy: jest.fn(),
    } as any);
    mockUsuario.count.mockResolvedValue(5);
    mockAsignacionCount.mockResolvedValue(0);
    mockResultadoCount.mockResolvedValue(2);

    await expect(deleteUsuario(3)).rejects.toThrow('resultado(s) como juez');
  });
});

describe('deleteParticipante', () => {
  it('lanza error si el participante no existe', async () => {
    mockParticipante.findByPk.mockResolvedValue(null);

    await expect(deleteParticipante(999)).rejects.toThrow('Participante no encontrado');
  });

  it('lanza error si el participante tiene resultados', async () => {
    mockParticipante.findByPk.mockResolvedValue({
      id: 10, destroy: jest.fn(),
    } as any);
    mockAsignacionCount.mockResolvedValue(0);
    mockResultadoCount.mockResolvedValue(5);

    await expect(deleteParticipante(10)).rejects.toThrow('resultado(s) registrado(s)');
  });

  it('lanza error si el participante tiene asignaciones', async () => {
    mockParticipante.findByPk.mockResolvedValue({
      id: 11, destroy: jest.fn(),
    } as any);
    mockAsignacionCount.mockResolvedValue(2);
    mockResultadoCount.mockResolvedValue(0);

    await expect(deleteParticipante(11)).rejects.toThrow('asignacion(es) activa(s)');
  });

  it('elimina participante si no tiene dependencias', async () => {
    const destroyMock = jest.fn();
    mockParticipante.findByPk.mockResolvedValue({
      id: 12, destroy: destroyMock,
    } as any);
    mockAsignacionCount.mockResolvedValue(0);
    mockResultadoCount.mockResolvedValue(0);

    await expect(deleteParticipante(12)).resolves.not.toThrow();
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });
});

describe('resetPasswordJuez', () => {
  it('genera temporal nueva y obliga a cambiarla', async () => {
    const updateMock = jest.fn();
    mockUsuario.findByPk.mockResolvedValue({
      id: 7, rol: 'juez', nombre: 'Juan', apellidos: 'Perez', cedula: '12345',
      update: updateMock,
    } as any);

    const result = await resetPasswordJuez(7);

    expect(result.tempPassword).toBeDefined();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ password_cambiado: false }),
    );
  });

  it('lanza error si no existe', async () => {
    mockUsuario.findByPk.mockResolvedValue(null);

    await expect(resetPasswordJuez(999)).rejects.toThrow('Usuario no encontrado');
  });

  it('lanza error si no es juez', async () => {
    mockUsuario.findByPk.mockResolvedValue({ id: 1, rol: 'admin', update: jest.fn() } as any);

    await expect(resetPasswordJuez(1)).rejects.toThrow('Solo se puede resetear');
  });
});
