import { Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { Evento, EventoUsuario, Usuario } from '../models';
import type { AuthRequest } from './auth';

/**
 * A que eventos llega quien hace la peticion.
 *
 * `permitidas` en null significa "todas": es el superadmin. `activa` es en
 * cual esta trabajando ahora mismo, que solo importa al crear cosas.
 */
export interface AlcanceEvento {
  activa: number | null;
  permitidas: number[] | null;
}

/** Alcance vacio: no ve ningún evento. */
const SIN_ALCANCE: AlcanceEvento = { activa: null, permitidas: [] };

/**
 * Resuelve el alcance de la peticion.
 *
 * - Superadmin: todas.
 * - Administrador de box: todas las de su box. Un box tiene varias, asi que
 *   ademas hace falta saber en cual esta: llega en la cabecera
 *   `X-Evento-Id`, que **siempre** se valida contra el conjunto
 *   permitido. La cabecera es una preferencia del cliente, nunca un permiso.
 * - Juez: los eventos en las que se le asigno.
 *
 * Va siempre despues de `authMiddleware`.
 */
export async function resolverEvento(req: AuthRequest, _res: Response, next: NextFunction) {
  req.alcance = SIN_ALCANCE;

  if (req.user?.tipo !== 'usuario') return next();

  try {
    const usuario = await Usuario.findByPk(req.user.id, {
      attributes: ['id', 'rol', 'box_id', 'es_superadmin'],
    });
    if (!usuario) return next();

    const permitidas = usuario.es_superadmin ? null : await eventosDe(usuario);
    req.alcance = { activa: elegirActiva(req, permitidas), permitidas };
  } catch {
    // Si no se puede resolver, la peticion sigue sin alcance en vez de
    // reventar: los permisos de rol siguen aplicando por su cuenta.
  }

  next();
}

/** Eventos que puede tocar un usuario que no es superadmin. */
async function eventosDe(usuario: Usuario): Promise<number[]> {
  // Un administrador manda sobre todo su box, tenga o no membresia explicita
  // en cada evento.
  if (usuario.rol === 'admin' && usuario.box_id) {
    const delBox = await Evento.findAll({
      where: { box_id: usuario.box_id },
      attributes: ['id'],
    });
    return delBox.map((c) => c.id);
  }

  const membresias = await EventoUsuario.findAll({
    where: { usuario_id: usuario.id },
    attributes: ['evento_id'],
  });
  return membresias.map((m) => m.evento_id);
}

/**
 * Evento activa: la que pide el cliente si la tiene permitida; si no, la
 * unica que tenga; si tiene varias y no ha elegido, ninguna.
 */
function elegirActiva(req: AuthRequest, permitidas: number[] | null): number | null {
  const pedida = Number(req.header('X-Evento-Id'));

  if (Number.isInteger(pedida) && pedida > 0) {
    if (permitidas === null || permitidas.includes(pedida)) return pedida;
  }

  if (permitidas && permitidas.length === 1) return permitidas[0];
  return null;
}

/**
 * Filtro `where` por evento, listo para mezclar en cualquier consulta.
 *
 * Priorizal evento activa; si no hay ninguna elegida, se limita al
 * conjunto permitido. Devuelve `{}` para el superadmin, que no se acota.
 */
export function filtroEvento(alcance?: AlcanceEvento): Record<string, any> {
  if (!alcance) return {};
  if (alcance.activa) return { evento_id: alcance.activa };
  if (alcance.permitidas === null) return {};
  return { evento_id: { [Op.in]: alcance.permitidas } };
}

/**
 * Evento en la que se crea algo nuevo. Lanza si no hay ninguna elegida,
 * porque crear una competencia o un atleta "en ninguna parte" no tiene sentido.
 */
export function eventoDestino(alcance?: AlcanceEvento): number | null {
  if (alcance?.activa) return alcance.activa;
  if (alcance?.permitidas === null) return null; // superadmin sin acotar
  throw new Error('Elige primero en que evento quieres trabajar');
}
