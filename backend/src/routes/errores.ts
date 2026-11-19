import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { contextoDeRequest, reportError } from '../utils/monitoring';

const router = Router();

/**
 * Buzón de errores del frontend (área 1: monitoreo).
 *
 * Público a propósito (la pantalla del evento es anónima), con rate-limit
 * estricto y campos acotados. El cliente ya filtra (solo red/5xx, 1/min);
 * aquí se registra con el mismo contexto que los errores del backend y, si
 * hay SENTRY_DSN, viaja a Sentry.
 */
const errorFrontendSchema = z.object({
  mensaje: z.string().trim().max(500).optional(),
  endpoint: z.string().trim().max(200).optional(),
  estado: z.number().int().nullable().optional(),
  competitionId: z.number().int().nullable().optional(),
  fuente: z.string().trim().max(50).optional(),
});

// Anti log-injection: el mensaje del cliente puede traer \r\n para forjar
// lineas en el log/Sentry; se colapsa a espacios y se corta a 500.
function desinfectar(valor: unknown): string {
  return String(valor ?? 'error sin mensaje')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 500);
}

router.post(
  '/',
  strictRateLimiter(20, 60 * 1000),
  validate(errorFrontendSchema),
  (req: Request, res: Response) => {
    const cuerpo = req.body as Record<string, unknown>;
    reportError(new Error(`frontend: ${desinfectar(cuerpo.mensaje)}`), {
      ...contextoDeRequest(req as never),
      endpoint:
        (cuerpo.endpoint as string) || (contextoDeRequest(req as never).endpoint ?? 'frontend'),
    });
    res.status(202).json({ message: 'Error registrado' });
  },
);

export default router;
