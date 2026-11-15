import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authMiddleware, staffOnly } from '../middleware/auth';
import { resolverEvento } from '../middleware/evento';
import * as participantController from '../controllers/participantController';

const router = Router();

const resultsSchema = z.object({
  cedula: z.string().trim().min(1, 'La cedula es obligatoria'),
  fecha_nacimiento: z.string().regex(/^\d{4}[-/]\d{2}[-/]\d{2}$/, 'Formato esperado: AAAA/MM/DD o AAAA-MM-DD'),
});

const lookupSchema = z.object({
  cedula: z.string().trim().min(1, 'La cedula es obligatoria'),
});

router.use(authMiddleware, resolverEvento);

router.post('/results', validate(resultsSchema), participantController.getParticipantResults);

// La busqueda por cedula expone datos personales, asi que queda restringida
// al staff que necesita identificar atletas durante el evento.
router.post('/lookup', staffOnly, validate(lookupSchema), participantController.lookupParticipant);

export default router;
