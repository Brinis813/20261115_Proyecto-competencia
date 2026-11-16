import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { Usuario, Participante } from '../models';
import { env } from '../config/env';
import type { TokenPayload } from '../middleware/auth';
import { crearEventoDeEjemplo } from './eventoService';
import { correoDeVerificacion, correoDeRecuperacion, enviarCorreo } from './mailService';
import { boxParaAlta } from './boxService';
import { aFechaISO } from '../utils/date';

/**
 * Convierte JWT_EXPIRES_IN ('24h', '7d', '3600') a segundos.
 * M4: Simplificado para cubrir los casos comunes sin dependencia externa.
 */
function segundosDeExpiracion(): number {
  const valor = env.JWT_EXPIRES_IN.trim();
  const numero = parseInt(valor, 10);
  if (Number.isNaN(numero)) return 86400;
  if (valor.endsWith('h')) return numero * 3600;
  if (valor.endsWith('d')) return numero * 86400;
  if (valor.endsWith('m')) return numero * 60;
  return numero;
}

function firmarToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, origenMs: payload.origenMs ?? Date.now() }, env.JWT_SECRET, {
    expiresIn: segundosDeExpiracion(),
  });
}

/**
 * Vida absoluta de la sesión: aunque el refresh renueve la expiración, una
 * sesión no vive más de 7 días desde su origen (evita sesiones prorrogables
 * indefinidamente). Los tokens antiguos sin `origenMs` se estampan al primer
 * refresh y viven 7 días desde entonces (grandfathering, sin cierres
 * sorpresivos).
 */
export const SESION_MAX_MS = 7 * 24 * 3600 * 1000;

/** M4: DTO compartido para el perfil de usuario — evita duplicar la construcción. */
function toProfileDTO(usuario: {
  id: number;
  nombre: string;
  apellidos: string;
  cedula: string;
  box: string;
  rol: string;
  email?: string | null;
  es_superadmin?: boolean | null;
  box_id?: number | null;
  password_cambiado: boolean;
}) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    apellidos: usuario.apellidos,
    cedula: usuario.cedula,
    box: usuario.box,
    rol: usuario.rol,
    email: usuario.email ?? null,
    es_superadmin: !!usuario.es_superadmin,
    box_id: usuario.box_id ?? null,
    password_cambiado: usuario.password_cambiado,
  };
}

export async function loginUsuario(cedula: string, password: string) {
  const usuario = await Usuario.findOne({ where: { cedula } });

  // Se compara siempre contra un hash para que el tiempo de respuesta no
  // revele si la cedula existe o no.
  const hash =
    usuario?.password ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
  const passwordValida = await bcrypt.compare(password, hash);

  if (!usuario || !passwordValida) {
    throw new Error('Cedula o contrasena incorrectos');
  }

  // Las cuentas creadas desde el alta publica no entran hasta confirmar el
  // correo. Las que crea un administrador nacen ya verificadas.
  if (usuario.email_verificado === false) {
    throw new Error('Confirma tu correo antes de entrar. Revisa tu bandeja de entrada.');
  }

  return {
    token: firmarToken({
      id: usuario.id,
      cedula: usuario.cedula,
      rol: usuario.rol,
      tipo: 'usuario',
    }),
    user: toProfileDTO(usuario),
    needsPasswordChange: !usuario.password_cambiado,
  };
}

/* ------------------------------------------------------------------ */
/* Alta publica con verificacion por correo                            */
/* ------------------------------------------------------------------ */

/** Horas que dura el enlace de verificacion. */
const HORAS_VERIFICACION = 24;

/** Del token en claro solo se guarda el hash: si se filtra la base, no sirve. */
function hashDeToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function enlaceDeVerificacion(token: string): string {
  return `${env.APP_URL.replace(/\/$/, '')}/verificar?token=${token}`;
}

async function emitirVerificacion(usuario: Usuario): Promise<{ enviado: boolean }> {
  const token = crypto.randomBytes(32).toString('hex');
  await usuario.update({
    verificacion_token: hashDeToken(token),
    verificacion_expira: new Date(Date.now() + HORAS_VERIFICACION * 3600 * 1000),
  });

  return enviarCorreo(
    correoDeVerificacion(usuario.email!, usuario.nombre, enlaceDeVerificacion(token)),
  );
}

