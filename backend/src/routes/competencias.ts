import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { validate } from '../middleware/validate';
import { authMiddleware, adminOnly, staffOnly, type AuthRequest } from '../middleware/auth';
import { adminWriteRateLimiter } from '../middleware/rateLimiter';
import { resolverEvento } from '../middleware/evento';
import { handleMulterError } from '../middleware/handleMulterError';
import { cargarCompetenciaConAcceso } from '../controllers/helpers';
import { UPLOADS_DIR } from '../config/env';
import { borrarArchivoSubido, esImagenValida } from '../utils/archivos';
import * as competenciaService from '../services/competenciaService';
import {
  createCompetenciaSchema,
  updateCompetenciaSchema,
  assignCompetenciaSchema,
} from '../schemas/competencia';
import { arranqueSchema } from '../schemas/arranque';
import * as competenciaController from '../controllers/competenciaController';
import * as arranqueController from '../controllers/arranqueController';

const router = Router();

// Los esquemas de Competencia/WOD/esquema viven en `schemas/competencia.ts`
// (fuente única, con los 6 tipos de medición y refinamientos de movimientos).

// --- Publico (pantalla del leaderboard, sin sesion) ---
router.get('/public', competenciaController.getPublicCompetencias);

// --- Staff ---
router.get('/judge', authMiddleware, resolverEvento, staffOnly, competenciaController.getJudgeCompetencias);

// Lectura del arranque vigente: jueces asignados, admins y pantalla pública
// (la cuenta atrás se proyecta). El controlador valida al juez por asignación.
// NOTE: resolverEvento es obligatorio: sin él req.alcance queda indefinido y
// puedeEditar() devuelve 403 "No administras este evento" aunque el admin sí
// administre el evento (era el bug de la pantalla Competencias).
router.get('/:id/arranque', authMiddleware, resolverEvento, arranqueController.estadoArranque);

// --- Solo administracion ---
router.use(authMiddleware, resolverEvento, adminOnly);

/* ------------------------------------------------------------------ */
/* Imagen del WOD: archivos en disco, servidos por /api/uploads/wods   */
/*                                                                    */
/* El WOD nuevo aun no tiene id cuando se crea la competencia, asi que */
/* la subida va desacoplada: POST /wod-imagen devuelve la URL y el     */
/* cliente la envia como `imagen_url` dentro del WOD (create/update).  */
/* ------------------------------------------------------------------ */

/** Raiz de archivos subidos: backend/uploads en local y en Docker. */
const WODS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'wods');
fs.mkdirSync(WODS_DIR, { recursive: true });

