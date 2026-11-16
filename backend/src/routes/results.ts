import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authMiddleware, adminOnly, staffOnly } from '../middleware/auth';
import { resolverEvento } from '../middleware/evento';
import { rateLimitByRole, judgeSaveRateLimiter } from '../middleware/rateLimiter';
import { saveResultSchema, participanteWodSchema } from '../schemas/result';
import * as resultController from '../controllers/resultController';

const router = Router();

// Sin resolverEvento, req.alcance queda indefinido y los chequeos BOLA/IDOR
// del controlador deniegan todo (403) aunque el usuario esté autorizado.
router.use(authMiddleware, resolverEvento);
// Las mediciones las genera el cronómetro del juez: throttle por rol para que un
// cliente en bucle no sature MySQL ni el broadcast de sockets.
router.use(
  rateLimitByRole({ admin: 300, juez: 120, participante: 30, anonimo: 30 }, 60 * 1000, 'results'),
);

// Registrar y consultar mediciones es tarea de jueces y administradores.
// Un participante autenticado no puede escribir resultados.
router.post(
  '/',
  staffOnly,
  judgeSaveRateLimiter(),
  validate(saveResultSchema),
  resultController.saveResult,
);
router.get('/:id/splits', staffOnly, resultController.getSplits);
router.post(
  '/check',
  staffOnly,
  validate(participanteWodSchema),
  resultController.checkParticipant,
);
router.post('/reset', adminOnly, validate(participanteWodSchema), resultController.resetResult);
router.get('/participant/:participantId', resultController.getResultsByParticipant);
router.get('/competencia/:competenciaId', staffOnly, resultController.getResultsByCompetencia);

export default router;
