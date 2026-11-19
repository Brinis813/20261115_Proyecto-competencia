import { z } from 'zod';
import { wodSchema } from './wod';

export { wodSchema, esquemaWodSchema, MEDICIONES, MODALIDAD_DE_MEDICION } from './wod';
export type { MedicionInput, WodValidado } from './wod';

/**
 * Esquemas Zod de creación/edición de Competencias con su ráfaga de WODs.
 *
 * Se validan en `routes/competencias.ts` (middleware `validate`) antes del
 * controlador; el multitenant (`resolverEvento` + `adminOnly` + cabecera
 * `X-Evento-Id`) ya corrió antes y el servicio persiste en transacción.
 */

const competenciaBaseSchema = {
  nombre: z.string().trim().min(1, 'El nombre de la competencia es obligatorio').max(150),
  descripcion: z.string().max(2000).optional(),
  metodo_desempate: z.string().max(2000).optional(),
  tipo_flujo: z.enum(['en_serie', 'estaciones_simultaneas']),
  tipo_publicacion: z.enum(['tiempo_real', 'al_finalizar_circuito']),
  estado: z.enum(['borrador', 'activo', 'finalizado']).optional(),
  // Formato de la prueba: individual, relevos, duplas, equipos o escalado.
  tipo_participacion: z.enum(['Individual', 'Relevos', 'Duplas', 'Equipos', 'Escalado']).optional(),
  // Duración / time cap de la competencia completa en minutos (null o 0 = sin tope).
  duracion_minutos: z.number().int().min(0).max(1440).nullable().optional(),
  // Número de rondas que se repite cada ejercicio (1-100, default 1).
  // El backend las multiplica en la scorecard del juez:
  // Reps Totales = Reps por ronda × Rondas completadas + Reps parciales.
  rondas: z.number().int().min(1).max(100).nullable().optional(),
  desempate_nombre: z.string().max(150).nullable().optional(),
  desempate_tipo_medicion: z
    .enum(['tiempo', 'repeticiones', 'peso', 'distancia', 'calorías'])
    .nullable()
    .optional(),
  // Política de desempate de la competencia (default en servidor: DESIGNATED_CIRCUIT_SPLIT).
  tiebreak_policy: z.enum(['NONE', 'TIEBREAK_MARK', 'DESIGNATED_CIRCUIT_SPLIT']).optional(),
  // WOD designado (debe pertenecer a la competencia; solo tiene efecto por update).
  wod_desempate_id: z.number().int().positive().nullable().optional(),
  // Divisiones de texto libre (compatibilidad con Competencias antiguos); si llegan
  // `categoria_ids` mandan estas y `divisiones` se recalcula.
  divisiones: z.array(z.string().trim().min(1).max(50)).max(12).nullable().optional(),
  // Categorías reales que compiten esta competencia.
  categoria_ids: z.array(z.number().int().positive()).max(20).nullable().optional(),
};

export const createCompetenciaSchema = z.object({
  ...competenciaBaseSchema,
  wods: z.array(wodSchema).min(1, 'Agrega al menos un WOD'),
});

export const updateCompetenciaSchema = z.object({
  ...competenciaBaseSchema,
  nombre: competenciaBaseSchema.nombre.optional(),
  tipo_flujo: competenciaBaseSchema.tipo_flujo.optional(),
  tipo_publicacion: competenciaBaseSchema.tipo_publicacion.optional(),
  wods: z.array(wodSchema).min(1).optional(),
});

export const assignCompetenciaSchema = z.object({
  competencia_id: z.number().int().positive(),
  // null = todos los WODs de la competencia.
  wod_id: z.number().int().positive().nullable().optional(),
  pares: z
    .array(
      z.object({
        usuario_id: z.number().int().positive(),
        participante_id: z.number().int().positive(),
      }),
    )
    .min(1, 'Agrega al menos una pareja juez-atleta'),
});

export const competenciaIdParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'El identificador debe ser numérico'),
});

export type CompetenciaCreada = z.infer<typeof createCompetenciaSchema>;
export type CompetenciaActualizada = z.infer<typeof updateCompetenciaSchema>;
export type AssignCompetenciaInput = z.infer<typeof assignCompetenciaSchema>;
export type CompetenciaIdParams = z.infer<typeof competenciaIdParamsSchema>;
