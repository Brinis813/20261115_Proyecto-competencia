import { Request, Response, NextFunction } from 'express';
import { isProduction } from '../config/env';
import { contextoDeRequest, reportError } from '../utils/monitoring';

/** Cualquier ruta /api que no exista devuelve JSON, no el HTML de Express. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ message: `Endpoint no encontrado: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  // Contexto multi-tenant para Sentry/logs: endpoint, competitionId, userId/rol.
  reportError(err, contextoDeRequest(req as never));

  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'El cuerpo de la peticion no es JSON valido' });
    return;
  }

  // En produccion nunca se filtra el mensaje interno: puede contener SQL,
  // rutas del servidor o nombres de tablas.
  res.status(err?.status || 500).json({
    message: isProduction
      ? 'Error interno del servidor'
      : err?.message || 'Error interno del servidor',
  });
}
