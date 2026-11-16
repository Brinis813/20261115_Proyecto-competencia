import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { adminWriteRateLimiter } from '../middleware/rateLimiter';
import { resolverEvento } from '../middleware/evento';
import {
  generarHeatsSchema,
  crearHeatSchema,
  moverAtletaSchema,
  horarioAutoSchema,
  horarioManualSchema,
} from '../schemas/heat';
import * as heatController from '../controllers/heatController';

const router = Router();

// Todo el módulo es del admin (o superadmin), siempre acotado a su evento.
router.use(authMiddleware, resolverEvento, adminOnly);

router.get('/', heatController.vistaHeats);
router.post(
  '/generar',
  adminWriteRateLimiter(),
  validate(generarHeatsSchema),
  heatController.generarHeats,
);
router.post('/', adminWriteRateLimiter(), validate(crearHeatSchema), heatController.crearHeat);
router.post(
  '/mover',
  adminWriteRateLimiter(),
  validate(moverAtletaSchema),
  heatController.moverAtleta,
);
router.delete('/asignacion/:participanteId', adminWriteRateLimiter(), heatController.quitarAtleta);
router.delete('/:heatId', adminWriteRateLimiter(), heatController.eliminarHeat);
router.delete('/categoria/:categoriaId', adminWriteRateLimiter(), heatController.limpiarCategoria);
router.post(
  '/horarios/auto',
  adminWriteRateLimiter(),
  validate(horarioAutoSchema),
  heatController.horarioAuto,
);
router.post(
  '/horarios/manual',
  adminWriteRateLimiter(),
  validate(horarioManualSchema),
  heatController.horarioManual,
);

export default router;
