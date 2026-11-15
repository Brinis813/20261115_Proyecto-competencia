import { useCallback, useEffect, useRef } from 'react';

/**
 * Pitidos cortos para la cuenta atras y los cambios de intervalo.
 *
 * En un evento el juez mira al atleta, no al movil: el aviso tiene que
 * entrar por el oido. Se sintetiza con WebAudio en lugar de cargar un fichero
 * de sonido para que no dependa de la red ni de un asset que cachear.
 *
 * El AudioContext se crea al primer uso, no al montar: los navegadores lo
 * bloquean hasta que hay un gesto del usuario, y el primer pitido siempre
 * llega despues de que el juez pulse un boton.
 */
export function useBeep() {
  const contextoRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      contextoRef.current?.close();
      contextoRef.current = null;
    };
  }, []);

  const beep = useCallback((frecuencia: number, duracionMs: number) => {
    try {
      if (!contextoRef.current) {
        const Constructor = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!Constructor) return;
        contextoRef.current = new Constructor();
      }

      const ctx = contextoRef.current;
      // Safari deja el contexto suspendido hasta que se reanuda tras un gesto.
      if (ctx.state === 'suspended') void ctx.resume();

      const oscilador = ctx.createOscillator();
      const ganancia = ctx.createGain();
      oscilador.connect(ganancia);
      ganancia.connect(ctx.destination);

      oscilador.type = 'sine';
      oscilador.frequency.value = frecuencia;

      const fin = ctx.currentTime + duracionMs / 1000;
      ganancia.gain.setValueAtTime(0.3, ctx.currentTime);
      // Caida exponencial: un corte seco produce un chasquido audible.
      ganancia.gain.exponentialRampToValueAtTime(0.001, fin);

      oscilador.start();
      oscilador.stop(fin);
    } catch {
      // Un movil con el audio bloqueado no debe tumbar la medicion.
    }
  }, []);

  /** Tic de los ultimos segundos: agudo y muy corto. */
  const beepCuenta = useCallback(() => beep(800, 120), [beep]);

  /** Arranque o cambio de fase: mas agudo y largo, para que destaque. */
  const beepTransicion = useCallback(() => beep(1200, 450), [beep]);

  return { beep, beepCuenta, beepTransicion };
}
