import { Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { AuthRequest } from '../middleware/auth';
import { Participante, Competencia, Asignacion } from '../models';
import * as resultService from '../services/resultService';
import * as scoringEngine from '../services/scoringEngine';
import { perteneceAlAlcance } from './helpers';
import { log } from '../utils/logger';
import { aFechaISO } from '../utils/date';

/** ¿Tiene el juez alguna asignacion en una competencia de este evento? */
async function juezAsignadoEnEvento(juezId: number, eventoId: number | null): Promise<boolean> {
  if (eventoId == null) return false;
  const asignacion = await Asignacion.findOne({
    attributes: ['id'],
    where: { usuario_id: juezId },
    include: [{ model: Competencia, as: 'Competencia', attributes: [], where: { evento_id: eventoId } }],
  });
  return asignacion !== null;
}

/**
 * Resultados historicos de un atleta.
 *
 * Reglas de acceso:
 *  - admin: cualquier participante, sin verificar la fecha de nacimiento.
 *  - participante: solo su propia ficha.
 *  - juez: cualquier participante, verificando la fecha de nacimiento.
 */
export async function getParticipantResults(req: AuthRequest, res: Response) {
  try {
    const { cedula, fecha_nacimiento } = req.body;

    const participante = await Participante.findOne({ where: { cedula } });
    if (!participante) {
      return res.status(404).json({ message: 'Participante no encontrado' });
    }

    if (req.user!.rol === 'participante') {
      if (req.user!.id !== participante.id) {
        return res.status(403).json({ message: 'Solo puedes consultar tus propios resultados' });
      }
    } else if (req.user!.rol !== 'admin') {
      // Ambos lados normalizados: el cliente puede mandar AAAA/MM/DD.
      // Comparacion en tiempo constante (mismo criterio que loginParticipante).
      const esperado = aFechaISO(participante.fecha_nacimiento);
      const recibido = aFechaISO(fecha_nacimiento ?? '');
      const bufEsperado = Buffer.from(esperado);
      const bufRecibido = Buffer.from(recibido);
      const coincide =
        bufEsperado.length === bufRecibido.length && timingSafeEqual(bufEsperado, bufRecibido);
      if (!coincide) {
        return res.status(401).json({ message: 'Credenciales incorrectas' });
      }
    }

    // BOLA/IDOR: el staff solo consulta atletas de sus eventos. Al juez sin
    // membresia (legacy/CSV) se le admite si tiene asignacion en ese evento.
    if (req.user!.rol !== 'participante' && !perteneceAlAlcance(req.alcance, participante.evento_id)) {
      if (req.user!.rol !== 'juez' || !(await juezAsignadoEnEvento(req.user!.id, participante.evento_id))) {
        return res.status(403).json({ message: 'No tienes acceso a este participante' });
      }
    }

    const [resultados, posiciones] = await Promise.all([
      resultService.getResultsByParticipant(participante.id),
      scoringEngine.getParticipantPosition(participante.id),
    ]);

    type FilaConWod = Awaited<ReturnType<typeof resultService.getResultsByParticipant>>[number] & {
      Wod?: { competencia_id?: number } | null;
    };
    const filas = resultados as FilaConWod[];
    const competenciaIds = [...new Set(filas.map((r) => r.Wod?.competencia_id).filter(Boolean))];
    const competencias = competenciaIds.length
      ? await Competencia.findAll({ where: { id: competenciaIds }, attributes: ['id', 'nombre'] })
      : [];
    const nombrePorCompetencia = new Map(competencias.map((w) => [w.id, w.nombre]));

    const resultsByCompetencia: Record<number, { competencia_nombre: string; resultados: any[] }> = {};
    for (const resultado of filas) {
      const wod = resultado.get('Wod') as { competencia_id?: number } | null;
      const competenciaId = wod?.competencia_id;
      if (!competenciaId) continue;

      if (!resultsByCompetencia[competenciaId]) {
        resultsByCompetencia[competenciaId] = { competencia_nombre: nombrePorCompetencia.get(competenciaId) || '', resultados: [] };
      }
      resultsByCompetencia[competenciaId].resultados.push(resultado);
    }

    res.json({
      participant: {
        id: participante.id,
        nombre: participante.nombre,
        apellidos: participante.apellidos,
        cedula: participante.cedula,
        box: participante.box,
        categoria: participante.categoria,
      },
      resultsByCompetencia,
      positions: posiciones,
    });
  } catch (error: any) {
    log.error('No se pudieron obtener los resultados del participante', error);
    res.status(500).json({ message: 'Error al obtener los resultados' });
  }
}

/** Busqueda por cedula que usa el juez antes de medir. Solo para el staff. */
export async function lookupParticipant(req: AuthRequest, res: Response) {
  try {
    const { cedula } = req.body;
    const participante = await Participante.findOne({ where: { cedula } });

    if (!participante) {
      return res.status(404).json({ message: 'Participante no encontrado' });
    }

    if (!perteneceAlAlcance(req.alcance, participante.evento_id)) {
      // Fallback por asignación explícita: un juez asignado a ese atleta
      // puede verlo aunque su membresía de evento no cubra el evento del
      // participante (jueces creados por CSV sin EventoUsuario, o evento
      // distinto por error de carga). Sin asignación se mantiene el 403.
      if (req.user?.rol === 'juez') {
        const asignado = await Asignacion.findOne({
          where: { usuario_id: req.user.id, participante_id: participante.id },
        });
        if (!asignado) {
          return res.status(403).json({ message: 'No tienes acceso a este participante' });
        }
      } else {
        return res.status(403).json({ message: 'No tienes acceso a este participante' });
      }
    }

    res.json({
      id: participante.id,
      nombre: participante.nombre,
      apellidos: participante.apellidos,
      cedula: participante.cedula,
      box: participante.box,
      categoria: participante.categoria,
    });
  } catch {
    log.error('lookupParticipant error');
    res.status(500).json({ message: 'Error al buscar el participante' });
  }
}
