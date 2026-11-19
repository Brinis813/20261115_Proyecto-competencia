import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { verificarToken, type TokenPayload } from '../middleware/auth';
import { Resultado, Wod, Asignacion } from '../models';
import { Op } from 'sequelize';
import { getLeaderboard } from '../services/scoringEngine';
import { obtenerSnapshot } from '../services/arranqueService';
import { log } from '../utils/logger';
import { noteBroadcast } from '../utils/monitoring';
import { throttleSocket } from '../middleware/rateLimiter';

const joinCompetenciaSchema = z.number().int().positive();
const lockParticipantSchema = z.object({
  participante_id: z.number().int().positive(),
  wod_id: z.number().int().positive(),
  judgeName: z.string().max(60).optional(),
});
const checkLockSchema = z.object({
  participante_id: z.number().int().positive(),
  wod_id: z.number().int().positive(),
});
const unlockSchema = z.object({
  participante_id: z.number().int().positive(),
  wod_id: z.number().int().positive(),
});
const timeSyncSchema = z.object({ t1: z.number() });
const resyncSchema = z.object({ competenciaId: z.number().int().positive() });

/**
 * Canal en tiempo real.
 *
 * Hay dos clases de cliente:
 *  - Espectador anonimo: puede entrar a la sala de una competencia y recibir la
 *    clasificacion. Es lo que alimenta la pantalla publica del leaderboard.
 *  - Juez o administrador autenticado: ademas puede bloquear participantes
 *    para evitar que dos jueces midan al mismo atleta a la vez.
 */

type SocketConDatos = Socket & {
  data: { user?: TokenPayload };
};

interface Bloqueo {
  judgeId: number;
  judgeName: string;
  timestamp: number;
}

const bloqueos = new Map<string, Bloqueo>();
const TTL_BLOQUEO = 30 * 60 * 1000;

let ioRef: Server | null = null;

function claveBloqueo(participanteId: number, wodId: number): string {
  return `${participanteId}-${wodId}`;
}

// Limpieza periodica de bloqueos huerfanos (juez que cerro la app sin liberar).
const limpieza = setInterval(
  () => {
    const ahora = Date.now();
    for (const [clave, bloqueo] of bloqueos.entries()) {
      if (ahora - bloqueo.timestamp > TTL_BLOQUEO) bloqueos.delete(clave);
    }
  },
  5 * 60 * 1000,
);
limpieza.unref?.();

/**
 * ¿Puede este juez bloquear a este atleta en este WOD? Solo si esta
 * asignado al WOD o a la competencia completa. Sin esto, un juez del
 * Evento A podia bloquear (TTL 30 min) la medicion de un atleta del
 * Evento B. Los admins no necesitan asignacion.
 */
async function puedeBloquear(
  usuario: TokenPayload,
  participanteId: number,
  wodId: number,
): Promise<boolean> {
  if (usuario.rol !== 'juez') return true;
  try {
    const wod = await Wod.findByPk(wodId, { attributes: ['competencia_id'] });
    if (!wod) return false;
    const asignacion = await Asignacion.findOne({
      attributes: ['id'],
      where: {
        competencia_id: wod.competencia_id,
        usuario_id: usuario.id,
        participante_id: participanteId,
        [Op.or]: [{ wod_id: wodId }, { wod_id: null }],
      },
    });
    return asignacion !== null;
  } catch {
    return false;
  }
}

