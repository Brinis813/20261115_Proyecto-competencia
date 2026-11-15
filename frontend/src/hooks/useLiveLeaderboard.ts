import { useEffect } from 'react';
import api, { mensajeDeError } from '../api/client';
import { useSocket } from '../contexts/SocketContext';
import { useLeaderboardStore } from '../stores/leaderboardStore';
import type { LeaderboardData } from '../types';

/**
 * Mantiene la clasificacion de una competencia sincronizada en vivo.
 *
 * Flujo:
 *  1. Carga inicial por HTTP, para que la pantalla no quede vacia mientras se
 *     establece el WebSocket (y para que funcione aunque el socket falle).
 *  2. Entra en la sala `competencia-<id>`; el servidor responde con la clasificacion.
 *  3. Cada vez que un juez guarda o un admin resetea un resultado, el servidor
 *     empuja `leaderboard-update` y el store se actualiza. Nunca hace falta
 *     recargar la pagina ni hay polling.
 */
export function useLiveLeaderboard(competenciaId: number | null) {
  const { socket, estado, joinCompetencia, leaveCompetencia } = useSocket();
  const iniciar = useLeaderboardStore((s) => s.iniciar);
  const aplicarDatos = useLeaderboardStore((s) => s.aplicarDatos);
  const setError = useLeaderboardStore((s) => s.setError);
  const reset = useLeaderboardStore((s) => s.reset);

  // Carga inicial por HTTP. Si el socket entrega primero, se aborta para no
  // hacer el mismo trabajo dos veces.
  useEffect(() => {
    if (!competenciaId) {
      reset();
      return;
    }

    let cancelado = false;
    const ctrl = new AbortController();
    iniciar(competenciaId);

    const alUpdate = () => {
      ctrl.abort();
      socket?.off('leaderboard-update', alUpdate);
    };
    socket?.once('leaderboard-update', alUpdate);

    api
      .get<LeaderboardData>(`/leaderboard/public/${competenciaId}`, { signal: ctrl.signal })
      .then((res) => {
        if (!cancelado) aplicarDatos(res.data);
      })
      .catch((err) => {
        // Abortado porque el socket gano la carrera: no es un error.
        if (cancelado || err?.code === 'ERR_CANCELED') return;
        setError(mensajeDeError(err, 'No se pudo cargar la clasificacion'));
      });

    return () => {
      cancelado = true;
      ctrl.abort();
      socket?.off('leaderboard-update', alUpdate);
    };
  }, [competenciaId, iniciar, aplicarDatos, setError, reset, socket]);

  // Suscripcion en tiempo real.
  useEffect(() => {
    if (!competenciaId || !socket) return;

    function onUpdate(data: LeaderboardData & { competenciaId?: number }) {
      // Puede llegar una actualizacion de la sala anterior justo al cambiar
      // de Competencia; se descarta para no pisar los datos correctos.
      if (data.competenciaId && data.competenciaId !== competenciaId) return;
      aplicarDatos(data);
    }

    socket.on('leaderboard-update', onUpdate);
    // 'result-saved' es el nombre que emitian versiones anteriores del backend.
    socket.on('result-saved', onUpdate);

    return () => {
      socket.off('leaderboard-update', onUpdate);
      socket.off('result-saved', onUpdate);
    };
  }, [socket, competenciaId, aplicarDatos]);

  // Entrar en la sala, y volver a entrar tras cada reconexion.
  useEffect(() => {
    if (!competenciaId || estado !== 'conectado') return;

    joinCompetencia(competenciaId);
    return () => leaveCompetencia(competenciaId);
  }, [competenciaId, estado, joinCompetencia, leaveCompetencia]);
}
