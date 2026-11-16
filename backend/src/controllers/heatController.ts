import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as heatService from '../services/heatService';
import { mensajeSeguro } from './helpers';
import { log } from '../utils/logger';

function categoriaQuery(req: AuthRequest): number | null {
  const id = Number(req.query.categoria_id ?? req.body?.categoria_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function vistaHeats(req: AuthRequest, res: Response) {
  const categoriaId = categoriaQuery(req);
  if (!categoriaId) return res.status(400).json({ message: 'Indica la categoría (categoria_id)' });
  const competenciaId = Number(req.query.competencia_id);
  try {
    res.json(
      await heatService.obtenerHeats(
        categoriaId,
        Number.isInteger(competenciaId) && competenciaId > 0 ? competenciaId : null,
        req.alcance,
      ),
    );
  } catch (error: any) {
    log.error('vistaHeats error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function generarHeats(req: AuthRequest, res: Response) {
  const { categoria_id, capacidad_maxima, modo } = req.body ?? {};
  if (!Number.isInteger(categoria_id) || categoria_id <= 0) {
    return res.status(400).json({ message: 'Indica la categoría (categoria_id)' });
  }
  try {
    res
      .status(201)
      .json(await heatService.generarHeats(categoria_id, capacidad_maxima, modo, req.alcance));
  } catch (error: any) {
    log.error('generarHeats error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function crearHeat(req: AuthRequest, res: Response) {
  const { categoria_id, capacidad_maxima } = req.body ?? {};
  if (!Number.isInteger(categoria_id) || categoria_id <= 0) {
    return res.status(400).json({ message: 'Indica la categoría (categoria_id)' });
  }
  try {
    res
      .status(201)
      .json(await heatService.crearHeatVacio(categoria_id, capacidad_maxima, req.alcance));
  } catch (error: any) {
    log.error('crearHeat error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function moverAtleta(req: AuthRequest, res: Response) {
  const { participante_id, heat_id, carril_numero } = req.body ?? {};
  if (!Number.isInteger(participante_id) || !Number.isInteger(heat_id)) {
    return res.status(400).json({ message: 'Indica participante_id y heat_id' });
  }
  try {
    res.json(
      await heatService.moverAtleta(participante_id, heat_id, carril_numero ?? null, req.alcance),
    );
  } catch (error: any) {
    log.error('moverAtleta error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function quitarAtleta(req: AuthRequest, res: Response) {
  const participanteId = Number(req.params.participanteId);
  const { categoria_id } = req.body ?? {};
  if (!Number.isInteger(participanteId) || !Number.isInteger(categoria_id)) {
    return res.status(400).json({ message: 'Identificadores inválidos' });
  }
  try {
    res.json(await heatService.quitarAtleta(participanteId, categoria_id, req.alcance));
  } catch (error: any) {
    log.error('quitarAtleta error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function eliminarHeat(req: AuthRequest, res: Response) {
  const heatId = Number(req.params.heatId);
  if (!Number.isInteger(heatId) || heatId <= 0) {
    return res.status(400).json({ message: 'Identificador inválido' });
  }
  try {
    res.json(await heatService.eliminarHeat(heatId, req.alcance));
  } catch (error: any) {
    log.error('eliminarHeat error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function limpiarCategoria(req: AuthRequest, res: Response) {
  const categoriaId = Number(req.params.categoriaId);
  if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
    return res.status(400).json({ message: 'Identificador inválido' });
  }
  try {
    res.json(await heatService.limpiarCategoria(categoriaId, req.alcance));
  } catch (error: any) {
    log.error('limpiarCategoria error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function horarioAuto(req: AuthRequest, res: Response) {
  const { categoria_id, competencia_id, hora_heat_1, transicion_min } = req.body ?? {};
  if (!Number.isInteger(categoria_id) || !Number.isInteger(competencia_id)) {
    return res.status(400).json({ message: 'Indica categoria_id y competencia_id' });
  }
  try {
    res.json(
      await heatService.programarHorarioAuto(
        categoria_id,
        competencia_id,
        hora_heat_1,
        transicion_min,
        req.alcance,
      ),
    );
  } catch (error: any) {
    log.error('horarioAuto error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function horarioManual(req: AuthRequest, res: Response) {
  const { categoria_id, competencia_id, horarios } = req.body ?? {};
  if (!Number.isInteger(categoria_id) || !Number.isInteger(competencia_id)) {
    return res.status(400).json({ message: 'Indica categoria_id y competencia_id' });
  }
  try {
    res.json(
      await heatService.programarHorarioManual(categoria_id, competencia_id, horarios, req.alcance),
    );
  } catch (error: any) {
    log.error('horarioManual error:', error?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}
