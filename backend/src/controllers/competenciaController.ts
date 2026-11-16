import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as competenciaService from '../services/competenciaService';
import { eventoDestino, filtroEvento } from '../middleware/evento';
import { idDeRuta, perteneceAlAlcance, cargarCompetenciaConAcceso, mensajeSeguro } from './helpers';
import { Competencia, Asignacion } from '../models';
import { log } from '../utils/logger';

export async function createCompetencia(req: AuthRequest, res: Response) {
  try {
    // El evento sale de la sesion, nunca del cuerpo: si no, cualquiera
    // podria crear una competencia dentro del evento de otro.
    const competencia = await competenciaService.createCompetencia({
      ...req.body,
      evento_id: eventoDestino(req.alcance),
    });
    res.status(201).json({ message: 'Competencia creado', competencia });
  } catch (error: any) {
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function getCompetencias(req: AuthRequest, res: Response) {
  try {
    res.json(await competenciaService.getAllCompetencias(filtroEvento(req.alcance)));
  } catch {
    log.error('getCompetencias error');
    res.status(500).json({ message: 'Error al obtener las competencias' });
  }
}

/** Listado sin autenticacion para la pantalla publica del leaderboard. */
export async function getPublicCompetencias(req: AuthRequest, res: Response) {
  try {
    // `?evento=` acota la portada publica a un evento concreta.
    const evento = Number(req.query.evento);
    res.json(
      await competenciaService.getPublicCompetencias(Number.isInteger(evento) ? evento : null),
    );
  } catch (error) {
    log.error('[GET /api/competencias/public]', error);
    res.status(500).json({ message: 'Error al obtener las competencias' });
  }
}

export async function getCompetencia(req: AuthRequest, res: Response) {
  const id = idDeRuta(req, res);
  if (id === null) return;

  try {
    const competencia = await competenciaService.getCompetenciaById(id);
    if (!competencia) return res.status(404).json({ message: 'Competencia no encontrado' });

    // BOLA/IDOR: Verificar que la competencia pertenece al alcance del usuario
    if (!perteneceAlAlcance(req.alcance, competencia.evento_id as number | null)) {
      return res.status(403).json({ message: 'No tienes acceso a esta competencia' });
    }

    res.json(competencia);
  } catch {
    log.error('getCompetencia error');
    res.status(500).json({ message: 'Error al obtener la competencia' });
  }
}

export async function updateCompetencia(req: AuthRequest, res: Response) {
  const id = idDeRuta(req, res);
  if (id === null) return;

  try {
    // BOLA/IDOR: Verificar que la competencia pertenece al alcance del usuario
    const acceso = await cargarCompetenciaConAcceso(req, id);
    if ('error' in acceso) {
      return acceso.error === 'no-encontrado'
        ? res.status(404).json({ message: 'Competencia no encontrado' })
        : res.status(403).json({ message: 'No tienes acceso a esta competencia' });
    }

    const competencia = await competenciaService.updateCompetencia(id, req.body);
    res.json({ message: 'Competencia actualizado', competencia });
  } catch (error: any) {
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function deleteCompetencia(req: AuthRequest, res: Response) {
  const id = idDeRuta(req, res);
  if (id === null) return;

  try {
    // BOLA/IDOR: Verificar que la competencia pertenece al alcance del usuario
    const acceso = await cargarCompetenciaConAcceso(req, id);
    if ('error' in acceso) {
      return acceso.error === 'no-encontrado'
        ? res.status(404).json({ message: 'Competencia no encontrado' })
        : res.status(403).json({ message: 'No tienes acceso a esta competencia' });
    }

    await competenciaService.deleteCompetencia(id);
    res.json({ message: 'Competencia eliminado' });
  } catch (error: any) {
    res.status(404).json({ message: mensajeSeguro(error) });
  }
}

export async function assignCompetencia(req: AuthRequest, res: Response) {
  try {
    const competenciaId = req.body.competencia_id;
    if (!competenciaId) {
      return res.status(400).json({ message: 'competencia_id es requerido' });
    }

    const competencia = await Competencia.findByPk(competenciaId, { attributes: ['evento_id'] });
    if (!competencia || !perteneceAlAlcance(req.alcance, competencia.evento_id)) {
      return res.status(403).json({ message: 'No tienes acceso a esta competencia' });
    }

    res.json(await competenciaService.assignCompetencia(req.body));
  } catch (error: any) {
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function removeAssignment(req: AuthRequest, res: Response) {
  const asignacionId = idDeRuta(req, res, 'asignacionId');
  if (asignacionId === null) return;

  try {
    const asignacion = await Asignacion.findByPk(asignacionId, { attributes: ['competencia_id'] });
    if (!asignacion) return res.status(404).json({ message: 'Asignacion no encontrada' });

    const competencia = await Competencia.findByPk(asignacion.competencia_id, {
      attributes: ['evento_id'],
    });
    if (!competencia || !perteneceAlAlcance(req.alcance, competencia.evento_id)) {
      return res.status(403).json({ message: 'No tienes acceso a esta competencia' });
    }

    await competenciaService.removeAssignment(asignacionId);
    res.json({ message: 'Asignacion eliminada' });
  } catch (error: any) {
    res.status(404).json({ message: mensajeSeguro(error) });
  }
}

export async function getCompetenciaAssignments(req: AuthRequest, res: Response) {
  const id = idDeRuta(req, res);
  if (id === null) return;

  try {
    // BOLA/IDOR: Verificar que la competencia pertenece al alcance del usuario
    const acceso = await cargarCompetenciaConAcceso(req, id);
    if ('error' in acceso) {
      return acceso.error === 'no-encontrado'
        ? res.status(404).json({ message: 'Competencia no encontrado' })
        : res.status(403).json({ message: 'No tienes acceso a esta competencia' });
    }

    res.json(await competenciaService.getCompetenciaAssignments(id));
  } catch {
    log.error('getCompetenciaAssignments error');
    res.status(500).json({ message: 'Error al obtener las asignaciones' });
  }
}

/** Competencias a los que esta asignado el juez autenticado. */
export async function getJudgeCompetencias(req: AuthRequest, res: Response) {
  try {
    // Un administrador ve todos las competencias para poder suplir a un juez.
    const competencias =
      req.user!.rol === 'admin'
        ? await competenciaService.getAllCompetencias(filtroEvento(req.alcance))
        : await competenciaService.getCompetenciasByJudge(req.user!.id);
    res.json(competencias);
  } catch {
    log.error('getJudgeCompetencias error');
    res.status(500).json({ message: 'Error al obtener las competencias' });
  }
}
