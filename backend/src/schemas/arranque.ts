import { z } from 'zod';
import { MODOS_ARRANQUE } from '../models/Arranque';

export const arranqueSchema = z.object({
  modo: z.enum(MODOS_ARRANQUE as [string, ...string[]]),
  countdownSeg: z.number().int().min(3).max(60).optional(),
  programadoParaMs: z.number().int().positive().optional(),
});

export type ArranqueInput = z.infer<typeof arranqueSchema>;
