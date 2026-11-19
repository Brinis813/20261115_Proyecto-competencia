jest.mock('../models', () => ({
  __esModule: true,
  Categoria: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  },
  Participante: {
    count: jest.fn(),
    update: jest.fn(),
  },
}));

import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../services/categoryService';
import { Categoria, Participante } from '../models';

const mockCategoria = Categoria as unknown as {
  findAll: jest.Mock;
  findByPk: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
};
const mockParticipante = Participante as unknown as { count: jest.Mock; update: jest.Mock };

function categoriaMock(attrs: Record<string, any>): any {
  return {
    ...attrs,
    toJSON: () => ({
      id: attrs.id,
      evento_id: attrs.evento_id ?? null,
      nombre: attrs.nombre,
      genero: attrs.genero,
      tipo_participacion: attrs.tipo_participacion ?? 'Individual',
    }),
  };
}

beforeEach(() => jest.clearAllMocks());

describe('getAllCategories', () => {
  it('ordena por nombre y género y anexa el total de participantes', async () => {
    mockCategoria.findAll.mockResolvedValue([
      categoriaMock({ id: 1, nombre: 'RX', genero: 'Masculino' }),
    ]);
    mockParticipante.count.mockResolvedValue(7);

    const res = await getAllCategories();

    expect(mockCategoria.findAll).toHaveBeenCalledWith({
      where: {},
      order: [
        ['nombre', 'ASC'],
        ['genero', 'ASC'],
      ],
    });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: 1, nombre: 'RX', total_participantes: 7 });
  });

  it('aplica el filtro que recibe', async () => {
    mockCategoria.findAll.mockResolvedValue([]);
    mockParticipante.count.mockResolvedValue(0);

    await getAllCategories({ evento_id: 3 });

    expect(mockCategoria.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { evento_id: 3 } }),
    );
    expect(mockParticipante.count).not.toHaveBeenCalled();
  });

  it('conserva solo la categoría de id menor ante duplicados históricos', async () => {
    mockCategoria.findAll.mockResolvedValue([
      categoriaMock({ id: 9, evento_id: null, nombre: 'RX', genero: 'Femenino' }),
      categoriaMock({ id: 4, evento_id: null, nombre: 'rx', genero: 'femenino' }),
      categoriaMock({ id: 7, evento_id: 5, nombre: 'RX', genero: 'Femenino' }),
    ]);
    mockParticipante.count.mockResolvedValue(0);

    const res = await getAllCategories();

    // Diferente evento = categoría distinta; mismo evento y etiqueta = una sola.
    expect(res).toHaveLength(2);
    expect(res.map((c) => c.id).sort()).toEqual([4, 7]);
    expect(mockParticipante.count).toHaveBeenCalledTimes(2);
  });
});

describe('getCategoryById', () => {
  it('lanza error si la categoría no existe', async () => {
    mockCategoria.findByPk.mockResolvedValue(null);

    await expect(getCategoryById(999)).rejects.toThrow('Categoría no encontrada');
  });

  it('retorna la categoría con su total de participantes', async () => {
    mockCategoria.findByPk.mockResolvedValue(categoriaMock({ id: 3, nombre: 'Scaled' }));
    mockParticipante.count.mockResolvedValue(12);

    const res = await getCategoryById(3);

    expect(res).toMatchObject({ id: 3, nombre: 'Scaled', total_participantes: 12 });
    expect(mockParticipante.count).toHaveBeenCalledTimes(1);
  });
});

describe('createCategory', () => {
  it('lanza error si ya existe la categoría en el evento', async () => {
    mockCategoria.findOne.mockResolvedValue(categoriaMock({ id: 1, nombre: 'RX' }));

    await expect(
      createCategory({ nombre: 'RX', genero: 'Masculino', evento_id: 4 }),
    ).rejects.toThrow('Ya existe la categoría "RX" para el género Masculino');
    expect(mockCategoria.findOne).toHaveBeenCalledWith({
      where: { nombre: 'RX', genero: 'Masculino', evento_id: 4 },
    });
    expect(mockCategoria.create).not.toHaveBeenCalled();
  });

  it('crea con nombre limpio, tipo por defecto y evento en null', async () => {
    mockCategoria.findOne.mockResolvedValue(null);
    mockCategoria.create.mockResolvedValue(
      categoriaMock({ id: 10, nombre: 'RX', genero: 'Femenino' }),
    );

    const res = await createCategory({ nombre: '  RX  ', genero: 'Femenino' });

    expect(mockCategoria.create).toHaveBeenCalledWith({
      evento_id: null,
      nombre: 'RX',
      genero: 'Femenino',
      tipo_participacion: 'Individual',
    });
    // Sin evento no se filtra por evento (categoría global legacy).
    expect(mockCategoria.findOne).toHaveBeenCalledWith({
      where: { nombre: 'RX', genero: 'Femenino' },
    });
    expect(res).toMatchObject({ id: 10, nombre: 'RX', total_participantes: 0 });
  });

  it('respeta el tipo de participación y el evento recibidos', async () => {
    mockCategoria.findOne.mockResolvedValue(null);
    mockCategoria.create.mockResolvedValue(categoriaMock({ id: 11, nombre: 'Teens' }));

    await createCategory({
      nombre: 'Teens',
      genero: 'Masculino',
      tipo_participacion: 'Equipos',
      evento_id: 8,
    });

    expect(mockCategoria.create).toHaveBeenCalledWith(
      expect.objectContaining({ evento_id: 8, tipo_participacion: 'Equipos' }),
    );
    // La unicidad se comprueba dentro del evento recibido.
    expect(mockCategoria.findOne).toHaveBeenCalledWith({
      where: { nombre: 'Teens', genero: 'Masculino', evento_id: 8 },
    });
  });
});

