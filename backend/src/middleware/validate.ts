import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Valida SOLO `req.body` contra el schema y lo sustituye por el dato
 * parseado (los campos no declarados se amputan).
 *
 * NO toca `req.query` ni `req.params`:
 * - params de ruta: usar `validateParams()` (abajo).
 * - query strings: llegan siempre como string; cada controlador los coerce
 *   con guards (`Number.isInteger(...) && ... > 0`, `typeof x === 'string'`)
 *   antes de usarlos — ver heatController, userController.getAdmins,
 *   leaderboardController y competenciaController.getPublicCompetencias.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        message: 'Datos invalidos',
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({
        message: 'Parametros invalidos',
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.params = result.data;
    next();
  };
}
