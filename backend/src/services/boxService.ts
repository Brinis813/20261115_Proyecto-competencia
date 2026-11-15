import { Op } from 'sequelize';
import { Box, Evento, Usuario } from '../models';

export interface BoxListado {
  id: number;
  nombre: string;
  ciudad: string | null;
  total_eventos: number;
  total_administradores: number;
}

/** Todos los boxes con lo que cuelga de cada uno. Solo lo consulta el superadmin. */
export async function listarBoxes(): Promise<BoxListado[]> {
  const boxes = await Box.findAll({ order: [['nombre', 'ASC']] });
  if (boxes.length === 0) return [];

  const ids = boxes.map((b) => b.id);
  const [eventos, administradores] = await Promise.all([
    Evento.findAll({ where: { box_id: { [Op.in]: ids } }, attributes: ['id', 'box_id'] }),
    Usuario.findAll({
      where: { box_id: { [Op.in]: ids }, rol: 'admin' },
      attributes: ['id', 'box_id'],
    }),
  ]);

  const cuenta = (filas: Array<{ box_id: number | null }>) => {
    const mapa = new Map<number, number>();
    for (const f of filas) if (f.box_id) mapa.set(f.box_id, (mapa.get(f.box_id) ?? 0) + 1);
    return mapa;
  };

  const eventosPor = cuenta(eventos);
  const adminsPor = cuenta(administradores);

  return boxes.map((b) => ({
    id: b.id,
    nombre: b.nombre,
    ciudad: b.ciudad,
    total_eventos: eventosPor.get(b.id) ?? 0,
    total_administradores: adminsPor.get(b.id) ?? 0,
  }));
}

export async function crearBox(data: { nombre: string; ciudad?: string | null }) {
  const nombre = data.nombre.trim();

  const existente = await Box.findOne({ where: { nombre } });
  if (existente) throw new Error(`Ya existe un box con el nombre "${nombre}"`);

  return Box.create({ nombre, ciudad: data.ciudad?.trim() || null });
}

export async function actualizarBox(id: number, data: { nombre?: string; ciudad?: string | null }) {
  const box = await Box.findByPk(id);
  if (!box) throw new Error('Box no encontrado');

  if (data.nombre !== undefined) {
    const nombre = data.nombre.trim();
    const repetido = await Box.findOne({ where: { nombre, id: { [Op.ne]: id } } });
    if (repetido) throw new Error(`Ya existe un box con el nombre "${nombre}"`);
    box.set('nombre', nombre);
  }

  if (data.ciudad !== undefined) box.set('ciudad', data.ciudad?.trim() || null);

  await box.save();
  return box;
}

/**
 * Borra un box. Se niega si todavia tiene eventos o administradores: el
 * borrado en cascada dejaria a alguien sin poder entrar a ninguna parte.
 */
export async function eliminarBox(id: number) {
  const [eventos, administradores] = await Promise.all([
    Evento.count({ where: { box_id: id } }),
    Usuario.count({ where: { box_id: id } }),
  ]);

  if (eventos > 0 || administradores > 0) {
    throw new Error(
      `No se puede borrar: el box todavia tiene ${eventos} evento(s) y ${administradores} usuario(s). Muevelos o borralos primero.`
    );
  }

  const borrados = await Box.destroy({ where: { id } });
  if (!borrados) throw new Error('Box no encontrado');
}

/** Crea el box de quien se da de alta, o devuelve el que ya existiera con ese nombre. */
export async function boxParaAlta(nombre: string): Promise<Box> {
  const limpio = nombre.trim();
  const existente = await Box.findOne({ where: { nombre: limpio } });
  return existente ?? Box.create({ nombre: limpio });
}
