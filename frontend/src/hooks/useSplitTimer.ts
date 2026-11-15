import { useEffect, useRef, useState } from 'react';

/**
 * Cronometro en milisegundos para la medicion por segmentos (HYROX).
 *
 * Mientras `activo` sea true el tiempo avanza; al pausarlo conserva lo
 * acumulado y al reanudarlo sigue desde ahi. El acumulado vive en una ref a
 * proposito: si el efecto dependiera del estado se destruiria y recrearia el
 * intervalo en cada tick (diez veces por segundo).
 */
export function useSplitTimer(activo: boolean) {
  const [tiempo, setTiempo] = useState(0);
  const acumulado = useRef(0);

  useEffect(() => {
    if (!activo) return;
    const inicio = Date.now() - acumulado.current;
    const intervalo = setInterval(() => {
      acumulado.current = Date.now() - inicio;
      setTiempo(acumulado.current);
    }, 100);
    return () => clearInterval(intervalo);
  }, [activo]);

  return tiempo;
}