export function setupSocketHandlers(io: Server): void {
  ioRef = io;

  // El token es opcional: sin el, la conexion queda como espectador anonimo.
  // Se acepta por auth, query y cookie HttpOnly (el frontend conecta con
  // withCredentials y no envia token explicito: sin la cookie, el bloqueo
  // de jueces quedaba funcionalmente roto). Sin cambios de contrato.
  io.use((socket: SocketConDatos, next) => {
    const cookie = socket.handshake.headers.cookie ?? '';
    const deCookie = /(?:^|;\s*)token=([^;]*)/.exec(cookie)?.[1];
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.query?.token as string | undefined) ||
      (deCookie ? decodeURIComponent(deCookie) : undefined);

    if (token) {
      const payload = verificarToken(token);
      if (payload) socket.data.user = payload;
    }
    next();
  });

  io.on('connection', (socket: SocketConDatos) => {
    const usuario = socket.data.user;

    async function enviarLeaderboard(competenciaId: number) {
      if (!Number.isInteger(competenciaId) || competenciaId <= 0) return;
      try {
        const data = await getLeaderboard(competenciaId);
        socket.emit('leaderboard-update', { competenciaId, ...data });
      } catch (err) {
        log.error('socket: no se pudo construir la clasificacion', err);
        socket.emit('leaderboard-error', {
          competenciaId,
          message: 'No se pudo cargar la clasificacion',
        });
      }
    }

    socket.on('join-competencia', async (competenciaId: number) => {
      const parsed = joinCompetenciaSchema.safeParse(competenciaId);
      if (!parsed.success) return;
      // Anti-bucle/reconnect-storm: cada join dispara getLeaderboard (MySQL).
      if (!throttleSocket(socket.id, 'join-competencia', 10)) return;
      const validId = parsed.data;
      // Solo se pertenece a una sala a la vez: al cambiar de Competencia hay que salir
      // de la anterior o el cliente seguiria recibiendo actualizaciones viejas.
      for (const sala of socket.rooms) {
        if (sala !== socket.id && sala.startsWith('competencia-')) socket.leave(sala);
      }
      socket.join(`competencia-${validId}`);
      await enviarLeaderboard(validId);
      // Si la competencia tiene un arranque vigente, el juez lo recibe al instante
      // (también vale para quien reconecta a mitad del heat).
      try {
        const arranque = await obtenerSnapshot(Number(validId));
        if (arranque) socket.emit('competencia:start', arranque);
      } catch (err) {
        log.error('socket: no se pudo enviar el arranque vigente', err);
      }
    });

    socket.on('leave-competencia', (competenciaId: number) => {
      // Misma validacion que `join`: un id crudo permitia salir de salas ajenas.
      const parsed = joinCompetenciaSchema.safeParse(competenciaId);
      if (!parsed.success) return;
      socket.leave(`competencia-${parsed.data}`);
    });

    socket.on('request-leaderboard', (competenciaId: number) => {
      const parsed = joinCompetenciaSchema.safeParse(competenciaId);
      if (!parsed.success) return;
      // Throttle anti-bucle: un cliente no puede pedir el ranking más de 30
      // veces cada 10 s; el resto se descarta sin tocar MySQL.
      if (!throttleSocket(socket.id, 'request-leaderboard')) return;
      void enviarLeaderboard(parsed.data);
    });

    // --- Bloqueo de participantes: solo para jueces y administradores ---

    socket.on(
      'check-participant-lock',
      (data: { participante_id: number; wod_id: number }, callback: any) => {
        if (typeof callback !== 'function') return;
        const parsed = checkLockSchema.safeParse(data);
        if (!parsed.success) {
          callback({ locked: false, message: '' });
          return;
        }
        if (!usuario || usuario.rol === 'participante') {
          callback({ locked: false, message: '' });
          return;
        }

        const bloqueo = bloqueos.get(claveBloqueo(parsed.data.participante_id, parsed.data.wod_id));
        const bloqueadoPorOtro = bloqueo && bloqueo.judgeId !== usuario.id;

        callback({
          locked: Boolean(bloqueadoPorOtro),
          message: bloqueadoPorOtro
            ? `Lo esta evaluando ${bloqueo!.judgeName} en este momento`
            : '',
        });
      },
    );

    // Con ACK opcional: el juez lo usa tras reconectar para confirmar que el
    // bloqueo quedó registrado (antes era fire-and-forget y un paquete
    // perdido en la ventana de reconnect dejaba dos jueces sobre un atleta).
    // Sin callback se comporta igual que antes (compatibilidad total).
    socket.on(
      'lock-participant',
      async (
        data: { participante_id: number; wod_id: number; judgeName: string },
        callback?: (r: { ok: boolean }) => void,
      ) => {
        const responde = typeof callback === 'function' ? callback : null;
        if (!usuario || usuario.rol === 'participante') {
          responde?.({ ok: false });
          return;
        }
        // Anti-flapping: un cliente en bucle no puede saturar puedeBloquear (DB).
        if (!throttleSocket(socket.id, 'lock-participant', 10)) {
          responde?.({ ok: false });
          return;
        }
        const parsed = lockParticipantSchema.safeParse(data);
        if (!parsed.success) {
          responde?.({ ok: false });
          return;
        }
        // Solo quien tiene asignacion puede bloquear (ver puedeBloquear).
        if (!(await puedeBloquear(usuario, parsed.data.participante_id, parsed.data.wod_id))) {
          responde?.({ ok: false });
          return;
        }
        bloqueos.set(claveBloqueo(parsed.data.participante_id, parsed.data.wod_id), {
          judgeId: usuario.id,
          // El nombre visible sale del cliente solo como etiqueta; la identidad
          // que cuenta para los permisos es siempre la del token.
          judgeName: String(parsed.data.judgeName ?? 'Juez').slice(0, 60),
          timestamp: Date.now(),
        });
        responde?.({ ok: true });
      },
    );

    socket.on('unlock-participant', (data: { participante_id: number; wod_id: number }) => {
      if (!usuario) return;
      if (!throttleSocket(socket.id, 'unlock-participant', 10)) return;
      const parsed = unlockSchema.safeParse(data);
      if (!parsed.success) return;
      const clave = claveBloqueo(parsed.data.participante_id, parsed.data.wod_id);
      if (bloqueos.get(clave)?.judgeId === usuario.id) bloqueos.delete(clave);
    });

    // --- Arranque sincronizado: reloj común y re-sincronización ---

    // Mini-NTP: el juez mide su offset con varias muestras (ver store del
    // frontend). Throttle anti-bucle por conexión.
    socket.on('time:sync', (msg: { t1: number }, callback: any) => {
      if (typeof callback !== 'function') return;
      const parsed = timeSyncSchema.safeParse(msg);
      if (!parsed.success) return;
      if (!throttleSocket(socket.id, 'time-sync')) return;
      const t2 = Date.now();
      callback({ t1: parsed.data.t1, t2, t3: Date.now() });
    });

    // Re-sincronización bajo demanda (botón del juez o auto al reconectar):
    // responde el snapshot vigente con el reloj del servidor fresco.
    socket.on('competencia:resync', async (msg: { competenciaId: number }, callback: any) => {
      const parsed = resyncSchema.safeParse(msg);
      if (!parsed.success) return;
      const competenciaId = parsed.data.competenciaId;
      if (!throttleSocket(socket.id, 'competencia:resync', 10)) return;
      try {
        const arranque = await obtenerSnapshot(competenciaId);
        if (!arranque) return;
        if (typeof callback === 'function') callback(arranque);
        socket.emit('competencia:start', arranque);
      } catch (err) {
        log.error('socket: no se pudo re-sincronizar el arranque', err);
      }
    });

    socket.on('disconnect', () => {
      if (!usuario) return;
      for (const [clave, bloqueo] of bloqueos.entries()) {
        if (bloqueo.judgeId === usuario.id) bloqueos.delete(clave);
      }
    });
  });
}