export interface DatosRegistro {
  nombre: string;
  apellidos: string;
  cedula: string;
  box: string;
  email: string;
  password: string;
}

/**
 * Crea una cuenta de administrador pendiente de verificar.
 *
 * No crea evento todavia: la de ejemplo se crea al confirmar el correo,
 * asi una direccion inventada no deja datos huerfanos en la base.
 */
export async function registrarUsuario(datos: DatosRegistro) {
  const email = datos.email.trim().toLowerCase();

  const repetido = await Usuario.findOne({
    where: { [Op.or]: [{ cedula: datos.cedula }, { email }] },
  });
  if (repetido) {
    throw new Error('Ya existe una cuenta con esa cedula o ese correo');
  }

  // Quien se da de alta se convierte en administrador de su propio box. Si ya
  // existe uno con ese nombre se reutiliza, para no acabar con duplicados que
  // en realidad son el mismo gimnasio.
  const box = await boxParaAlta(datos.box);

  const usuario = await Usuario.create({
    nombre: datos.nombre,
    apellidos: datos.apellidos,
    cedula: datos.cedula,
    box: box.nombre,
    box_id: box.id,
    email,
    rol: 'admin',
    password: await bcrypt.hash(datos.password, 12),
    // La contrasena la elige quien se da de alta, asi que no hay que cambiarla.
    password_cambiado: true,
    email_verificado: false,
  });

  const { enviado } = await emitirVerificacion(usuario);
  return { email, correoEnviado: enviado };
}

/**
 * Confirma el correo y deja al usuario listo para trabajar: le crea su
 * evento de ejemplo y devuelve la sesion, para que entre directo sin
 * tener que volver a escribir la contrasena.
 */
export async function verificarCorreo(token: string) {
  const usuario = await Usuario.findOne({
    where: {
      verificacion_token: hashDeToken(token),
      verificacion_expira: { [Op.gt]: new Date() },
    },
  });

  if (!usuario) {
    throw new Error(
      'El enlace no es valido o ya caduco. Pide uno nuevo desde la pantalla de acceso.',
    );
  }

  // Primero el evento y despues marcar el correo: si la creacion falla,
  // el token sigue sirviendo y el usuario puede reintentar desde el enlace.
  const evento = await crearEventoDeEjemplo(usuario);

  await usuario.update({
    email_verificado: true,
    verificacion_token: null,
    verificacion_expira: null,
  });

  return {
    token: firmarToken({
      id: usuario.id,
      cedula: usuario.cedula,
      rol: usuario.rol,
      tipo: 'usuario',
    }),
    user: { ...toProfileDTO(usuario), es_superadmin: false, password_cambiado: true },
    evento: { id: evento.id, nombre: evento.nombre },
  };
}

/**
 * Vuelve a mandar el enlace. Responde igual exista o no la cuenta, para no
 * convertir el formulario en un comprobador de correos registrados.
 */
export async function reenviarVerificacion(email: string) {
  const usuario = await Usuario.findOne({
    where: { email: email.trim().toLowerCase(), email_verificado: false },
  });
  if (usuario?.email) await emitirVerificacion(usuario);
}

export async function loginParticipante(cedula: string, fechaNacimiento: string) {
  const participante = await Participante.findOne({ where: { cedula } });

  // Las dos fechas se normalizan: el formulario pide AAAA/MM/DD y la columna
  // devuelve AAAA-MM-DD, asi que comparar en crudo rechaza al atleta siempre.
  // Comparacion en tiempo constante y MISMO trabajo exista o no la cedula:
  // si no, el tiempo de respuesta revelaria que cedulas estan registradas.
  // (No hay bcrypt aqui porque el atleta no tiene password: el factor es la
  // fecha de nacimiento, y un hash costoso por login solo quemaria CPU.)
  const esperado = participante ? aFechaISO(participante.fecha_nacimiento) : '0000-00-00';
  const recibido = aFechaISO(fechaNacimiento);
  const bufEsperado = Buffer.from(esperado);
  const bufRecibido = Buffer.from(recibido);
  const coincide =
    bufEsperado.length === bufRecibido.length && crypto.timingSafeEqual(bufEsperado, bufRecibido);

  if (!participante || !coincide) {
    throw new Error('Cedula o fecha de nacimiento incorrectos');
  }

  return {
    token: firmarToken({
      id: participante.id,
      cedula: participante.cedula,
      rol: 'participante',
      tipo: 'participante',
    }),
    user: {
      id: participante.id,
      nombre: participante.nombre,
      apellidos: participante.apellidos,
      cedula: participante.cedula,
      box: participante.box,
      rol: 'participante' as const,
      password_cambiado: true,
    },
  };
}

