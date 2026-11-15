import { Router } from 'express';
import multer from 'multer';
import { validate } from '../middleware/validate';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { adminWriteRateLimiter } from '../middleware/rateLimiter';
import { resolverEvento } from '../middleware/evento';
import { handleMulterError } from '../middleware/handleMulterError';
import { superadminOnly } from '../middleware/superadmin';
import {
  createAdminSchema,
  createJuezSchema,
  createParticipanteSchema,
  updateUsuarioSchema,
  updateParticipanteSchema,
} from '../schemas/user';
import * as userController from '../controllers/userController';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  // Solo CSV: los navegadores reportan text/csv, application/vnd.ms-excel o
  // application/octet-stream para .csv; se acepta tambien por extension.
  fileFilter: (_req, file, cb) => {
    const mimeOk = /csv|excel|octet-stream|text\/plain/i.test(file.mimetype);
    const extOk = /\.csv$/i.test(file.originalname);
    if (mimeOk || extOk) cb(null, true);
    else cb(new Error('Solo se admiten archivos CSV (.csv)'));
  },
});

const router = Router();

router.use(authMiddleware, resolverEvento, adminOnly);

// Administradores de box: solo el superadmin. Va antes que el resto para que
// no lo tape ninguna ruta con parametro.
router.get('/admins', superadminOnly, userController.getAdmins);
router.post('/admins', superadminOnly, adminWriteRateLimiter(), validate(createAdminSchema), userController.createAdmin);

router.get('/jueces', userController.getJueces);
router.get('/participantes', userController.getParticipantes);

router.post('/jueces', adminWriteRateLimiter(), validate(createJuezSchema), userController.createJuez);
router.post('/participantes', adminWriteRateLimiter(), validate(createParticipanteSchema), userController.createParticipante);

router.put('/jueces/:id', adminWriteRateLimiter(), validate(updateUsuarioSchema), userController.updateUsuario);
router.put('/participantes/:id', adminWriteRateLimiter(), validate(updateParticipanteSchema), userController.updateParticipante);

router.post('/jueces/:id/reset-password', adminWriteRateLimiter(), userController.resetPasswordJuez);

router.delete('/jueces/:id', adminWriteRateLimiter(), userController.deleteUsuario);
router.delete('/participantes/:id', adminWriteRateLimiter(), userController.deleteParticipante);

// Carga masiva de atletas y jueces desde CSV
router.post('/bulk', adminWriteRateLimiter(), upload.single('archivo'), userController.bulkUpload);
router.use('/bulk', handleMulterError);

export default router;