/**
 * Recalcula la clasificacion de una competencia y la envia a todos los clientes
 * conectados a su sala. Es el unico camino por el que el leaderboard se
 * actualiza en vivo.
 *
 * Usa una firma ligera para evitar broadcasts redundantes: si el leaderboard
 * no cambió desde el último emit, se omite el envío (ahorra bandwidth y CPU).
 */
const lastEmitted = new Map<number, string>();
/** Tope anti-fuga: una entrada por competencia, con eviccion de la mas vieja. */
const MAX_SALAS_CACHE = 200;

function recordarFirma(competenciaId: number, firma: string): void {
  if (!lastEmitted.has(competenciaId) && lastEmitted.size >= MAX_SALAS_CACHE) {
    const masVieja = lastEmitted.keys().next();
    if (!masVieja.done) lastEmitted.delete(masVieja.value);
  }
  lastEmitted.set(competenciaId, firma);
}

export async function broadcastLeaderboard(
  competenciaId: number,
  resultado?: Resultado,
): Promise<void> {
  if (!ioRef) return;
  try {
    const data = await getLeaderboard(competenciaId);

    // Firma ligera para detectar cambios reales (puestos, puntos Y marcas).
    // Si el payload no trae `leaderboard` (forma inesperada), se emite igual
    // en vez de morir en silencio: en vivo es preferible un update de más.
    // Sin `valor_bruto`, una correccion que no mueve puntos (p. ej. mismo
    // puesto, mejor tiempo) nunca llegaba a las pantallas porque el dedup
    // la consideraba "sin cambios".
    const lista = Array.isArray((data as { leaderboard?: unknown }).leaderboard)
      ? (
          data as {
            leaderboard: Array<{
              participante_id: number;
              puesto: number;
              puntos_total: number;
              resultados?: Array<{ valor_bruto?: string | null }>;
            }>;
          }
        ).leaderboard
      : [];
    const firma = lista
      .map(
        (e) =>
          `${e.participante_id}:${e.puesto}:${e.puntos_total}:${(e.resultados ?? []).map((r) => r.valor_bruto ?? '').join(',')}`,
      )
      .join('|');

    const anterior = lastEmitted.get(competenciaId);
    if (anterior === firma) {
      // Sin cambios reales: no emitir (ahorra bandwidth y CPU en clientes)
      return;
    }

    recordarFirma(competenciaId, firma);
    ioRef
      .to(`competencia-${competenciaId}`)
      .emit('leaderboard-update', { competenciaId, ...data, resultado });
    noteBroadcast('leaderboard-update');
  } catch (err) {
    log.error('socket: no se pudo difundir la clasificacion', err);
  }
}

// Alias historico usado por codigo anterior.
export const broadcastResult = broadcastLeaderboard;

/**
 * Difunde el arranque vigente de una competencia a su sala (jueces + pantalla pública).
 * Es el único camino por el que viaja `competencia:start`: armar, pausar, reanudar,
 * finalizar y abortar pasan por aquí.
 */
export async function broadcastCompetenciaStart(competenciaId: number): Promise<void> {
  if (!ioRef) return;
  try {
    const arranque = await obtenerSnapshot(competenciaId);
    if (!arranque) return;
    ioRef.to(`competencia-${competenciaId}`).emit('competencia:start', arranque);
    noteBroadcast('competencia:start');
  } catch (err) {
    log.error('socket: no se pudo difundir el arranque', err);
  }
}
