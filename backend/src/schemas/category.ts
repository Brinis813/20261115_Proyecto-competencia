import { z } from 'zod';

const nombre = z
  .string()
  .trim()
  .min(1, 'El nombre de la categoría es obligatorio')
  .max(100, 'El nombre no puede superar 100 caracteres');
const genero = z.enum(['Masculino', 'Femenino', 'Mixto'], {
  errorMap: () => ({ message: 'El género debe ser Masculino, Femenino o Mixto' }),
});
const tipo_participacion = z.enum(['Individual', 'Escalado', 'Duplas', 'Equipos', 'Relevos'], {
  errorMap: () => ({
    message: 'El tipo de participación debe ser Individual, Escalado, Duplas, Equipos o Relevos',
  }),
});

export const createCategorySchema = z.object({
  nombre,
  genero,
  tipo_participacion: tipo_participacion.optional(),
});

export const updateCategorySchema = z.object({
  nombre: nombre.optional(),
  genero: genero.optional(),
  tipo_participacion: tipo_participacion.optional(),
});

export const categoryParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'El identificador debe ser numérico'),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryParams = z.infer<typeof categoryParamsSchema>;