const EXTENSIONES_WOD = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const subirImagenWod = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, WODS_DIR),
    filename: (_req, file, cb) => {
      cb(null, `wod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${EXTENSIONES_WOD.get(file.mimetype) ?? '.jpg'}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (EXTENSIONES_WOD.has(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se admiten imágenes JPG, PNG o WebP'));
  },
});

/**
 * Sube la foto de un WOD (JPG/PNG/WebP, max 5 MB) y devuelve su URL.
 * El cliente la guarda como `imagen_url` al crear o editar la competencia.
 */
router.post('/wod-imagen', subirImagenWod.single('imagen'), async (req: AuthRequest, res: any) => {
  if (!req.file) {
    res.status(400).json({ message: 'Envia la imagen en el campo "imagen"' });
    return;
  }
  // El mimetype lo declara el cliente: se verifica el contenido real
  // (magic bytes) antes de aceptar el archivo.
  if (!(await esImagenValida(req.file.path))) {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    res.status(400).json({ message: 'El archivo no es una imagen JPG, PNG o WebP valida' });
    return;
  }
  res.json({ imagen_url: `/api/uploads/wods/${req.file.filename}` });
});

/**
 * Los errores de multer (archivo muy grande, tipo no admitido) son culpa del
 * cliente: se responden 400 con mensaje limpio en vez de caer al 500 global.
 */
router.use('/wod-imagen', handleMulterError);

/* ------------------------------------------------------------------ */
/* Portada de la competencia: archivos en disco, servidos por          */
/* /api/uploads/competencias (igual que la portada del evento).        */
/* ------------------------------------------------------------------ */

const PORTADAS_DIR = path.join(UPLOADS_DIR, 'competencias');
fs.mkdirSync(PORTADAS_DIR, { recursive: true });

const subirPortadaCompetencia = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PORTADAS_DIR),
    filename: (req, _file, cb) => {
      const id = Number(req.params.id);
      cb(null, `competencia_${Number.isInteger(id) ? id : 'x'}_${Date.now()}${EXTENSIONES_WOD.get(_file.mimetype) ?? '.jpg'}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (EXTENSIONES_WOD.has(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se admiten imágenes JPG, PNG o WebP'));
  },
});

/** Borra del disco una portada anterior, si vive dentro de uploads. */
function borrarPortadaAnterior(imagenUrl: string | null): void {
  borrarArchivoSubido(imagenUrl, '/api/uploads/');
}

/** Sube o reemplaza la portada de la competencia (JPG/PNG/WebP, max 5 MB). */
router.put(
  '/:id/imagen',
  adminWriteRateLimiter(),
  subirPortadaCompetencia.single('imagen'),
  async (req: AuthRequest, res: any) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => undefined);
      res.status(400).json({ message: 'Identificador invalido' });
      return;
    }
    const acceso = await cargarCompetenciaConAcceso(req, id);
    if ('error' in acceso) {
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => undefined);
      res.status(acceso.error === 'no-encontrado' ? 404 : 403).json({
        message: acceso.error === 'no-encontrado' ? 'Competencia no encontrado' : 'No tienes acceso a esta competencia',
      });
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
      const url = `/api/uploads/competencias/${req.file.filename}`;
      const resultado = await competenciaService.actualizarImagenCompetencia(id, url);
      res.json({ message: 'Portada actualizada', ...resultado });
    } catch (error: any) {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      res.status(400).json({ message: error.message ?? 'No se pudo guardar la portada' });
    }
  }
);

/** Quita la portada de la competencia (borra el archivo). */
router.delete('/:id/imagen', adminWriteRateLimiter(), async (req: AuthRequest, res: any) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: 'Identificador invalido' });
    return;
  }
  const acceso = await cargarCompetenciaConAcceso(req, id);
  if ('error' in acceso) {
    res.status(acceso.error === 'no-encontrado' ? 404 : 403).json({
      message: acceso.error === 'no-encontrado' ? 'Competencia no encontrado' : 'No tienes acceso a esta competencia',
    });
    return;
  }
  try {
    const resultado = await competenciaService.actualizarImagenCompetencia(id, null);
    res.json({ message: 'Portada eliminada', ...resultado });
  } catch (error: any) {
    res.status(400).json({ message: error.message ?? 'No se pudo eliminar la portada' });
  }
});

router.use('/:id/imagen', handleMulterError);

router.get('/', competenciaController.getCompetencias);
router.post('/', adminWriteRateLimiter(), validate(createCompetenciaSchema), competenciaController.createCompetencia);
router.post('/assign', adminWriteRateLimiter(), validate(assignCompetenciaSchema), competenciaController.assignCompetencia);
// Arranque sincronizado + comandos de emergencia (pausa, reanudar, fin, abortar).
router.post('/:id/arranque', adminWriteRateLimiter(), validate(arranqueSchema), arranqueController.armarCompetencia);
router.post('/:id/arranque/pausa', adminWriteRateLimiter(), arranqueController.pausarArranque);
router.post('/:id/arranque/reanudar', adminWriteRateLimiter(), arranqueController.reanudarArranque);
router.post('/:id/arranque/fin', adminWriteRateLimiter(), arranqueController.finalizarArranque);
router.delete('/:id/arranque', adminWriteRateLimiter(), arranqueController.cancelarArranque);
router.get('/:id', competenciaController.getCompetencia);
router.put('/:id', adminWriteRateLimiter(), validate(updateCompetenciaSchema), competenciaController.updateCompetencia);
router.delete('/:id', adminWriteRateLimiter(), competenciaController.deleteCompetencia);
router.get('/:id/assignments', competenciaController.getCompetenciaAssignments);
router.delete('/assignments/:asignacionId', adminWriteRateLimiter(), competenciaController.removeAssignment);

export default router;
