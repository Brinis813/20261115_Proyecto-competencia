import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Flag, Play, RotateCcw, Square, Timer, XCircle } from 'lucide-react';
import { useTimer } from '../../hooks/useTimer';
import { Button } from '../ui';
import { formatoTope, PENALIZACION_NO_REP_SEG } from '../../utils/juezMedicion';

export interface EstadoCrono {
  enMarcha: boolean;
  conMarca: boolean;
}

export interface CronometroHandle {
  iniciar: () => void;
  detener: () => void;
  reiniciar: () => void;
  getTranscurridoMs: () => number;
  getTextoActual: () => string;
}

/**
 * Cronómetro del WOD de tiempo, con su estado propio.
 *
 * El tick (~10/s) solo re-renderiza este componente: la página del juez
 * recibe únicamente transiciones (enMarcha/conMarca) y lee el valor en
 * firme por ref al enviar. El tope del WOD detiene solo y avisa con onCap;
 * el heat congelado (pausa/cap/cierre) congela sin anotar.
 */
const CronometroView = forwardRef<
  CronometroHandle,
  {
    cap: number;
    checklistCompleto: boolean;
    congelado: boolean;
    penalizacionSeg: number;
    modoCap: boolean;
    tiempoTomado: boolean;
    onCap: () => void;
    onEstado: (s: EstadoCrono) => void;
    onSolicitarInicio: () => void;
    onReiniciar: () => void;
    onNoRep: () => void;
    onVuelta: () => void;
    onDesempate: () => void;
  }
>(function CronometroView(
  {
    cap,
    checklistCompleto,
    congelado,
    penalizacionSeg,
    modoCap,
    tiempoTomado,
    onCap,
    onEstado,
    onSolicitarInicio,
    onReiniciar,
    onNoRep,
    onVuelta,
    onDesempate,
  },
  ref,
) {
  const { elapsed, isRunning, start, stop, reset, formatTime } = useTimer();
  const capMs = cap * 1000;

  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;

  useImperativeHandle(
    ref,
    () => ({
      iniciar: () => start(),
      detener: () => stop(),
      reiniciar: () => reset(),
      getTranscurridoMs: () => elapsedRef.current,
      getTextoActual: () => formatTime(elapsedRef.current),
    }),
    [start, stop, reset, formatTime],
  );

  // Informa transiciones al padre (misma referencia si no cambia: sin bucles).
  const conMarca = elapsed > 0;
  useEffect(() => {
    onEstado({ enMarcha: isRunning, conMarca });
  }, [isRunning, conMarca, onEstado]);

  // Tope del WOD: se detiene solo y avisa para pasar a registrar por
  // repeticiones (el atleta no terminó dentro del límite).
  useEffect(() => {
    if (cap > 0 && isRunning && elapsed >= capMs) {
      stop();
      onCap();
    }
  }, [cap, capMs, isRunning, elapsed, stop, onCap]);

  // Heat congelado: se detiene en el segundo actual sin anotar nada.
  useEffect(() => {
    if (congelado && isRunning) stop();
  }, [congelado, isRunning, stop]);

  const tiempoFinalMs = elapsed + penalizacionSeg * 1000;

  return (
    <section className="surface-raised p-5 sm:p-7 text-center">
      <p className="eyebrow mb-2">Cronometro</p>
      {cap > 0 && (
        <p className="text-2xs text-hyrox-mist mb-3">
          Tope: {formatoTope(cap)} · al alcanzarlo se registra por repeticiones
        </p>
      )}

      <p
        className="timer-display leading-none select-none text-[3.25rem] sm:text-7xl"
        role="timer"
        aria-live="off"
      >
        {formatTime(elapsed)}
      </p>

      {/* El tiempo que se enviara solo se separa del reloj cuando
          hay penalizacion, para no confundir mientras corre. */}
      {penalizacionSeg > 0 && (
        <p className="mt-3 text-sm text-hyrox-mist">
          + {penalizacionSeg} s de penalizacion ={' '}
          <span className="font-mono font-bold text-hyrox-danger">{formatTime(tiempoFinalMs)}</span>
        </p>
      )}

      {!modoCap && (
        <>
          <div className="flex flex-wrap gap-3 justify-center mt-7">
            {!isRunning ? (
              <Button
                variant="success"
                onClick={onSolicitarInicio}
                disabled={congelado || tiempoTomado || !checklistCompleto}
                className="min-w-[9rem] min-h-[3.5rem] text-lg"
              >
                <Play className="w-6 h-6" aria-hidden="true" />
                Iniciar
              </Button>
            ) : (
              <Button
                variant="danger"
                onClick={stop}
                className="min-w-[9rem] min-h-[3.5rem] text-lg"
              >
                <Square className="w-6 h-6" aria-hidden="true" />
                Detener
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={onReiniciar}
              disabled={congelado}
              className="min-h-[3.5rem] px-5"
              aria-label="Reiniciar cronometro"
            >
              <RotateCcw className="w-5 h-5" aria-hidden="true" />
            </Button>
          </div>

          {!isRunning && !tiempoTomado && !checklistCompleto && (
            <p className="mt-3 text-2xs text-hyrox-warning">
              Completa las comprobaciones previas para dar la salida
            </p>
          )}

          {/* Acciones que solo tienen sentido con el reloj en marcha. */}
          {isRunning && (
            <div className="flex flex-wrap gap-2 justify-center mt-5">
              <button
                type="button"
                onClick={onNoRep}
                disabled={congelado}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-hyrox-danger bg-hyrox-danger/12 text-hyrox-danger text-sm font-bold hover:bg-hyrox-danger/20 active:scale-95 transition cursor-pointer disabled:opacity-30"
              >
                <XCircle className="w-4 h-4" aria-hidden="true" />
                No-rep +{PENALIZACION_NO_REP_SEG}s
              </button>
              <button
                type="button"
                onClick={onVuelta}
                disabled={congelado}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-hyrox-info bg-hyrox-info/12 text-hyrox-info text-sm font-bold hover:bg-hyrox-info/20 active:scale-95 transition cursor-pointer disabled:opacity-30"
              >
                <Timer className="w-4 h-4" aria-hidden="true" />
                Vuelta
              </button>
              <button
                type="button"
                onClick={onDesempate}
                disabled={congelado}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-hyrox-warning bg-hyrox-warning/12 text-hyrox-warning text-sm font-bold hover:bg-hyrox-warning/20 active:scale-95 transition cursor-pointer disabled:opacity-30"
              >
                <Flag className="w-4 h-4" aria-hidden="true" />
                Desempate
              </button>
            </div>
          )}
        </>
      )}

      {/* El resultado sale del cronometro; el juez no puede editarlo. */}
      {tiempoTomado && (
        <p className="mt-6 text-sm text-hyrox-mist">
          Resultado en firme:{' '}
          <span className="font-mono font-bold text-hyrox-paper">{formatTime(tiempoFinalMs)}</span>
        </p>
      )}
    </section>
  );
});

export default CronometroView;
