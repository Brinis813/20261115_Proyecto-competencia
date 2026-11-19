import { Op } from 'sequelize';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as resultService from '../services/resultService';
import { Resultado, Wod, Participante, Asignacion, Arranque } from '../models';
import { perteneceAlAlcance, cargarCompetenciaConAcceso, mensajeSeguro } from './helpers';
import { log } from '../utils/logger';

/** Un juez solo puede consultar las competencias a las que esta asignado (en cualquier WOD). */
async function juezAsignadoACompetencia(req: AuthRequest, competenciaId: number): Promise<boolean> {
  if (req.user!.rol !== 'juez') return true;
  const asignacion = await Asignacion.findOne({
    where: { competencia_id: competenciaId, usuario_id: req.user!.id },
  });
  return asignacion !== null;
}

/**
 * Un juez solo puede registrar un WOD concreto si esta asignado a el
 * (wod_id = ese WOD) o a la competencia completa (wod_id NULL).
 */
async function juezAsignadoAlWod(
  req: AuthRequest,
  competenciaId: number,
  wodId: number,
): Promise<boolean> {
  if (req.user!.rol !== 'juez') return true;
  const asignacion = await Asignacion.findOne({
    where: {
      competencia_id: competenciaId,
      usuario_id: req.user!.id,
      [Op.or]: [{ wod_id: wodId }, { wod_id: null }],
    },
  });
  return asignacion !== null;
}

