import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import type { AlcanceEvento } from '../middleware/evento';
import { Competencia, EventoUsuario } from '../models';
import { log } from '../utils/logger';

/** Nunca se devuelve al cliente un mensaje que pueda contener SQL o internals. */
export function mensajeSeguro(error: any): string {
  const mensaje = String(error?.message ?? '');
  const filtrar =
    /sql|sequelize|select |insert |update |constraint|bigint|dup_entry|duplicate entry|unique constraint|foreign key|deadlock|lock wait timeout/i.test(
      mensaje,
    );
  return filtrar || !mensaje ? 'No se pudo completar la operacion' : mensaje;
}

/**
 * Extrae un ID numérico de los params de la request.
 * Si no es válido, envía 400 y retorna null.
 */
export function idDeRuta(req: AuthRequest, res: Response, param = 'id'): number | null {
  const valor = parseInt(req.params[param], 10);
  if (!Number.isInteger(valor) || valor <= 0) {
    res.status(400).json({ message: 'Identificador invalido' });
    return null;
  }
  return valor;
}

/**
 * Verifica que un registro pertenezca al alcance de eventos del usuario autenticado.
 * Previene vulnerabilidades BOLA/IDOR: un admin del Evento A no puede acceder
 * a recursos del Evento B.
 *
 * @param alcance - Alcance del usuario (del middleware resolverEvento)
 * @param eventoId - ID del evento al que pertenece el registro
 * @returns true si el usuario tiene acceso, false si no
 */
export function perteneceAlAlcance(
  alcance: AlcanceEvento | undefined,
  eventoId: number | null | undefined,
): boolean {
  if (!alcance) return false;
  // Superadmin: acceso a todo
  if (alcance.permitidas === null) return true;
  // Datos legacy sin evento: visibles para el staff (mismo criterio que
  // puedeEditar() en arranqueController). Sin esto, participantes creados
  // por CSV sin evento_id devuelven 403 al juez aunque tenga asignación.
  // Se audita el uso del bypass para poder acotarlo cuando no quede legacy.
  if (eventoId == null) {
    log.warn('[alcance] bypass legacy sin evento', { activa: alcance.activa ?? null });
    return true;
  }
  // Evento activo seleccionado: debe coincidir
  if (alcance.activa) return alcance.activa === eventoId;
  // Verificar si el evento está en la lista de permitidos
  return alcance.permitidas.includes(eventoId);
}

/**
 * Carga una competencia verificando BOLA/IDOR en un solo paso.
 *
 * Sustituye el bloque `findByPk + perteneceAlAlcance` copiado en cada
 * controlador. No responde por sí misma: devuelve el motivo para que cada
 * endpoint conserve sus mensajes y status exactos.
 */
export async function cargarCompetenciaConAcceso(
  req: AuthRequest,
  competenciaId: number,
): Promise<{ competencia: Competencia } | { error: 'no-encontrado' | 'sin-acceso' }> {
  const competencia = await Competencia.findByPk(competenciaId, {
    attributes: ['id', 'evento_id'],
  });
  if (!competencia) return { error: 'no-encontrado' };
  if (!perteneceAlAlcance(req.alcance, competencia.evento_id)) return { error: 'sin-acceso' };
  return { competencia };
}

/**
 * ¿Puede el admin autenticado gestionar (editar/borrar/resetear) a este usuario?
 *
 * Superadmin: siempre. Resto: el objetivo debe compartir al menos un evento
 * con el alcance del admin. Usuarios legacy sin membresía se consideran
 * gestionables (mismo criterio que datos sin evento).
 */
export async function puedeGestionarUsuario(req: AuthRequest, usuarioId: number): Promise<boolean> {
  if (req.alcance?.permitidas === null) return true; // superadmin
  const membresias = await EventoUsuario.findAll({
    where: { usuario_id: usuarioId },
    attributes: ['evento_id'],
  });
  // Legacy sin membresía: se admite pero se audita para acotarlo cuando
  // no queden usuarios sin evento.
  if (membresias.length === 0) {
    log.warn('[alcance] bypass legacy sin membresia', { usuarioId });
    return true;
  }
  const permitidas = req.alcance?.permitidas ?? [];
  return membresias.some((m) => permitidas.includes(m.evento_id));
}
