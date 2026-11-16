import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { authMiddleware, adminOnly, type AuthRequest } from '../middleware/auth';
import { adminWriteRateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { resolverEvento } from '../middleware/evento';
import { handleMulterError } from '../middleware/handleMulterError';
import { Usuario } from '../models';
import * as eventoService from '../services/eventoService';
import { log } from '../utils/logger';
import { UPLOADS_DIR } from '../config/env';
import { borrarArchivoSubido, esImagenValida } from '../utils/archivos';

const router = Router();

/* ------------------------------------------------------------------ */
/* Portada del evento: archivos en disco, servidos por /api/uploads    */
/* ------------------------------------------------------------------ */

const PORTADAS_DIR = path.join(UPLOADS_DIR, 'eventos');
fs.mkdirSync(PORTADAS_DIR, { recursive: true });

const EXTENSIONES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const subirPortada = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PORTADAS_DIR),
    filename: (req, _file, cb) => {
      const id = Number(req.params.id);
      cb(
        null,
        `evento_${Number.isInteger(id) ? id : 'x'}_${Date.now()}${EXTENSIONES.get(_file.mimetype) ?? '.jpg'}`,
      );
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (EXTENSIONES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se admiten imágenes JPG, PNG o WebP'));
  },
});

/**
 * Solo puede tocar la portada quien administra ESE evento: el
 * superadmin (alcance sin acotar) o un admin cuyo box la incluya. Que sea
 * admin de otro evento no basta.
 */
function puedeEditarEvento(req: AuthRequest, eventoId: number): boolean {
  const alcance = req.alcance;
  if (!alcance) return false;
  if (alcance.permitidas === null) return true; // superadmin
  return alcance.permitidas.includes(eventoId);
}

/** Borra del disco una portada anterior, si vive dentro de uploads. */
function borrarPortadaAnterior(imagenUrl: string | null): void {
  borrarArchivoSubido(imagenUrl, '/api/uploads/');
}

/* ------------------------------------------------------------------ */
/* Publico: la portada del evento no pide sesion                       */
/* ------------------------------------------------------------------ */

/** Todas los eventos, ordenadas para el panel. */
router.get('/publicas', async (_req: Request, res: Response) => {
  try {
    res.json(await eventoService.listarEventosPublicos());
  } catch (error) {
    log.error('[GET /api/eventos/publicas]', error);
    res.status(500).json({ message: 'No se pudieron cargar los eventos' });
  }
});

/** Un evento concreto, para su pagina publica. */
router.get('/publicas/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'Identificador invalido' });

  try {
    const evento = await eventoService.eventoPublico(id);
    if (!evento) return res.status(404).json({ message: 'Evento no encontrada' });
    res.json(evento);
  } catch {
    res.status(500).json({ message: 'No se pudo cargar el evento' });
  }
});

/* ------------------------------------------------------------------ */
/* Con sesion: las que administra quien entra                          */
/* ------------------------------------------------------------------ */

router.use(authMiddleware);

/**
 * Eventos del usuario, ya ordenadas para el panel: en curso, proximas y
 * pasadas. El superadmin las ve todas.
 */ router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.tipo !== 'usuario') {
      return res.status(403).json({ message: 'Solo el personal del evento tiene panel' });
    }

    const usuario = await Usuario.findByPk(req.user.id);
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });

    const eventos = await eventoService.listarEventos({
      id: usuario.id,
      rol: usuario.rol,
      box_id: usuario.box_id,
      es_superadmin: !!usuario.es_superadmin,
    });

    res.json(eventos);
  } catch (error: any) {
    res.status(500).json({ message: error.message ?? 'No se pudieron cargar los eventos' });
  }
});

/* ------------------------------------------------------------------ */
/* Scoring policy: solo admin del evento                         */
/* ------------------------------------------------------------------ */

