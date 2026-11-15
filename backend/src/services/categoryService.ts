import { Op } from 'sequelize';
import { Categoria, Participante } from '../models';
import type { GeneroCategoria, TipoParticipacionCategoria } from '../models/Categoria';

/**
 * Opción B: la categoría es SOLO perfil de participación
 * (nombre/nivel + género + formato). Toda la operativa
 * (ejercicios, pesos, distancias, reps por categoría) vive en la competencia
 * (`wods.esquema.movimientos[].reps/peso`).
 */
export interface CategoriaInput {
  nombre: string;
  genero: GeneroCategoria;
  tipo_participacion?: TipoParticipacionCategoria;
}

export async function getAllCategories(filtro: Record<string, any> = {}) {
  const categorias = await Categoria.findAll({
    where: filtro,
    order: [
      ['nombre', 'ASC'],
      ['genero', 'ASC'],
    ],
  });

  // Defensa contra duplicados históricos (misma etiqueta con distinto id por
  // la clave única con evento_id NULL + semillas repetidas): la UI los mostraba
  // repetidos. Se conserva el de id menor por cada (evento, nombre, género).
  const unicas = new Map<string, typeof categorias[number]>();
  for (const cat of [...categorias].sort((a, b) => a.id - b.id)) {
    const clave = `${cat.evento_id ?? 'null'}|${String(cat.nombre ?? '').trim().toLowerCase()}|${String(cat.genero ?? '').trim().toLowerCase()}`;
    if (!unicas.has(clave)) unicas.set(clave, cat);
  }

  const resultado = await Promise.all(
    [...unicas.values()].map(async (cat) => {
      const total = await Participante.count({
        where: {
          [Op.or]: [{ categoria_id: cat.id }, { categoria: `${cat.nombre} ${cat.genero}` }, { categoria: cat.nombre }],
        },
      });
      return {
        ...cat.toJSON(),
        total_participantes: total,
      };
    })
  );

  return resultado;
}

export async function getCategoryById(id: number) {
  const categoria = await Categoria.findByPk(id);
  if (!categoria) throw new Error('Categoría no encontrada');

  const total = await Participante.count({
    where: {
      [Op.or]: [
        { categoria_id: categoria.id },
        { categoria: `${categoria.nombre} ${categoria.genero}` },
        { categoria: categoria.nombre },
      ],
    },
  });

  return {
    ...categoria.toJSON(),
    total_participantes: total,
  };
}

export async function createCategory(data: CategoriaInput & { evento_id?: number | null }) {
  const nombreLimpio = data.nombre.trim();
  const genero = data.genero;
  const tipo_participacion = data.tipo_participacion ?? 'Individual';

  // La categoria es unica dentro de su evento: dos organizadores
  // distintos pueden tener cada uno su «RX Femenino».
  const existente = await Categoria.findOne({
    where: {
      nombre: nombreLimpio,
      genero,
      ...(data.evento_id ? { evento_id: data.evento_id } : {}),
    },
  });

  if (existente) {
    throw new Error(`Ya existe la categoría "${nombreLimpio}" para el género ${genero}`);
  }

  const nueva = await Categoria.create({
    evento_id: data.evento_id ?? null,
    nombre: nombreLimpio,
    genero,
    tipo_participacion,
  });

  return {
    ...nueva.toJSON(),
    total_participantes: 0,
  };
}

export async function updateCategory(id: number, data: Partial<CategoriaInput>) {
  const categoria = await Categoria.findByPk(id);
  if (!categoria) throw new Error('Categoría no encontrada');

  const nombreLimpio = data.nombre !== undefined ? data.nombre.trim() : categoria.nombre;
  const genero = data.genero !== undefined ? data.genero : categoria.genero;

  if (data.nombre !== undefined || data.genero !== undefined) {
    // La unicidad es por evento (como en createCategory): dos eventos pueden
    // tener cada uno su "RX Femenino". Sin scoping, editar bloqueaba de más y
    // con evento_id NULL el índice MySQL no impedía duplicados.
    const existente = await Categoria.findOne({
      where: {
        nombre: nombreLimpio,
        genero,
        id: { [Op.ne]: id },
        ...(categoria.evento_id ? { evento_id: categoria.evento_id } : {}),
      },
    });

    if (existente) {
      throw new Error(`Ya existe otra categoría con el nombre "${nombreLimpio}" y género ${genero}`);
    }
  }

  const actualizaciones: any = {};
  if (data.nombre !== undefined) actualizaciones.nombre = nombreLimpio;
  if (data.genero !== undefined) actualizaciones.genero = genero;
  if (data.tipo_participacion !== undefined) actualizaciones.tipo_participacion = data.tipo_participacion;

  await categoria.update(actualizaciones);

  // Sincronizar participantes vinculados si cambió el nombre
  if (data.nombre !== undefined) {
    await Participante.update(
      { categoria: `${nombreLimpio} ${genero}` },
      { where: { categoria_id: id } }
    );
  }

  return getCategoryById(id);
}

export async function deleteCategory(id: number) {
  const categoria = await Categoria.findByPk(id);
  if (!categoria) throw new Error('Categoría no encontrada');

  // Validar dependencias antes de eliminar
  const participantesAsociados = await Participante.count({
    where: {
      [Op.or]: [
        { categoria_id: id },
        { categoria: `${categoria.nombre} ${categoria.genero}` },
        { categoria: categoria.nombre },
      ],
    },
  });

  if (participantesAsociados > 0) {
    throw new Error(
      `No se puede eliminar la categoría "${categoria.nombre} (${categoria.genero})" porque está siendo utilizada por ${participantesAsociados} atleta(s). Reasigna o edita los atletas antes de eliminarla.`
    );
  }

  await categoria.destroy();
  return { message: 'Categoría eliminada correctamente' };
}
