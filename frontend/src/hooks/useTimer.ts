import { useState, useRef, useCallback, useEffect } from 'react';

export function useTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/timerWorker.ts', import.meta.url), {
      type: 'module',
    });

    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'tick') {
        setElapsed(e.data.elapsed);
      } else if (e.data.type === 'stopped') {
        // Valor en firme al milisegundo (el worker lo recalcula al detener):
        // el tick de 100 ms no resta precision al tiempo guardado.
        setElapsed(e.data.elapsed);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const start = useCallback(() => {
    workerRef.current?.postMessage({ type: 'start' });
    setIsRunning(true);
  }, []);

  const stop = useCallback(() => {
    workerRef.current?.postMessage({ type: 'stop' });
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    workerRef.current?.postMessage({ type: 'reset' });
    setElapsed(0);
    setIsRunning(false);
  }, []);

  const formatTime = useCallback((ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const centis = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
  }, []);

  return { elapsed, isRunning, start, stop, reset, formatTime };
}
