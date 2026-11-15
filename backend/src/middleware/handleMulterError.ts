import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';

/**
 * Error handler centralizado para multer (archivos muy grandes o tipos no
 * admitidos). Se usa como router.use() en rutas que aceptan uploads.
 */
const MENSAJES_TIPO = new Set([
  'Solo se admiten imágenes JPG, PNG o WebP',
  'Solo se admiten archivos CSV (.csv)',
]);

export function handleMulterError(err: any, _req: Request, res: Response, next: NextFunction) {
  const esMulter = err instanceof multer.MulterError;
  const esTipo = typeof err?.message === 'string' && MENSAJES_TIPO.has(err.message);
  if (!esMulter && !esTipo) return next(err);
  const mensaje =
    esMulter && err.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo supera el tamaño permitido'
      : (err.message as string);
  res.status(400).json({ message: mensaje });
}
