import type { NextFunction, Request, Response } from 'express';
import { env, isProduction } from '../config/env';
import { log } from './logger';

/**
 * Monitoreo de errores (Sentry opcional, sin dependencia dura).
 *
 * - Si `SENTRY_DSN` está definido E instalada `@sentry/node`
 *   (`npm i @sentry/node`), los errores se envían a Sentry con contexto.
 * - Si no, funciona en modo degradado: log JSON estructurado, sin romper nada.
 *
 * Nada de este módulo lanza: un fallo de monitoreo nunca puede tumbar la API.
 */

type SentryLike = {
  captureException: (err: unknown, ctx?: Record<string, unknown>) => void;
};

let sentry: SentryLike | null = null;
let inicializado = false;

export function initMonitoring(): void {
  if (inicializado) return;
  inicializado = true;
  if (!env.SENTRY_DSN) {
    if (!isProduction) log.debug('monitoreo: sin SENTRY_DSN, solo log local');
    return;
  }
  try {
    // require dinámico a propósito: @sentry/node es opcional.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/node') as {
      init: (o: Record<string, unknown>) => void;
      captureException: (e: unknown, ctx?: Record<string, unknown>) => void;
    };
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: 0.1,
    });
    sentry = { captureException: (e, ctx) => Sentry.captureException(e, ctx) };
    log.info('monitoreo: Sentry activo');
  } catch {
    log.warn('monitoreo: SENTRY_DSN definido pero @sentry/node no instalado; solo log local');
  }
}

export interface ErrorContext {
  endpoint?: string;
  competitionId?: number | null;
  userId?: number | null;
  rol?: string | null;
  workoutId?: number | null;
  stack?: string;
}

/** Extrae contexto útil de la petición para acompañar al error. */
export function contextoDeRequest(req: Partial<Request> & { user?: { id?: number; rol?: string } }): ErrorContext {
  const q = (req.query ?? {}) as Record<string, unknown>;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const competitionId =
    Number(req.headers?.['x-evento-id']) ||
    Number(q.evento) ||
    Number(b.evento_id) ||
    null;
  const workoutId = Number((req.params as Record<string, unknown> | undefined)?.competenciaId) || Number(b.competencia_id) || null;
  return {
    endpoint: `${req.method ?? ''} ${(req as Request).originalUrl ?? (req as Request).url ?? ''}`.trim(),
    competitionId: Number.isFinite(competitionId) && (competitionId as number) > 0 ? (competitionId as number) : null,
    userId: req.user?.id ?? null,
    rol: req.user?.rol ?? null,
    workoutId: Number.isFinite(workoutId) && (workoutId as number) > 0 ? (workoutId as number) : null,
    stack: undefined,
  };
}

/** Reporta un error a Sentry (si existe) y siempre al log estructurado. */
export function reportError(err: unknown, ctx: ErrorContext = {}): void {
  const mensaje = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  try {
    sentry?.captureException(err, { ...ctx });
  } catch {
    // Nunca fallar por el monitoreo.
  }
  log.error(
    JSON.stringify({
      evento: 'error',
      mensaje,
      ...ctx,
      stack: isProduction ? undefined : stack,
      ts: new Date().toISOString(),
    })
  );
}

/** Middleware: adjunta el contexto a la request para el errorHandler. */
export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  (req as unknown as Record<string, unknown>).__ctx = contextoDeRequest(req as never);
  next();
}

// ── Watchdog de Socket.IO ──────────────────────────────────────────────
// Detecta si el canal en vivo deja de emitir (el leaderboard "congelado").

let lastBroadcastAt = 0;
let lastBroadcastKind = 'ninguno';
let emittedTotal = 0;

/** Llamar en cada broadcast (leaderboard-update / resultado). */
export function noteBroadcast(kind = 'leaderboard-update'): void {
  lastBroadcastAt = Date.now();
  lastBroadcastKind = kind;
  emittedTotal += 1;
}

const UMBRAL_ALERTA_MS = Number(process.env.SOCKET_STALE_ALERT_MS) || 15 * 60 * 1000;

export function socketHealth(roomCount: number): {
  rooms: number;
  emittedTotal: number;
  lastBroadcastKind: string;
  lastBroadcastHaceMs: number | null;
  stale: boolean;
} {
  const hace = lastBroadcastAt ? Date.now() - lastBroadcastAt : null;
  const stale = hace !== null && hace > UMBRAL_ALERTA_MS;
  if (stale) {
    log.warn(
      JSON.stringify({
        evento: 'socket-stale',
        mensaje: `sin broadcasts desde hace ${Math.round((hace as number) / 1000)}s`,
        rooms: roomCount,
        ts: new Date().toISOString(),
      })
    );
    try {
      sentry?.captureException(new Error('socket-stale: sin broadcasts'), { rooms: roomCount });
    } catch {
      // noop
    }
  }
  return { rooms: roomCount, emittedTotal, lastBroadcastKind, lastBroadcastHaceMs: hace, stale };
}
