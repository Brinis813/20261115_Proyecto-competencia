import { Response, CookieOptions } from 'express';
import { AuthRequest } from '../middleware/auth';
import { env, isProduction } from '../config/env';
import * as authService from '../services/authService';
import { log } from '../utils/logger';

const COOKIE_NAME = 'token';

/** maxAge derivado de JWT_EXPIRES_IN (antes fijo 24h: sesion zombie tras caducar el JWT). */
function msDeExpiracion(): number {
  const valor = env.JWT_EXPIRES_IN.trim();
  const numero = parseInt(valor, 10);
  if (Number.isNaN(numero) || numero <= 0) return 4 * 3600 * 1000;
  if (valor.endsWith('d')) return numero * 86_400_000;
  if (valor.endsWith('h')) return numero * 3_600_000;
  if (valor.endsWith('m')) return numero * 60_000;
  return numero * 1000;
}

/**
 * En produccion la app se sirve tras HTTPS (Dokploy/Traefik), asi que la
 * cookie va Secure. SameSite=lax basta porque frontend y backend comparten
 * origen a traves del proxy de nginx.
 */
// H2: SameSite=strict para prevenir CSRF. En producción con HTTPS esto bloquea
// envíos cross-origin. El frontend y backend comparten origen vía proxy nginx.
function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: msDeExpiracion(),
  };
}

export async function login(req: AuthRequest, res: Response) {
  try {
    const { cedula, password } = req.body;
    const result = await authService.loginUsuario(cedula, password);

    res.cookie(COOKIE_NAME, result.token, cookieOptions());
    res.json({
      user: result.user,
      needsPasswordChange: result.needsPasswordChange,
    });
  } catch (error: any) {
    res.status(401).json({ message: error.message });
  }
}

/**
 * Alta publica. Responde 201 aunque el correo no se haya podido enviar: la
 * cuenta ya existe y el enlace queda en el log del servidor, asi que el alta
 * no se pierde por un fallo de SMTP.
 */
export async function registro(req: AuthRequest, res: Response) {
  try {
    if (!env.REGISTRO_ABIERTO) {
      return res.status(403).json({ message: 'El alta de cuentas esta cerrada en esta instalacion' });
    }

    const { email, correoEnviado } = await authService.registrarUsuario(req.body);
    res.status(201).json({
      message: correoEnviado
        ? `Te enviamos un correo a ${email}. Abre el enlace para activar tu cuenta.`
        : `Cuenta creada para ${email}. El envio de correo no esta configurado: pide el enlace al administrador.`,
      email,
      correoEnviado,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

/** Confirma el correo y devuelve la sesion ya iniciada. */
export async function verificar(req: AuthRequest, res: Response) {
  try {
    const result = await authService.verificarCorreo(req.body.token);

    res.cookie(COOKIE_NAME, result.token, cookieOptions());
    res.json({ user: result.user, evento: result.evento });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

/** Reenvia el enlace. Siempre responde igual, exista o no la cuenta. */
export async function reenviarVerificacion(req: AuthRequest, res: Response) {
  try {
    await authService.reenviarVerificacion(req.body.email);
  } catch (error: any) {
    log.debug('reenviarVerificacion:', error?.message);
  }
  res.json({
    message: 'Si esa direccion tiene una cuenta sin confirmar, le enviamos un enlace nuevo.',
  });
}

export async function loginParticipante(req: AuthRequest, res: Response) {
  try {
    const { cedula, fecha_nacimiento } = req.body;
    const result = await authService.loginParticipante(cedula, fecha_nacimiento);

    res.cookie(COOKIE_NAME, result.token, cookieOptions());
    res.json({ user: result.user });
  } catch (error: any) {
    res.status(401).json({ message: error.message });
  }
}

export async function changePassword(req: AuthRequest, res: Response) {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(req.user!.id, currentPassword, newPassword);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  try {
    // El perfil se lee de la base de datos, no del token: asi el nombre, el box
    // y el rol siempre reflejan el estado actual del usuario.
    const perfil = await authService.getPerfil(req.user!);

    if (!perfil) {
      res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
      res.status(401).json({ message: 'La cuenta ya no existe' });
      return;
    }

    res.json({ user: perfil });
  } catch (error: any) {
    log.error('getMe error:', error?.message);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
    res.status(401).json({ message: 'Sesion invalida' });
  }
}

/** Extiende la vida del token: el cliente lo llama periodicamente para mantener la sesion. */
export async function refresh(req: AuthRequest, res: Response) {
  try {
    const result = await authService.refreshToken(req.user!);
    res.cookie(COOKIE_NAME, result.token, cookieOptions());
    res.json({ ok: true });
  } catch (error: any) {
    res.status(401).json({ message: error.message });
  }
}

export async function logout(_req: AuthRequest, res: Response) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ message: 'Sesion cerrada' });
}

/** Pide el enlace de reset. Responde igual exista o no la cuenta. */
export async function solicitarReset(req: AuthRequest, res: Response) {
  try {
    await authService.solicitarResetPassword(String(req.body?.email ?? ''));
    res.json({ message: 'Si esa dirección tiene cuenta, le enviamos un enlace nuevo.' });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

/** Canjea el token de reset por una contraseña nueva (un solo uso). */
export async function confirmarReset(req: AuthRequest, res: Response) {
  try {
    const result = await authService.restablecerPassword(
      String(req.body?.token ?? ''),
      String(req.body?.newPassword ?? '')
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}
