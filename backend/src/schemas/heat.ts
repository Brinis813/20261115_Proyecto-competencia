import { z } from 'zod';

const horaRegex = /^([01]?\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

export const generarHeatsSchema = z.object({
  categoria_id: z.number().int().positive(),
  capacidad_maxima: z.number().int().min(1).max(50),
  modo: z.enum(['alfabetico', 'aleatorio']),
});

export const crearHeatSchema = z.object({
  categoria_id: z.number().int().positive(),
  capacidad_maxima: z.number().int().min(1).max(50),
});

export const moverAtletaSchema = z.object({
  participante_id: z.number().int().positive(),
  heat_id: z.number().int().positive(),
  carril_numero: z.number().int().min(1).max(50).nullable().optional(),
});

export const quitarAtletaParamsSchema = z.object({
  participanteId: z.string().regex(/^\d+$/, 'El identificador debe ser numérico'),
});

export const quitarAtletaBodySchema = z.object({
  categoria_id: z.number().int().positive(),
});

export const eliminarHeatParamsSchema = z.object({
  heatId: z.string().regex(/^\d+$/, 'El identificador debe ser numérico'),
});

export const limpiarCategoriaParamsSchema = z.object({
  categoriaId: z.string().regex(/^\d+$/, 'El identificador debe ser numérico'),
});

export const horarioAutoSchema = z.object({
  categoria_id: z.number().int().positive(),
  competencia_id: z.number().int().positive(),
  hora_heat_1: z.string().regex(horaRegex, 'Usa HH:MM de 24 h'),
  transicion_min: z.number().int().min(0).max(180),
});

export const horarioManualSchema = z.object({
  categoria_id: z.number().int().positive(),
  competencia_id: z.number().int().positive(),
  horarios: z
    .array(
      z.object({
        heat_id: z.number().int().positive(),
        hora_inicio: z.string().regex(horaRegex, 'Usa HH:MM de 24 h'),
      })
    )
    .min(1)
    .max(100),
});

export type GenerarHeatsInput = z.infer<typeof generarHeatsSchema>;
export type CrearHeatInput = z.infer<typeof crearHeatSchema>;
export type MoverAtletaInput = z.infer<typeof moverAtletaSchema>;
export type QuitarAtletaParams = z.infer<typeof quitarAtletaParamsSchema>;
export type QuitarAtletaBody = z.infer<typeof quitarAtletaBodySchema>;
export type EliminarHeatParams = z.infer<typeof eliminarHeatParamsSchema>;
export type LimpiarCategoriaParams = z.infer<typeof limpiarCategoriaParamsSchema>;
export type HorarioAutoInput = z.infer<typeof horarioAutoSchema>;
export type HorarioManualInput = z.infer<typeof horarioManualSchema>;
