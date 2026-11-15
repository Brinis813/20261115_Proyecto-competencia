import { Router } from 'express';
import { optionalAuth } from '../middleware/auth';
import { resolverEvento } from '../middleware/evento';
import { publicLeaderboardRateLimiter } from '../middleware/rateLimiter';
import * as leaderboardController from '../controllers/leaderboardController';

const router = Router();

/**
 * La clasificacion es informacion publica: es lo que se proyecta en la
 * pantalla del evento. Se mantienen las dos rutas por compatibilidad con
 * clientes ya desplegados; ambas usan autenticacion opcional.
 * resolverEvento fija req.alcance para los autenticados; los anónimos
 * entran como público (el controlador omite el chequeo BOLA sin usuario).
 */
router.get('/public/:competenciaId', publicLeaderboardRateLimiter(), optionalAuth, resolverEvento, leaderboardController.getLeaderboard);
router.get('/evento/:eventoId', publicLeaderboardRateLimiter(), optionalAuth, resolverEvento, leaderboardController.getEventoLeaderboard);
router.get('/:competenciaId', publicLeaderboardRateLimiter(), optionalAuth, resolverEvento, leaderboardController.getLeaderboard);

export default router;
