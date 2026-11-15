import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import {
  loginSchema,
  loginParticipanteSchema,
  registroSchema,
  verificarSchema,
  reenviarVerificacionSchema,
  changePasswordSchema,
  resetRequestSchema,
  resetConfirmSchema,
} from '../schemas/auth';
import * as authController from '../controllers/authController';

const router = Router();

// Limite estricto en los endpoints de login: 5 intentos por 15 minutos por IP.
const loginRateLimit = authRateLimiter();

router.post('/login', loginRateLimit, validate(loginSchema), authController.login);
// El alta y el reenvio comparten el limite estricto del login: son la otra
// puerta de entrada y no conviene dejarlas abiertas a fuerza bruta.
router.post('/registro', loginRateLimit, validate(registroSchema), authController.registro);
router.post('/verificar', loginRateLimit, validate(verificarSchema), authController.verificar);
router.post(
  '/reenviar-verificacion',
  loginRateLimit,
  validate(reenviarVerificacionSchema),
  authController.reenviarVerificacion
);

router.post(
  '/login-participante',
  loginRateLimit,
  validate(loginParticipanteSchema),
  authController.loginParticipante
);

// Solo admin y juez tienen contrasena; los participantes entran con su fecha
// de nacimiento, asi que no pueden llegar a este endpoint.
router.post(
  '/change-password',
  authMiddleware,
  requireRoles('admin', 'juez'),
  validate(changePasswordSchema),
  authController.changePassword
);

router.get('/me', authMiddleware, authController.getMe);
router.post('/refresh', authMiddleware, authController.refresh);
router.post('/logout', authController.logout);

// Recuperación de contraseña: mismo rate-limit estricto que el login.
router.post('/reset-request', loginRateLimit, validate(resetRequestSchema), authController.solicitarReset);
router.post('/reset-confirm', loginRateLimit, validate(resetConfirmSchema), authController.confirmarReset);

export default router;