describe('updateCategory', () => {
  it('lanza error si la categoría no existe', async () => {
    mockCategoria.findByPk.mockResolvedValue(null);

    await expect(updateCategory(9, { nombre: 'X' })).rejects.toThrow('Categoría no encontrada');
  });

  it('edita sin comprobar duplicados cuando solo cambia el tipo', async () => {
    const instancia = categoriaMock({ id: 5, nombre: 'RX', genero: 'Masculino' });
    instancia.update = jest.fn().mockResolvedValue(undefined);
    mockCategoria.findByPk.mockResolvedValue(instancia);
    mockParticipante.count.mockResolvedValue(0);

    await updateCategory(5, { tipo_participacion: 'Equipos' });

    expect(mockCategoria.findOne).not.toHaveBeenCalled();
    expect(instancia.update).toHaveBeenCalledWith({ tipo_participacion: 'Equipos' });
    // Sin cambio de nombre no se tocan los participantes.
    expect(mockParticipante.update).not.toHaveBeenCalled();
  });

  it('lanza error si otra categoría del evento ya tiene ese nombre', async () => {
    const instancia = categoriaMock({ id: 5, nombre: 'RX', genero: 'Masculino', evento_id: 2 });
    mockCategoria.findByPk.mockResolvedValue(instancia);
    mockCategoria.findOne.mockResolvedValue(categoriaMock({ id: 6, nombre: 'RX' }));

    await expect(updateCategory(5, { nombre: '  RX  ', genero: 'Masculino' })).rejects.toThrow(
      'Ya existe otra categoría con el nombre "RX" y género Masculino',
    );
    expect(mockCategoria.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ nombre: 'RX', genero: 'Masculino', evento_id: 2 }),
      }),
    );
    expect(instancia.update).toBeUndefined();
  });

  it('edita nombre y sincroniza la etiqueta de sus participantes', async () => {
    const instancia = categoriaMock({ id: 5, nombre: 'RX', genero: 'Femenino' });
    instancia.update = jest.fn().mockResolvedValue(undefined);
    mockCategoria.findByPk.mockResolvedValue(instancia);
    mockCategoria.findOne.mockResolvedValue(null);
    mockParticipante.count.mockResolvedValue(2);
    mockParticipante.update.mockResolvedValue([1]);

    const res = await updateCategory(5, { nombre: ' Escalado ' });

    expect(instancia.update).toHaveBeenCalledWith({ nombre: 'Escalado' });
    expect(mockParticipante.update).toHaveBeenCalledWith(
      { categoria: 'Escalado Femenino' },
      { where: { categoria_id: 5 } },
    );
    expect(res).toMatchObject({ id: 5, nombre: 'RX', total_participantes: 2 });
  });

  it('cambia género sin tocar participantes si no cambia el nombre', async () => {
    const instancia = categoriaMock({ id: 5, nombre: 'RX', genero: 'Masculino' });
    instancia.update = jest.fn().mockResolvedValue(undefined);
    mockCategoria.findByPk.mockResolvedValue(instancia);
    mockCategoria.findOne.mockResolvedValue(null);
    mockParticipante.count.mockResolvedValue(0);

    await updateCategory(5, { genero: 'Femenino' });

    expect(instancia.update).toHaveBeenCalledWith({ genero: 'Femenino' });
    expect(mockParticipante.update).not.toHaveBeenCalled();
  });
});

describe('deleteCategory', () => {
  it('lanza error si la categoría no existe', async () => {
    mockCategoria.findByPk.mockResolvedValue(null);

    await expect(deleteCategory(9)).rejects.toThrow('Categoría no encontrada');
  });

  it('rechaza borrar una categoría con atletas', async () => {
    mockCategoria.findByPk.mockResolvedValue(
      categoriaMock({ id: 5, nombre: 'RX', genero: 'Masculino' }),
    );
    mockParticipante.count.mockResolvedValue(3);

    await expect(deleteCategory(5)).rejects.toThrow('está siendo utilizada por 3 atleta(s)');
    expect(mockCategoria.findByPk).toHaveBeenCalledTimes(1);
  });

  it('borra cuando ningún atleta la usa', async () => {
    const instancia = categoriaMock({ id: 5, nombre: 'RX', genero: 'Masculino' });
    const destroyMock = jest.fn().mockResolvedValue(undefined);
    instancia.destroy = destroyMock;
    mockCategoria.findByPk.mockResolvedValue(instancia);
    mockParticipante.count.mockResolvedValue(0);

    const res = await deleteCategory(5);

    expect(destroyMock).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ message: 'Categoría eliminada correctamente' });
  });
});
