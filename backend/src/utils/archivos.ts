import fs from 'fs';
import path from 'path';
import { UPLOADS_DIR } from '../config/env';

/**
 * Utilidades compartidas de archivos subidos (portadas de evento y
 * competencia, fotos de WOD). Fuente única del guard anti path-traversal:
 * solo se borra dentro de UPLOADS_DIR y bajo el prefijo indicado.
 */
export function borrarArchivoSubido(imagenUrl: string | null, prefijo: string): void {
  if (!imagenUrl || !imagenUrl.startsWith(prefijo)) return;
  // path.resolve en ambos lados: en Windows join/normalize usan `\` y la
  // comparación directa contra UPLOADS_DIR fallaría siempre.
  const base = path.resolve(UPLOADS_DIR);
  const normalizada = path.resolve(base, imagenUrl.replace('/api/uploads/', ''));
  // Aunque pase el prefijo, nunca salir de uploads (anti path-traversal).
  if (normalizada !== base && !normalizada.startsWith(base + path.sep)) return;
  fs.promises.unlink(normalizada).catch(() => undefined);
}

/** Firma mínima por tipo admitido (magic bytes). */
function firmaValida(cabecera: Buffer): boolean {
  // JPEG: FF D8 FF
  if (cabecera[0] === 0xff && cabecera[1] === 0xd8 && cabecera[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    cabecera[0] === 0x89 &&
    cabecera[1] === 0x50 &&
    cabecera[2] === 0x4e &&
    cabecera[3] === 0x47
  ) {
    return true;
  }
  // WebP: RIFF....WEBP
  if (cabecera.toString('ascii', 0, 4) === 'RIFF' && cabecera.toString('ascii', 8, 12) === 'WEBP') {
    return true;
  }
  return false;
}

/**
 * Verifica que un archivo recién subido sea realmente JPG/PNG/WebP por
 * contenido (magic bytes), no solo por el mimetype que declara el cliente
 * (fácil de falsificar: HTML/SVG con mimetype JPG = stored-XSS según el
 * Content-Type servido por /api/uploads).
 */
export async function esImagenValida(ruta: string): Promise<boolean> {
  try {
    const fd = await fs.promises.open(ruta, 'r');
    try {
      const { buffer } = await fd.read(Buffer.alloc(12), 0, 12, 0);
      return firmaValida(buffer);
    } finally {
      await fd.close();
    }
  } catch {
    return false;
  }
}
