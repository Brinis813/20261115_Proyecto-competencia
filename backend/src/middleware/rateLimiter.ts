import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const MAX_STORE_ENTRIES = 100_000;
const stores: Map<string, Map<string, RateLimitEntry>> = new Map();

function getStore(namespace: string): Map<string, RateLimitEntry> {
  if (!stores.has(namespace)) {
    const store = new Map<string, RateLimitEntry>();
    stores.set(namespace, store);

    // M8: Interval con cleanup automático y límite de entradas.
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store.entries()) {
        if (now > entry.resetTime) store.delete(key);
      }
      // Si el store queda vacío, eliminar el interval para no filtrar memoria.
      if (store.size === 0) {
        clearInterval(interval);
        stores.delete(namespace);
      }
    }, 60 * 1000);
    interval.unref?.();
  }
  return stores.get(namespace)!;
}

export function rateLimiter(maxRequests: number = 200, windowMs: number = 60 * 1000, namespace: string = 'global') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const store = getStore(namespace);
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = store.get(ip);

    if (entry && now < entry.resetTime) {
      if (entry.count >= maxRequests) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        res.setHeader('Retry-After', retryAfter);
        res.status(429).json({ message: 'Demasiadas peticiones. Intenta de nuevo mas tarde.' });
        return;
      }
      entry.count++;
    } else {
      // M8: Limitar tamaño del store para prevenir memory leak.
      if (store.size >= MAX_STORE_ENTRIES) {
        store.clear();
      }
      store.set(ip, { count: 1, resetTime: now + windowMs });
    }

    next();
  };
}

export function strictRateLimiter(maxRequests: number = 20, windowMs: number = 60 * 1000) {
  return rateLimiter(maxRequests, windowMs, 'login');
}

// Granular rate limiters for sensitive endpoints

export function authRateLimiter() {
  return rateLimiter(5, 15 * 60 * 1000, 'auth');
}

export function adminWriteRateLimiter() {
  return rateLimiter(30, 60 * 1000, 'admin-write');
}

export function judgeSaveRateLimiter() {
  return rateLimiter(60, 60 * 1000, 'judge-save');
}

export function publicLeaderboardRateLimiter() {
  return rateLimiter(120, 60 * 1000, 'public-leaderboard');
}

/**
 * Límite por rol (área 4: gasto y abuso).
 * El rol sale del JWT ya verificado: requiere authMiddleware antes.
 * IPs sin rol caen al cubo más restrictivo.
 */
export function rateLimitByRole(
  limites: Partial<Record<'admin' | 'juez' | 'participante' | 'anonimo', number>> = {},
  windowMs: number = 60 * 1000,
  namespace = 'por-rol'
) {
  const porDefecto = { admin: 300, juez: 180, participante: 120, anonimo: 60 };
  const final = { ...porDefecto, ...limites };
  return (req: Request, res: Response, next: NextFunction): void => {
    const store = getStore(namespace);
    const rol = (req as unknown as { user?: { rol?: string } }).user?.rol ?? 'anonimo';
    const clave = `${rol}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const max = final[rol as keyof typeof final] ?? final.anonimo;
    const now = Date.now();
    const entry = store.get(clave);

    if (entry && now < entry.resetTime) {
      if (entry.count >= max) {
        res.setHeader('Retry-After', Math.ceil((entry.resetTime - now) / 1000));
        res.status(429).json({ message: 'Demasiadas peticiones. Intenta de nuevo mas tarde.' });
        return;
      }
      entry.count++;
    } else {
      store.set(clave, { count: 1, resetTime: now + windowMs });
    }
    next();
  };
}

// M9: Throttle simple para sockets con cleanup periódico.
const ventanasSocket = new Map<string, { count: number; resetTime: number }>();

// Limpiar entradas expiradas cada 30 segundos.
const socketCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ventanasSocket.entries()) {
    if (now > entry.resetTime) ventanasSocket.delete(key);
  }
}, 30_000);
socketCleanup.unref?.();

/** Devuelve true si el evento puede procesarse, false si debe descartarse. */
export function throttleSocket(socketId: string, evento: string, max = 30, windowMs: number = 10 * 1000): boolean {
  const clave = `${socketId}:${evento}`;
  const now = Date.now();
  const entry = ventanasSocket.get(clave);
  if (entry && now < entry.resetTime) {
    if (entry.count >= max) return false;
    entry.count++;
    return true;
  }
  ventanasSocket.set(clave, { count: 1, resetTime: now + windowMs });
  return true;
}
