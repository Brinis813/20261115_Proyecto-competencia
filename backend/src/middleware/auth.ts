import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { AlcanceEvento } from './evento';

export type Rol = 'admin' | 'juez' | 'participante';

export interface TokenPayload {
  id: number;
  cedula: string;
  rol: Rol;
  /**
   * Tabla a la que pertenece `id`. Es imprescindible porque `usuarios` y
   * `participantes` tienen secuencias de id independientes: sin esto un
   * participante con id=3 seria indistinguible del juez con id=3.
   */
  tipo: 'usuario' | 'participante';
  /**
   * Origen de la sesión (epoch ms) para la vida absoluta del refresh.
   * Ausente en tokens antiguos: se estampa al primer refresh (grandfathering).
   */
  origenMs?: number;
}

export interface AuthRequest extends Request {
  user?: TokenPayload;
  alcance?: AlcanceEvento;
}

/** Extrae los tokens candidatos de la cookie y de la cabecera Authorization. */
function extraerTokens(req: Request): string[] {
  const candidatos: string[] = [];

  if (req.cookies?.token) candidatos.push(req.cookies.token);

  const cabecera = req.headers.authorization;
  if (cabecera?.startsWith('Bearer ')) candidatos.push(cabecera.substring(7));

  return candidatos;
}

/** Verifica un token y devuelve su payload, o null si no es valido. */
export function verificarToken(token: string): TokenPayload | null {
  try {
    const raw = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    // M5: Retornar objeto nuevo en vez de mutar el payload decodificado.
    // Tokens emitidos antes de que existiera `tipo`: se infiere del rol.
    const tipo = raw.tipo ?? (raw.rol === 'participante' ? 'participante' : 'usuario');
    return { ...raw, tipo };
  } catch {
    return null;
  }
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const candidatos = extraerTokens(req);

  if (candidatos.length === 0) {
    res.status(401).json({ message: 'No autenticado' });
    return;
  }

  for (const token of candidatos) {
    const payload = verificarToken(token);
    if (payload) {
      req.user = payload;
      next();
      return;
    }
  }

  res.status(401).json({ message: 'Sesion expirada o token invalido' });
}

/** Autenticacion opcional: rellena req.user si hay token valido, nunca falla. */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  for (const token of extraerTokens(req)) {
    const payload = verificarToken(token);
    if (payload) {
      req.user = payload;
      break;
    }
  }
  next();
}

/** Restringe el acceso a los roles indicados. Debe ir despues de authMiddleware. */
export function requireRoles(...roles: Rol[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'No autenticado' });
      return;
    }
    if (!roles.includes(req.user.rol)) {
      res.status(403).json({ message: 'No tienes permisos para esta accion' });
      return;
    }
    next();
  };
}

export const adminOnly = requireRoles('admin');
export const staffOnly = requireRoles('admin', 'juez');
