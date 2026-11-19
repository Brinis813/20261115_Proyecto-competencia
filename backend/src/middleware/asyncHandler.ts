import { Request, Response, NextFunction } from 'express';

/**
 * Envuelve un handler async para que un rechazo (p. ej. MySQL caído a mitad
 * de la petición) llegue a `next(err)` y al errorHandler centralizado, en
 * vez de colgar la petición con unhandledRejection (Express 4 no lo hace
 * solo). Los controladores actuales usan try/catch manual equivalente;
 * este es el estándar para código nuevo.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
