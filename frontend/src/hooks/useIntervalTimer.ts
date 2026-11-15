import { useCallback, useEffect, useRef, useState } from 'react';
import { useBeep } from './useBeep';

export type FaseIntervalo = 'trabajo' | 'descanso';

export interface ConfigIntervalos {
  /** Segundos de trabajo por ronda. */
  segundosTrabajo: number;
  /** Segundos de descanso entre rondas. 0 = sin descanso (EMOM puro). */
  segundosDescanso: number;
  /** Numero total de rondas. */
  rondas: number;
}

/**
 * Temporizador de intervalos para EMOM, Tabata y formatos equivalentes.
 *
 * El tiempo restante se calcula contra una marca de fin absoluta en vez de ir
 * restando en cada tick. Un `setInterval` se retrasa cuando la pestana pasa a
 * segundo plano (algo garantizado en un movil dentro del bolsillo del juez) y
 * un contador que resta acumularia ese retraso ronda tras ronda. Con una marca
 * absoluta, al volver a primer plano el reloj se corrige solo.
 *
 * Con `segundosDescanso` en 0 la fase de descanso se omite por completo: un
 * EMOM encadena rondas de trabajo sin pausa.
 */
export function useIntervalTimer(config: ConfigIntervalos) {
  const [ronda, setRonda] = useState(0);
  const [fase, setFase] = useState<FaseIntervalo>('trabajo');
  const [restanteMs, setRestanteMs] = useState(config.segundosTrabajo * 1000);
  const [enMarcha, setEnMarcha] = useState(false);
  const [terminado, setTerminado] = useState(false);

  const { beepCuenta, beepTransicion } = useBeep();

  // El estado que consulta el tick vive en una ref: el intervalo se crea una
  // sola vez y no debe recrearse (ni perder la marca de fin) en cada render.
  const planRef = useRef({ ronda: 0, fase: 'trabajo' as FaseIntervalo, finEn: 0 });
  const configRef = useRef(config);
  const ultimoSegundoRef = useRef(-1);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);

  configRef.current = config;

  const detenerTick = useCallback(() => {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    detenerTick();
    setEnMarcha(false);
  }, [detenerTick]);

  const reset = useCallback(() => {
    detenerTick();
    planRef.current = { ronda: 0, fase: 'trabajo', finEn: 0 };
    ultimoSegundoRef.current = -1;
    setEnMarcha(false);
    setTerminado(false);
    setRonda(0);
    setFase('trabajo');
    setRestanteMs(configRef.current.segundosTrabajo * 1000);
  }, [detenerTick]);

  const start = useCallback(() => {
    const { segundosTrabajo } = configRef.current;
    detenerTick();

    planRef.current = { ronda: 1, fase: 'trabajo', finEn: Date.now() + segundosTrabajo * 1000 };
    ultimoSegundoRef.current = -1;

    setTerminado(false);
    setRonda(1);
    setFase('trabajo');
    setRestanteMs(segundosTrabajo * 1000);
    setEnMarcha(true);
    beepTransicion();

    intervaloRef.current = setInterval(() => {
      const { segundosTrabajo: trabajo, segundosDescanso: descanso, rondas } = configRef.current;
      const plan = planRef.current;
      const ahora = Date.now();
      let restante = plan.finEn - ahora;

      if (restante <= 0) {
        // Fin de fase. Con descanso 0 no hay fase de descanso que reproducir.
        if (plan.fase === 'trabajo' && descanso > 0) {
          plan.fase = 'descanso';
          plan.finEn = ahora + descanso * 1000;
        } else if (plan.ronda >= rondas) {
          detenerTick();
          setEnMarcha(false);
          setTerminado(true);
          setRestanteMs(0);
          beepTransicion();
          return;
        } else {
          plan.ronda += 1;
          plan.fase = 'trabajo';
          plan.finEn = ahora + trabajo * 1000;
        }

        ultimoSegundoRef.current = -1;
        restante = plan.finEn - ahora;
        beepTransicion();
        setRonda(plan.ronda);
        setFase(plan.fase);
      }

      // Tic de aviso en los ultimos 3 segundos, una sola vez por segundo.
      const segundos = Math.ceil(restante / 1000);
      if (segundos <= 3 && segundos > 0 && segundos !== ultimoSegundoRef.current) {
        ultimoSegundoRef.current = segundos;
        beepCuenta();
      }

      setRestanteMs(restante);
    }, 100);
  }, [detenerTick, beepCuenta, beepTransicion]);

  // Mientras esta parado, cambiar la configuracion debe reflejarse en pantalla.
  useEffect(() => {
    if (!enMarcha && !terminado) {
      setRestanteMs(config.segundosTrabajo * 1000);
    }
  }, [config.segundosTrabajo, enMarcha, terminado]);

  useEffect(() => detenerTick, [detenerTick]);

  return {
    ronda,
    fase,
    restanteMs,
    /** Segundos que se muestran en pantalla (se redondea hacia arriba). */
    segundosRestantes: Math.max(0, Math.ceil(restanteMs / 1000)),
    enMarcha,
    terminado,
    start,
    stop,
    reset,
  };
}
