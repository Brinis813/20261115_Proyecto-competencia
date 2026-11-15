import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as scoringEngine from '../services/scoringEngine';
import { Competencia } from '../models';
import { perteneceAlAlcance } from './helpers';
import { log } from '../utils/logger';

export async function getLeaderboard(req: AuthRequest, res: Response) {
  const competenciaId = parseInt(req.params.competenciaId, 10);
  if (Number.isNaN(competenciaId) || competenciaId <= 0) {
    res.status(400).json({ message: 'Identificador de Competencia invalido' });
    return;
  }

  try {
    const competencia = await Competencia.findByPk(competenciaId, { attributes: ['evento_id'] });
    if (!competencia) {
      return res.status(404).json({ message: 'Competencia no encontrada' });
    }
    // La clasificación es pública: sin usuario autenticado no hay alcance que
    // verificar. Con usuario, se aplica el chequeo BOLA/IDOR habitual.
    if (req.user && !perteneceAlAlcance(req.alcance, competencia.evento_id)) {
      return res.status(403).json({ message: 'No tienes acceso a esta competencia' });
    }
    res.json(await scoringEngine.getLeaderboard(competenciaId));
  } catch (error) {
    log.error('No se pudo construir la clasificacion', error);
    res.status(500).json({ message: 'Error al obtener la clasificacion' });
  }
}

/** Clasificación global de un evento según su scoringType. Pública. */
export async function getEventoLeaderboard(req: AuthRequest, res: Response) {
  const eventoId = parseInt(req.params.eventoId, 10);
  if (Number.isNaN(eventoId) || eventoId <= 0) {
    res.status(400).json({ message: 'Identificador de evento invalido' });
    return;
  }

  if (req.user && !perteneceAlAlcance(req.alcance, eventoId)) {
    return res.status(403).json({ message: 'No tienes acceso a este evento' });
  }

  try {
    const categoria = typeof req.query.categoria === 'string' ? req.query.categoria : null;
    res.json(await scoringEngine.getEventoLeaderboard(eventoId, categoria));
  } catch (error: any) {
    log.error('No se pudo construir la clasificacion global', error);
    res.status(error?.message === 'Evento no encontrada' ? 404 : 500).json({
      message: error?.message ?? 'Error al obtener la clasificacion global',
    });
  }
}
