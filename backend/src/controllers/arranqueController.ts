import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Competencia, Asignacion } from '../models';
import * as arranqueService from '../services/arranqueService';
import { broadcastCompetenciaStart } from '../sockets/handlers';
import { mensajeSeguro } from './helpers';
import { log } from '../utils/logger';

/**
 * El admin debe administrar ESE evento (mismo criterio que la portada):
 * superadmin o admin cuyo box incluyal evento de la competencia.
 */
function puedeEditar(req: AuthRequest, eventoId: number | null): boolean {
  if (eventoId == null) return true; // Competencia legacy sin evento
  if (!req.alcance) return false;
  if (req.alcance.permitidas === null) return true; // superadmin
  return req.alcance.permitidas.includes(eventoId);
}

/** Arma la competencia (cualquiera de los 4 modos) y lo difunde a la sala de la competencia. */
export async function armarCompetencia(req: AuthRequest, res: Response) {
  const competenciaId = Number(req.params.id);
  if (!Number.isInteger(competenciaId) || competenciaId <= 0) {
    return res.status(400).json({ message: 'Identificador invalido' });
  }
  try {
    // Dentro del try: en Express 4 un await rechazado fuera del try cuelga
    // la peticion y genera unhandledRejection si MySQL cae a mitad.
    const competencia = await Competencia.findByPk(competenciaId);
    if (!competencia) return res.status(404).json({ message: 'Competencia no encontrado' });
    if (!puedeEditar(req, competencia.evento_id)) {
      return res.status(403).json({ message: 'No administras este evento' });
    }

    const snap = await arranqueService.programarArranque(competenciaId, req.body, req.user!.id);
    // El controlador emite; el servicio no toca sockets (igual que resultados).
    await broadcastCompetenciaStart(competenciaId);
    res.status(201).json(snap);
  } catch (error: any) {
    log.error('[arranque] armarCompetencia error:', error?.message, error?.parent);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

/**
 * Lectura del arranque vigente. La pantalla pública también lo ve (la cuenta
 * atrás se proyecta), pero un juez solo lee Competencias donde tiene asignación.
 */
export async function estadoArranque(req: AuthRequest, res: Response) {
  const competenciaId = Number(req.params.id);
  if (!Number.isInteger(competenciaId) || competenciaId <= 0) {
    return res.status(400).json({ message: 'Identificador invalido' });
  }

  try {
    const competencia = await Competencia.findByPk(competenciaId);
    if (!competencia) return res.status(404).json({ message: 'Competencia no encontrado' });

    if (req.user!.rol === 'juez') {
      // El juez asignado entra por asignación explícita, sin exigir
      // membresía de evento (cubre jueces CSV sin EventoUsuario).
      const asignado = await Asignacion.findOne({ where: { competencia_id: competenciaId, usuario_id: req.user!.id } });
      if (!asignado) return res.status(403).json({ message: 'No estás asignado a esta competencia' });
    } else if (!puedeEditar(req, competencia.evento_id)) {
      return res.status(403).json({ message: 'No administras este evento' });
    }

    const snapshot = await arranqueService.obtenerSnapshot(competenciaId);
    res.json(snapshot);
  } catch (error: any) {
    log.error('[arranque] estadoArranque error:', error?.message, error?.parent);
    res.status(500).json({ message: mensajeSeguro(error) });
  }
}

/** Cancela el arranque (los jueces salen del estado armado). */
export async function cancelarArranque(req: AuthRequest, res: Response) {
  const competenciaId = Number(req.params.id);
  if (!Number.isInteger(competenciaId) || competenciaId <= 0) {
    return res.status(400).json({ message: 'Identificador invalido' });
  }
  try {
    const competencia = await Competencia.findByPk(competenciaId);
    if (!competencia) return res.status(404).json({ message: 'Competencia no encontrado' });
    if (!puedeEditar(req, competencia.evento_id)) {
      return res.status(403).json({ message: 'No administras este evento' });
    }

    await arranqueService.cambiarEstado(competenciaId, 'cancelado');
    await broadcastCompetenciaStart(competenciaId);
    res.json({ message: 'Arranque cancelado' });
  } catch (error: any) {
    log.error('[arranque] cancelarArranque error:', error?.message, error?.parent);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

/** Finaliza el heat (detiene los cronómetros de los jueces). */
export async function finalizarArranque(req: AuthRequest, res: Response) {
  const competenciaId = Number(req.params.id);
  if (!Number.isInteger(competenciaId) || competenciaId <= 0) {
    return res.status(400).json({ message: 'Identificador invalido' });
  }
  try {
    const competencia = await Competencia.findByPk(competenciaId);
    if (!competencia) return res.status(404).json({ message: 'Competencia no encontrado' });
    if (!puedeEditar(req, competencia.evento_id)) {
      return res.status(403).json({ message: 'No administras este evento' });
    }

    await arranqueService.cambiarEstado(competenciaId, 'finalizado');
    await broadcastCompetenciaStart(competenciaId);
    res.json({ message: 'Heat finalizado' });
  } catch (error: any) {
    log.error('[arranque] finalizarArranque error:', error?.message, error?.parent);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

/** PAUSA GLOBAL: congela los cronómetros de todos los jueces en el segundo actual. */
export async function pausarArranque(req: AuthRequest, res: Response) {
  const competenciaId = Number(req.params.id);
  if (!Number.isInteger(competenciaId) || competenciaId <= 0) {
    return res.status(400).json({ message: 'Identificador invalido' });
  }
  try {
    const competencia = await Competencia.findByPk(competenciaId);
    if (!competencia) return res.status(404).json({ message: 'Competencia no encontrado' });
    if (!puedeEditar(req, competencia.evento_id)) {
      return res.status(403).json({ message: 'No administras este evento' });
    }

    const snap = await arranqueService.pausarArranque(competenciaId);
    await broadcastCompetenciaStart(competenciaId);
    res.json({ message: 'Heat en pausa', arranque: snap });
  } catch (error: any) {
    log.error('pausarArranque error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

/** Reanuda un heat pausado (recalcula el desfase para mantener la sincronía). */
export async function reanudarArranque(req: AuthRequest, res: Response) {
  const competenciaId = Number(req.params.id);
  if (!Number.isInteger(competenciaId) || competenciaId <= 0) {
    return res.status(400).json({ message: 'Identificador invalido' });
  }
  try {
    const competencia = await Competencia.findByPk(competenciaId);
    if (!competencia) return res.status(404).json({ message: 'Competencia no encontrado' });
    if (!puedeEditar(req, competencia.evento_id)) {
      return res.status(403).json({ message: 'No administras este evento' });
    }

    const snap = await arranqueService.reanudarArranque(competenciaId);
    await broadcastCompetenciaStart(competenciaId);
    res.json({ message: 'Heat reanudado', arranque: snap });
  } catch (error: any) {
    log.error('reanudarArranque error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}
