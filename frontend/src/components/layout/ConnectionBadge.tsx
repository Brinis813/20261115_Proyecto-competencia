import { useSyncExternalStore } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useSocket } from '../../contexts/SocketContext';

/** Estado de la red del navegador, sin duplicar listeners en cada componente. */
function suscribirseAConexion(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useEstaEnLinea(): boolean {
  return useSyncExternalStore(
    suscribirseAConexion,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Indicador del canal en vivo. Solo aparece cuando hay algo que comunicar:
 * si todo funciona no distrae, y si algo falla lo dice de forma explicita.
 */
export default function ConnectionBadge() {
  const { estado } = useSocket();
  const enLinea = useEstaEnLinea();

  if (!enLinea) {
    return (
      <span className="badge-red" role="status">
        <WifiOff className="w-3 h-3" aria-hidden="true" />
        <span className="hidden sm:inline">Sin conexion</span>
      </span>
    );
  }

  if (estado === 'conectando') {
    return (
      <span className="badge-amber" role="status">
        <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
        <span className="hidden sm:inline">Reconectando</span>
      </span>
    );
  }

  if (estado === 'desconectado') {
    return (
      <span className="badge-gray" role="status">
        <WifiOff className="w-3 h-3" aria-hidden="true" />
        <span className="hidden sm:inline">Sin tiempo real</span>
      </span>
    );
  }

  return (
    <span className="badge-green" role="status">
      <Wifi className="w-3 h-3" aria-hidden="true" />
      <span className="hidden sm:inline">En vivo</span>
    </span>
  );
}

/** Aviso fijo cuando el dispositivo pierde la red; el juez sigue pudiendo medir. */
export function OfflineBanner() {
  const enLinea = useEstaEnLinea();
  if (enLinea) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 pb-safe" role="status">
      <div className="max-w-md mx-auto flex items-center gap-3 px-4 py-3 rounded-2xl bg-hyrox-danger text-white shadow-elevated">
        <WifiOff className="w-5 h-5 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">
          Sin conexion. Los resultados se guardan y se enviaran al reconectar.
        </span>
      </div>
    </div>
  );
}