export async function saveResult(req: AuthRequest, res: Response) {
  try {
    const {
      participante_id,
      wod_id,
      valor_bruto,
      abandono,
      capado,
      disqualificado,
      detalle,
      desempate,
      es_desempate,
    } = req.body;

    // Batch 1: Queries independientes en paralelo (reduce round-trips a MySQL de 4 a 2)
    const [wod, participante, existente] = await Promise.all([
      Wod.findByPk(wod_id),
      Participante.findByPk(participante_id),
      Resultado.findOne({ where: { participante_id, wod_id } }),
    ]);

    if (!wod) {
      res.status(404).json({ message: 'WOD no encontrado' });
      return;
    }
    if (!participante) {
      res.status(404).json({ message: 'Participante no encontrado' });
      return;
    }
    if (existente) {
      res.status(409).json({
        message: 'El participante ya tiene un resultado registrado en este WOD',
      });
      return;
    }

    // BOLA/IDOR: Verificar que el WOD pertenece al alcance del usuario
    const acceso = await cargarCompetenciaConAcceso(req, wod.competencia_id);
    if ('error' in acceso) {
      return res.status(403).json({ message: 'No tienes acceso a esta competencia' });
    }

    if (!(await juezAsignadoAlWod(req, wod.competencia_id, wod.id))) {
      res.status(403).json({ message: 'No estas asignado a este WOD' });
      return;
    }

    // Pausa global del admin: mientras el heat está en pausa o finalizado no
    // se registra nada (ni online ni por sincronización offline). El juez
    // conserva lo contado en pantalla y lo envía al reanudar.
    const arranque = await Arranque.findOne({
      where: { competencia_id: wod.competencia_id },
      order: [['id', 'DESC']],
      attributes: ['estado'],
    });
    if (arranque?.estado === 'pausado') {
      res.status(409).json({ message: 'Heat en pausa: espera a que el administrador lo reanude' });
      return;
    }
    if (arranque?.estado === 'finalizado') {
      res.status(409).json({ message: 'Heat finalizado por el administrador' });
      return;
    }

    const resultado = await resultService.saveResult({
      participante_id,
      wod_id,
      juez_id: req.user!.id,
      valor_bruto,
      abandono,
      capado,
      disqualificado,
      detalle,
      desempate,
      es_desempate: es_desempate || false,
      // Splits en la misma tx que el resultado (nada de segunda tx).
      splits: detalle?.splits && detalle.splits.length > 0 ? detalle.splits : undefined,
    });

    res.status(201).json({ message: 'Resultado guardado', resultado });
  } catch (error: any) {
    // ER_DUP_ENTRY = race condition between check and insert (UNIQUE on participante_id + wod_id)
    if (error.name === 'SequelizeUniqueConstraintError' || /ER_DUP_ENTRY/i.test(error.message)) {
      res
        .status(409)
        .json({ message: 'El participante ya tiene un resultado registrado en este WOD' });
      return;
    }
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function checkParticipant(req: AuthRequest, res: Response) {
  try {
    const { participante_id, wod_id } = req.body;

    const wod = await Wod.findByPk(wod_id, { attributes: ['competencia_id'] });
    if (!wod) return res.status(404).json({ message: 'WOD no encontrado' });

    const accesoCheck = await cargarCompetenciaConAcceso(req, wod.competencia_id);
    if ('error' in accesoCheck) {
      return res.status(403).json({ message: 'No tienes acceso a este WOD' });
    }

    const existente = await Resultado.findOne({
      where: { participante_id, wod_id },
      include: [{ model: Participante, attributes: ['nombre', 'apellidos', 'cedula'] }],
    });

    if (!existente) {
      res.json({ exists: false, message: '' });
      return;
    }

    const participante = existente.get('Participante') as Pick<
      Participante,
      'nombre' | 'apellidos' | 'cedula'
    > | null;
    res.json({
      exists: true,
      message:
        `${participante?.nombre ?? 'El participante'} ${participante?.apellidos ?? ''} ya tiene un resultado registrado en este WOD`.trim(),
    });
  } catch (error: any) {
    log.error('checkParticipant error:', error?.message);
    res.status(500).json({ message: 'Error al verificar el participante' });
  }
}

export async function getSplits(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const resultadoId = Number(id);

    const resultado = await Resultado.findByPk(resultadoId, { attributes: ['wod_id'] });
    if (!resultado) return res.status(404).json({ message: 'Resultado no encontrado' });

    if (resultado.wod_id == null)
      return res.status(404).json({ message: 'Resultado sin WOD asociado' });

    const wod = await Wod.findByPk(resultado.wod_id, { attributes: ['competencia_id'] });
    if (!wod) return res.status(404).json({ message: 'WOD no encontrado' });

    const accesoSplits = await cargarCompetenciaConAcceso(req, wod.competencia_id);
    if ('error' in accesoSplits) {
      return res.status(403).json({ message: 'No tienes acceso a este resultado' });
    }

    const splits = await resultService.getSplits(resultadoId);
    res.json(splits);
  } catch (error: any) {
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function resetResult(req: AuthRequest, res: Response) {
  try {
    const { participante_id, wod_id } = req.body;

    const wod = await Wod.findByPk(wod_id, { attributes: ['competencia_id'] });
    if (!wod) return res.status(404).json({ message: 'WOD no encontrado' });

    const accesoReset = await cargarCompetenciaConAcceso(req, wod.competencia_id);
    if ('error' in accesoReset) {
      return res.status(403).json({ message: 'No tienes acceso a este WOD' });
    }

    await resultService.resetResult(participante_id, wod_id);
    res.json({ message: 'Medicion reseteada correctamente' });
  } catch (error: any) {
    const noEncontrado = mensajeSeguro(error).includes('No se encontro');
    res.status(noEncontrado ? 404 : 400).json({ message: mensajeSeguro(error) });
  }
}

export async function getResultsByParticipant(req: AuthRequest, res: Response) {
  try {
    const participantId = parseInt(req.params.participantId, 10);
    if (Number.isNaN(participantId)) {
      res.status(400).json({ message: 'Identificador invalido' });
      return;
    }

    // Un participante solo puede consultar sus propios resultados.
    if (req.user!.rol === 'participante' && req.user!.id !== participantId) {
      res.status(403).json({ message: 'Solo puedes consultar tus propios resultados' });
      return;
    }

    // BOLA/IDOR: el staff solo ve atletas de sus eventos. Si el atleta no
    // existe se sigue (el servicio devuelve []), para no enumerar usuarios.
    if (req.user!.rol !== 'participante') {
      const participante = await Participante.findByPk(participantId, {
        attributes: ['evento_id'],
      });
      if (participante && !perteneceAlAlcance(req.alcance, participante.evento_id)) {
        res.status(403).json({ message: 'No tienes acceso a este participante' });
        return;
      }
    }

    res.json(await resultService.getResultsByParticipant(participantId));
  } catch (error: any) {
    log.error('getResultsByParticipant error:', error?.message);
    res.status(500).json({ message: 'Error al obtener los resultados' });
  }
}

export async function getResultsByCompetencia(req: AuthRequest, res: Response) {
  try {
    const competenciaId = parseInt(req.params.competenciaId, 10);
    if (Number.isNaN(competenciaId)) {
      res.status(400).json({ message: 'Identificador invalido' });
      return;
    }

    // BOLA/IDOR: Verificar que la competencia pertenece al alcance del usuario
    const acceso = await cargarCompetenciaConAcceso(req, competenciaId);
    if ('error' in acceso) {
      return res.status(403).json({ message: 'No tienes acceso a esta competencia' });
    }

    if (!(await juezAsignadoACompetencia(req, competenciaId))) {
      res.status(403).json({ message: 'No estas asignado a esta competencia' });
      return;
    }

    const resultados = await resultService.getResultsByCompetencia(competenciaId);

    const wods = await Wod.findAll({
      where: { competencia_id: competenciaId },
      attributes: [
        'id',
        'orden',
        'nombre_ejercicio',
        'tipo_medicion',
        'unidad_distancia',
        'imagen_url',
        'tiempo_cap',
        'esquema',
        'puntaje_maximo',
      ],
      order: [['orden', 'ASC']],
    });

    interface FilaResultado {
      id: number;
      participante_id: number;
      wod_id: number | null;
      valor_bruto: string;
      puntos_calculados: number;
      abandono: boolean;
      capado: boolean;
      timestamp_servidor: Date;
      Participante?: {
        nombre: string;
        apellidos: string;
        cedula: string;
        categoria: string | null;
      } | null;
    }

    const participantes = (resultados as unknown as FilaResultado[]).map((r) => ({
      resultado_id: r.id,
      participante_id: r.participante_id,
      wod_id: r.wod_id,
      nombre: r.Participante?.nombre || '',
      apellidos: r.Participante?.apellidos || '',
      cedula: r.Participante?.cedula || '',
      categoria: r.Participante?.categoria ?? null,
      valor_bruto: r.valor_bruto,
      puntos_calculados: r.puntos_calculados,
      abandono: r.abandono,
      capado: r.capado,
      timestamp_servidor: r.timestamp_servidor,
    }));

    res.json({ wods, participantes });
  } catch (error: any) {
    log.error('getResultsByCompetencia error:', error?.message);
    res.status(500).json({ message: 'Error al obtener los resultados' });
  }
}
