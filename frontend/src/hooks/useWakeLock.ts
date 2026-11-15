import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Mantiene la pantalla encendida mientras se cronometra.
 *
 * El navegador libera el bloqueo por su cuenta al ocultar la pestana, asi que
 * hay que volver a pedirlo cuando la pagina vuelve a ser visible; sin eso, el
 * movil se apaga en cuanto el juez atiende una notificacion.
 */
export function useWakeLock() {
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const queridoRef = useRef(false);

  useEffect(() => {
    setIsSupported(typeof navigator !== 'undefined' && 'wakeLock' in navigator);
  }, []);

  const request = useCallback(async () => {
    queridoRef.current = true;
    if (!('wakeLock' in navigator) || sentinelRef.current) return;

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      sentinelRef.current = sentinel;
      setIsActive(true);
      sentinel.addEventListener('release', () => {
        sentinelRef.current = null;
        setIsActive(false);
      });
    } catch {
      // El navegador puede denegarlo (bateria baja, sin gesto previo del
      // usuario). No es critico: solo significa que la pantalla podra apagarse.
      setIsActive(false);
    }
  }, []);

  const release = useCallback(async () => {
    queridoRef.current = false;
    try {
      await sentinelRef.current?.release();
    } catch {
      // Ya estaba liberado.
    }
    sentinelRef.current = null;
    setIsActive(false);
  }, []);

  // Recuperar el bloqueo al volver a la pestana.
  useEffect(() => {
    function alCambiarVisibilidad() {
      if (document.visibilityState === 'visible' && queridoRef.current && !sentinelRef.current) {
        request();
      }
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  }, [request]);

  // Liberar al desmontar, para no dejar la pantalla encendida sin motivo.
  useEffect(() => {
    return () => {
      queridoRef.current = false;
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, []);

  return { isSupported, isActive, request, release };
}
