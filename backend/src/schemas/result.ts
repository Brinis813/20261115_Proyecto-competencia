import { z } from 'zod';

export const saveResultSchema = z.object({
  participante_id: z.number().int().positive(),
  wod_id: z.number().int().positive(),
  valor_bruto: z.string().trim().min(1, 'El resultado no puede estar vacio').max(50),
  abandono: z.boolean().optional(),
  capado: z.boolean().optional(),
  disqualificado: z.boolean().optional(),
  detalle: z
    .record(z.any())
    .nullable()
    .optional()
    .superRefine((detalle, ctx) => {
      // Cotas anti-DoS: el detalle es JSON libre pero acotado.
      if (detalle == null || typeof detalle !== 'object') return;
      if (Object.keys(detalle).length > 50) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El detalle supera las 50 claves' });
        return;
      }
      const splits = (detalle as Record<string, unknown>).splits;
      if (splits !== undefined && (!Array.isArray(splits) || splits.length > 200)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Los splits superan los 200 segmentos',
        });
      }
    }),
  desempate: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
  es_desempate: z.boolean().optional(),
});

export const participanteWodSchema = z.object({
  participante_id: z.number().int().positive(),
  wod_id: z.number().int().positive(),
});

export const resultParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'El identificador debe ser numérico'),
});

export const participantParamsSchema = z.object({
  participantId: z.string().regex(/^\d+$/, 'El identificador debe ser numérico'),
});

export const competenciaParamsSchema = z.object({
  competenciaId: z.string().regex(/^\d+$/, 'El identificador debe ser numérico'),
});

export type SaveResultInput = z.infer<typeof saveResultSchema>;
export type ParticipanteWodInput = z.infer<typeof participanteWodSchema>;
export type ResultParams = z.infer<typeof resultParamsSchema>;
export type ParticipantParams = z.infer<typeof participantParamsSchema>;
export type CompetenciaParams = z.infer<typeof competenciaParamsSchema>;