/** Perfil completo del sujeto del token; se usa en GET /auth/me. */
export async function getPerfil(payload: TokenPayload) {
  if (payload.tipo === 'participante') {
    const participante = await Participante.findByPk(payload.id);
    if (!participante) return null;
    return {
      id: participante.id,
      nombre: participante.nombre,
      apellidos: participante.apellidos,
      cedula: participante.cedula,
      box: participante.box,
      rol: 'participante' as const,
      password_cambiado: true,
    };
  }

  const usuario = await Usuario.findByPk(payload.id, { attributes: { exclude: ['password'] } });
  if (!usuario) return null;
  return toProfileDTO(usuario);
}

/** Emite un nuevo token con la misma info pero expiración fresca. */
export function refreshToken(payload: TokenPayload): { token: string } {
  const origen = payload.origenMs ?? Date.now();
  if (Date.now() - origen > SESION_MAX_MS) {
    throw new Error('Sesion caducada: vuelve a iniciar sesion');
  }
  return { token: firmarToken({ ...payload, origenMs: origen }) };
}

export async function changePassword(
  userId: number,
  currentPassword: string | undefined,
  newPassword: string,
) {
  const usuario = await Usuario.findByPk(userId);
  if (!usuario) {
    throw new Error('Usuario no encontrado');
  }

  // Si ya cambio la contrasena alguna vez, se exige la actual para cambiarla.
  if (usuario.password_cambiado) {
    if (!currentPassword) {
      throw new Error('Debes indicar tu contrasena actual');
    }
    const valida = await bcrypt.compare(currentPassword, usuario.password);
    if (!valida) {
      throw new Error('La contrasena actual no es correcta');
    }
  }

  const mismaQueAnterior = await bcrypt.compare(newPassword, usuario.password);
  if (mismaQueAnterior) {
    throw new Error('La nueva contrasena debe ser distinta a la actual');
  }

  await usuario.update({
    password: await bcrypt.hash(newPassword, 12),
    password_cambiado: true,
  });

  return { message: 'Contrasena actualizada correctamente' };
}

/* ------------------------------------------------------------------ */
/* Recuperación de contraseña (reset por correo)                        */
/* ------------------------------------------------------------------ */

/** El enlace dura 1 hora. Patrón idéntico al de verificación: hash + expira. */
const HORAS_RESET = 1;

function enlaceDeReset(token: string): string {
  return `${env.APP_URL.replace(/\/$/, '')}/recuperar?token=${token}`;
}

function esPasswordRobusta(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

/**
 * Genera el token de reset. Responde igual exista o no la cuenta, para no
 * convertir el formulario en un comprobador de correos registrados.
 */
export async function solicitarResetPassword(email: string): Promise<void> {
  const usuario = await Usuario.findOne({ where: { email: email.trim().toLowerCase() } });
  if (!usuario?.email) return;

  const token = crypto.randomBytes(32).toString('hex');
  await usuario.update({
    reset_token: hashDeToken(token),
    reset_expira: new Date(Date.now() + HORAS_RESET * 3600 * 1000),
  });

  await enviarCorreo(correoDeRecuperacion(usuario.email, usuario.nombre, enlaceDeReset(token)));
}

/** Canjea el token por una contraseña nueva. El token es de un solo uso. */
export async function restablecerPassword(
  token: string,
  newPassword: string,
): Promise<{ message: string }> {
  if (!esPasswordRobusta(newPassword)) {
    throw new Error(
      'La contraseña debe tener 8+ caracteres, mayúscula, minúscula, número y símbolo',
    );
  }
  const usuario = await Usuario.findOne({
    where: {
      reset_token: hashDeToken(token),
      reset_expira: { [Op.gt]: new Date() },
    },
  });
  if (!usuario) throw new Error('El enlace no es válido o ya caducó. Pide uno nuevo.');

  await usuario.update({
    password: await bcrypt.hash(newPassword, 12),
    password_cambiado: true,
    reset_token: null,
    reset_expira: null,
  });
  return { message: 'Contraseña actualizada. Ya puedes entrar.' };
}
