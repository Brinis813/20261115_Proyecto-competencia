import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
  useCallback,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

export type EstadoConexion = 'conectando' | 'conectado' | 'desconectado';

interface SocketContextType {
  socket: Socket | null;
  estado: EstadoConexion;
  /** Entra en la sala de una competencia y empieza a recibir su clasificacion. */
  joinCompetencia: (competenciaId: number) => void;
  leaveCompetencia: (competenciaId: number) => void;
  /** Pide una clasificacion fresca sin esperar al siguiente resultado. */
  requestLeaderboard: (competenciaId: number) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  estado: 'desconectado',
  joinCompetencia: () => {},
  leaveCompetencia: () => {},
  requestLeaderboard: () => {},
});

/**
 * Conexion unica para toda la aplicacion, creada fuera del ciclo de vida de
 * React.
 *
 * En desarrollo, StrictMode monta y desmonta cada componente dos veces. Si el
 * socket se creara dentro del efecto, la primera conexion se cortaria en mitad
 * del handshake y el navegador avisaria con "WebSocket is closed before the
 * connection is established". Con un singleton la conexion sobrevive al doble
 * montaje y no hay ni aviso ni conexiones desperdiciadas.
 */
let socketCompartido: Socket | null = null;

function obtenerSocket(): Socket {
  if (socketCompartido) return socketCompartido;

  socketCompartido = io({
    // Mismo origen que sirve la pagina: en desarrollo lo redirige Vite y en
    // produccion nginx, asi que no hay URLs que configurar por entorno.
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
    // CRIT-1: La cookie HttpOnly viaja automáticamente con withCredentials.
    // No enviar token en auth — el backend lo lee de la cookie.
    reconnection: true,
    reconnectionAttempts: Infinity,
    // Espera creciente para no martillear un servidor que esta reiniciando.
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
  });

  return socketCompartido;
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [estado, setEstado] = useState<EstadoConexion>('conectando');
  const socket = obtenerSocket();
  const usuarioAnterior = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    function alConectar() {
      setEstado('conectado');
    }
    function alDesconectar() {
      setEstado('desconectado');
    }
    function alReintentar() {
      setEstado('conectando');
    }

    socket.on('connect', alConectar);
    socket.on('disconnect', alDesconectar);
    socket.on('connect_error', alDesconectar);
    socket.io.on('reconnect_attempt', alReintentar);

    // Estado inicial correcto aunque el socket ya estuviera conectado antes
    // de montar este provider.
    setEstado(socket.connected ? 'conectado' : 'conectando');

    return () => {
      // Solo se retiran los listeners: el socket es compartido y sigue vivo.
      socket.off('connect', alConectar);
      socket.off('disconnect', alDesconectar);
      socket.off('connect_error', alDesconectar);
      socket.io.off('reconnect_attempt', alReintentar);
    };
  }, [socket]);

  // Al iniciar o cerrar sesion hay que rehacer el handshake: el token viaja
  // en el, y de el dependen los permisos de juez dentro del canal.
  useEffect(() => {
    const idActual = user?.id ?? null;

    if (usuarioAnterior.current === undefined) {
      usuarioAnterior.current = idActual;
      return;
    }
    if (usuarioAnterior.current === idActual) return;

    usuarioAnterior.current = idActual;
    setEstado('conectando');
    socket.disconnect().connect();
  }, [user?.id, socket]);

  const joinCompetencia = useCallback(
    (competenciaId: number) => socket.emit('join-competencia', competenciaId),
    [socket],
  );
  const leaveCompetencia = useCallback(
    (competenciaId: number) => socket.emit('leave-competencia', competenciaId),
    [socket],
  );
  const requestLeaderboard = useCallback(
    (competenciaId: number) => socket.emit('request-leaderboard', competenciaId),
    [socket],
  );

  return (
    <SocketContext.Provider
      value={{ socket, estado, joinCompetencia, leaveCompetencia, requestLeaderboard }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
