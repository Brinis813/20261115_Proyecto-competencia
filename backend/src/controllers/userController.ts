import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as userService from '../services/userService';
import { eventoDestino, filtroEvento } from '../middleware/evento';
import { mensajeSeguro, idDeRuta, perteneceAlAlcance, puedeGestionarUsuario } from './helpers';
import { Participante } from '../models';
import { log } from '../utils/logger';

export async function createJuez(req: AuthRequest, res: Response) {
  try {
    const { nombre, apellidos, cedula, box } = req.body;
    const result = await userService.createJuez({
      nombre,
      apellidos,
      cedula,
      box,
      evento_id: eventoDestino(req.alcance),
    });
    res.status(201).json({
      message: 'Juez creado. Entrega la contrasena temporal; se le pedira cambiarla al ingresar.',
      usuario: result.usuario,
      tempPassword: result.tempPassword,
    });
  } catch (error: any) {
    log.error('createJuez error:', error?.message, error?.original?.message || error?.parent?.message);
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function createParticipante(req: AuthRequest, res: Response) {
  try {
    const participante = await userService.createParticipante({ ...req.body, evento_id: eventoDestino(req.alcance) });
    res.status(201).json({ message: 'Participante creado', participante });
  } catch (error: any) {
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

/** Administradores de box. Solo el superadmin llega aqui. */
export async function getAdmins(req: AuthRequest, res: Response) {
  try {
    const box = Number(req.query.box);
    res.json(await userService.getAllAdmins(Number.isInteger(box) ? box : null));
  } catch {
    log.error('getAdmins error');
    res.status(500).json({ message: 'Error al obtener los administradores' });
  }
}

export async function createAdmin(req: AuthRequest, res: Response) {
  try {
    const result = await userService.createAdmin(req.body);
    res.status(201).json({
      message: 'Administrador creado',
      usuario: result.usuario,
      // Se muestra una sola vez: no se vuelve a poder consultar.
      tempPassword: result.tempPassword,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getJueces(req: AuthRequest, res: Response) {
  try {
    res.json(await userService.getAllJueces(filtroEvento(req.alcance)));
  } catch {
    log.error('getJueces error');
    res.status(500).json({ message: 'Error al obtener los jueces' });
  }
}

export async function getParticipantes(req: AuthRequest, res: Response) {
  try {
    res.json(await userService.getAllParticipantes(filtroEvento(req.alcance)));
  } catch {
    log.error('getParticipantes error');
    res.status(500).json({ message: 'Error al obtener los participantes' });
  }
}

export async function updateUsuario(req: AuthRequest, res: Response) {
  const id = idDeRuta(req, res);
  if (id === null) return;

  try {
    // BOLA/IDOR: solo se gestionan usuarios de los eventos del admin.
    if (!(await puedeGestionarUsuario(req, id))) {
      return res.status(403).json({ message: 'No tienes acceso a este usuario' });
    }
    const usuario = await userService.updateUsuario(id, req.body);
    res.json({ message: 'Usuario actualizado', usuario });
  } catch (error: any) {
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function updateParticipante(req: AuthRequest, res: Response) {
  const id = idDeRuta(req, res);
  if (id === null) return;

  try {
    const participante = await Participante.findByPk(id, { attributes: ['evento_id'] });
    if (!participante) return res.status(404).json({ message: 'Participante no encontrado' });

    if (!perteneceAlAlcance(req.alcance, participante.evento_id)) {
      return res.status(403).json({ message: 'No tienes acceso a este participante' });
    }

    const updated = await userService.updateParticipante(id, req.body);
    res.json({ message: 'Participante actualizado', participante: updated });
  } catch (error: any) {
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

/** Genera contraseña temporal nueva para un juez (el admin la entrega en mano). */
export async function resetPasswordJuez(req: AuthRequest, res: Response) {
  const id = idDeRuta(req, res);
  if (id === null) return;

  try {
    if (!(await puedeGestionarUsuario(req, id))) {
      return res.status(403).json({ message: 'No tienes acceso a este usuario' });
    }
    const result = await userService.resetPasswordJuez(id);
    res.json({
      message: 'Contraseña reseteada. Entrégala al juez; se le pedirá cambiarla al ingresar.',
      nombre: result.nombre,
      cedula: result.cedula,
      tempPassword: result.tempPassword,
    });
  } catch (error: any) {
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function deleteUsuario(req: AuthRequest, res: Response) {
  const id = idDeRuta(req, res);
  if (id === null) return;

  try {
    if (!(await puedeGestionarUsuario(req, id))) {
      return res.status(403).json({ message: 'No tienes acceso a este usuario' });
    }
    await userService.deleteUsuario(id);
    res.json({ message: 'Usuario eliminado' });
  } catch (error: any) {
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function deleteParticipante(req: AuthRequest, res: Response) {
  const id = idDeRuta(req, res);
  if (id === null) return;

  try {
    const participante = await Participante.findByPk(id, { attributes: ['evento_id'] });
    if (!participante) return res.status(404).json({ message: 'Participante no encontrado' });

    if (!perteneceAlAlcance(req.alcance, participante.evento_id)) {
      return res.status(403).json({ message: 'No tienes acceso a este participante' });
    }

    await userService.deleteParticipante(id);
    res.json({ message: 'Participante eliminado' });
  } catch (error: any) {
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}

export async function bulkUpload(req: AuthRequest, res: Response) {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'No se envió ningún archivo CSV' });
      return;
    }

    const contenido = req.file.buffer.toString('utf-8');
    const filas = userService.parseCSV(contenido);

    if (filas.length === 0) {
      res.status(400).json({ message: 'El archivo CSV está vacío' });
      return;
    }

    const resultado = await userService.bulkCreate(filas, eventoDestino(req.alcance) ?? undefined);
    res.json(resultado);
  } catch (error: any) {
    res.status(400).json({ message: mensajeSeguro(error) });
  }
}