const scoringSchema = z
  .object({
    scoringType: z.enum(['POINTS_ACCUMULATION', 'WINNER_PER_Competencia']).optional(),
    tiebreakPolicy: z
      .enum([
        'NONE',
        'BEST_INDIVIDUAL_RANK',
        'DESIGNATED_TIEBREAK_Competencia',
        'LAST_Competencia_SCORE',
      ])
      .optional(),
    tiebreakCompetenciaId: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (d) =>
      d.scoringType !== undefined ||
      d.tiebreakPolicy !== undefined ||
      d.tiebreakCompetenciaId !== undefined,
    {
      message: 'Indica al menos un campo: scoringType, tiebreakPolicy o tiebreakCompetenciaId',
    },
  );

/** Cambia el criterio global de ganador y/o el desempate global. */
router.put(
  '/:id/scoring',
  resolverEvento,
  adminOnly,
  adminWriteRateLimiter(),
  validate(scoringSchema),
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: 'Identificador invalido' });
      return;
    }
    try {
      const { scoringType, tiebreakPolicy, tiebreakCompetenciaId } = req.body as {
        scoringType?: 'POINTS_ACCUMULATION' | 'WINNER_PER_Competencia';
        tiebreakPolicy?:
          | 'NONE'
          | 'BEST_INDIVIDUAL_RANK'
          | 'DESIGNATED_TIEBREAK_Competencia'
          | 'LAST_Competencia_SCORE';
        tiebreakCompetenciaId?: number | null;
      };
      res.json(
        await eventoService.actualizarScoringType(id, {
          scoringType,
          tiebreakPolicy,
          tiebreakCompetenciaId,
        }),
      );
    } catch (error: any) {
      res.status(400).json({ message: error.message ?? 'No se pudo actualizar el criterio' });
    }
  },
);

/* ------------------------------------------------------------------ */
/* Portada: solo admin del evento (o superadmin)                 */
/* ------------------------------------------------------------------ */

/** Sube o reemplaza la portada del evento (JPG/PNG/WebP, max 5 MB). */
router.put(
  '/:id/imagen',
  resolverEvento,
  adminOnly,
  adminWriteRateLimiter(),
  subirPortada.single('imagen'),
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => undefined);
      res.status(400).json({ message: 'Identificador invalido' });
      return;
    }
    if (!puedeEditarEvento(req, id)) {
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => undefined);
      res.status(403).json({ message: 'No administras este evento' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: 'Envia la imagen en el campo "imagen"' });
      return;
    }
    if (!(await esImagenValida(req.file.path))) {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      res.status(400).json({ message: 'El archivo no es una imagen JPG, PNG o WebP valida' });
      return;
    }
    try {
      const anterior = await eventoService.eventoPublico(id);
      const url = `/api/uploads/eventos/${req.file.filename}`;
      const resultado = await eventoService.actualizarImagen(id, url);
      borrarPortadaAnterior(anterior?.imagen_url ?? null);
      res.json({ message: 'Portada actualizada', ...resultado });
    } catch (error: any) {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      res.status(400).json({ message: error.message ?? 'No se pudo guardar la portada' });
    }
  },
);

/** Quita la portada del evento (borra el archivo). */
router.delete(
  '/:id/imagen',
  resolverEvento,
  adminOnly,
  adminWriteRateLimiter(),
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: 'Identificador invalido' });
      return;
    }
    if (!puedeEditarEvento(req, id)) {
      res.status(403).json({ message: 'No administras este evento' });
      return;
    }
    try {
      const anterior = await eventoService.eventoPublico(id);
      const resultado = await eventoService.actualizarImagen(id, null);
      borrarPortadaAnterior(anterior?.imagen_url ?? null);
      res.json({ message: 'Portada eliminada', ...resultado });
    } catch (error: any) {
      res.status(400).json({ message: error.message ?? 'No se pudo eliminar la portada' });
    }
  },
);

/**
 * Los errores de multer (archivo muy grande, tipo no admitido) son culpa del
 * cliente: se responden 400 con mensaje limpio en vez de caer al 500 global.
 * Lo demás se delega al manejador general.
 */
router.use(handleMulterError);

export default router;
