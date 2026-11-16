import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Square,
} from 'lucide-react';
import type { MovimientoObjetivo } from './ContadorEsquema';
import { formatoCrono, unidadParaTipo } from '../../utils/unidadesMedicion';

/** Objetivo por ronda de cada movimiento (for_time trae el total; amrap ya viene por ronda). */
export function porRondaDe(
  movimientos: MovimientoObjetivo[],
  rondasTotal: number,
  esTiempo: boolean,
): number[] {
  const rondas = Math.max(1, Math.round(rondasTotal) || 1);
  return movimientos.map((m) => {
    if (esTiempo && rondas > 1 && m.objetivo > 0) return m.objetivo / rondas;
    return m.objetivo;
  });
}

/**
 * Scorecard secuencial para `tipo_flujo=en_serie`: un ejercicio a la vez,
 * en orden, con rondas X/N. Al llegar al tope del paso actual se avanza solo
 * al siguiente ejercicio (con objetivo fijo; en AMRAP superable el juez avanza
 * a mano para poder seguir sumando). Los conteos totales viven en el padre
 * (mismo `detalle` que la cuadrícula); aquí solo se muestra el paso actual.
 */
export default function ContadorSerie({
  movimientos,
  conteos,
  onCambiar,
  deshabilitado,
  esTiempo,
  rondasTotal,
  permitirExceder,
}: {
  movimientos: MovimientoObjetivo[];
  conteos: number[];
  onCambiar: (conteos: number[]) => void;
  deshabilitado?: boolean;
  esTiempo: boolean;
  rondasTotal: number;
  permitirExceder?: boolean;
}) {
  const rondas = Math.max(1, Math.round(rondasTotal) || 1);
  const totalPasos = Math.max(1, movimientos.length * rondas);
  const [paso, setPaso] = useState(0);

  const porRonda = useMemo(
    () => porRondaDe(movimientos, rondas, esTiempo),
    [movimientos, rondas, esTiempo],
  );

  const pasoSeguro = Math.min(paso, totalPasos - 1);
  const rondaIdx = movimientos.length > 0 ? Math.floor(pasoSeguro / movimientos.length) : 0;
  const movIdx = movimientos.length > 0 ? pasoSeguro % movimientos.length : 0;
  const mov = movimientos[movIdx];
  const objetivoPaso = porRonda[movIdx] ?? 0;

  // Lo ya hecho en rondas anteriores es la base; el paso actual cuenta desde ahí.
  const base = (porRonda[movIdx] ?? 0) * rondaIdx;
  const totalMov = conteos[movIdx] || 0;
  const hechoPaso = Math.max(0, totalMov - base);
  const completo = objetivoPaso > 0 ? hechoPaso >= objetivoPaso : hechoPaso > 0;
  const total = conteos.reduce((a, b) => a + b, 0);

  function fijar(nuevoPaso: number) {
    const copia = [...conteos];
    const minimo = base;
    const tope = permitirExceder ? Infinity : base + (objetivoPaso > 0 ? objetivoPaso : Infinity);
    copia[movIdx] = Math.min(tope, Math.max(minimo, nuevoPaso));
    onCambiar(copia);
  }

  // Mini-cronómetro para movimientos medidos por tiempo (ej. plancha 300 s):
  // el juez lo inicia, lo detiene y el tiempo se anota solo en el paso.
  // Se reinicia al cambiar de paso; en pausa se congela sin anotar.
  const [cronoSeg, setCronoSeg] = useState(0);
  const [cronoOn, setCronoOn] = useState(false);
  const cronoBase = useRef(0);
  const cronoT0 = useRef(0);

  // Solo lee refs: identidad estable para los efectos que la usan.
  const leerCrono = useCallback((): number => {
    return cronoBase.current + Math.max(0, Math.floor((Date.now() - cronoT0.current) / 1000));
  }, []);

  useEffect(() => {
    if (!cronoOn) return;
    const id = window.setInterval(() => setCronoSeg(leerCrono()), 500);
    return () => window.clearInterval(id);
  }, [cronoOn, leerCrono]);

  // Al cambiar de ejercicio/ronda el crono vuelve a cero.
  const pasoId = `${movIdx}-${rondaIdx}`;
  const pasoPrevio = useRef(pasoId);
  useEffect(() => {
    if (pasoPrevio.current !== pasoId) {
      pasoPrevio.current = pasoId;
      cronoBase.current = 0;
      setCronoSeg(0);
      setCronoOn(false);
    }
  }, [pasoId]);

  // En pausa se congela sin anotar nada.
  useEffect(() => {
    if (deshabilitado && cronoOn) {
      setCronoSeg(leerCrono());
      setCronoOn(false);
    }
  }, [deshabilitado, cronoOn, leerCrono]);

  function iniciarCrono() {
    if (deshabilitado) return;
    // Si ya hay un valor anotado (tecleado a mano) y el crono está a cero,
    // se continúa desde ahí para que la línea verde no salte atrás.
    const inicio = cronoSeg > 0 ? cronoSeg : hechoPaso;
    cronoBase.current = inicio;
    setCronoSeg(inicio);
    cronoT0.current = Date.now();
    setCronoOn(true);
  }

  function detenerCrono() {
    const final = leerCrono();
    setCronoSeg(final);
    setCronoOn(false);
    fijar(base + final);
  }

  function reiniciarCrono() {
    cronoBase.current = 0;
    setCronoSeg(0);
    setCronoOn(false);
  }

  const tipo = mov?.tipo_medicion ?? 'repeticiones';
  const unidad = unidadParaTipo(tipo, mov?.unidad_distancia, mov?.unidad_energia);
  const esMovTiempo = tipo === 'tiempo';
  // En movimientos por tiempo lo anotado vive en `conteos`, pero mientras el
  // crono corre la línea verde debe moverse en directo (MM:SS, en minutos).
  const visibleSeg = esMovTiempo ? (cronoOn ? cronoSeg : hechoPaso) : hechoPaso;
  const pctTiempo =
    esMovTiempo && objetivoPaso > 0
      ? Math.min(100, Math.max(0, (visibleSeg / objetivoPaso) * 100))
      : 0;

  // Auto-registro por tiempo: al cumplirse el tiempo del ejercicio el crono
  // se detiene solo, se anota el objetivo y se avanza al siguiente tras un
  // respiro (se alcanza a ver el "Completo"). Vale también en AMRAP: el
  // tiempo prescrito es fijo (no se puede "superar" como las reps), así que
  // no depende de `permitirExceder`. Si el juez necesita corregir, puede
  // volver con "Anterior" y teclear el valor.
  useEffect(() => {
    if (!esMovTiempo || !cronoOn || deshabilitado) return;
    if (objetivoPaso <= 0 || cronoSeg < objetivoPaso) return;
    cronoBase.current = objetivoPaso;
    setCronoSeg(objetivoPaso);
    setCronoOn(false);
    fijar(base + objetivoPaso);
    if (navigator.vibrate) navigator.vibrate(80);
    if (pasoSeguro >= totalPasos - 1) return;
    const aqui = pasoSeguro;
    const t = window.setTimeout(() => {
      setPaso((p) => (p === aqui ? Math.min(totalPasos - 1, p + 1) : p));
    }, 1000);
    return () => window.clearTimeout(t);
    // `fijar` se excluye a propósito: depende del `onCambiar` del padre (nueva
    // identidad por render) y listarlo cancelaría el avance programado al
    // re-renderizar tras anotar. Los valores que usa viajan en las deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cronoSeg, cronoOn, esMovTiempo, objetivoPaso, deshabilitado, base, pasoSeguro, totalPasos]);

  // Avance automático: al completar el tope del paso se pasa solo al
  // siguiente ejercicio tras un respiro (se alcanza a ver el "Completo").
  // Solo con objetivo fijo: en AMRAP superable (`permitirExceder`) el juez
  // puede querer seguir sumando, así que avanza con el botón. No dispara al
  // montar ni al volver a un paso ya completo, y si el juez avanzó a mano
  // antes del temporizador, este ya no hace nada.
  const eraCompleto = useRef(completo);
  useEffect(() => {
    const antes = eraCompleto.current;
    eraCompleto.current = completo;
    if (permitirExceder || deshabilitado) return;
    if (antes || !completo || pasoSeguro >= totalPasos - 1) return;
    const aqui = pasoSeguro;
    const t = window.setTimeout(() => {
      setPaso((p) => (p === aqui ? Math.min(totalPasos - 1, p + 1) : p));
    }, 750);
    return () => window.clearTimeout(t);
  }, [completo, pasoSeguro, totalPasos, permitirExceder, deshabilitado]);

  return (
    <section className="surface-raised p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="eyebrow">
          Ejercicio {movimientos.length > 0 ? movIdx + 1 : 0} de {movimientos.length}
        </p>
        <p
          className="shrink-0 rounded-lg border border-hyrox-primary/40 bg-hyrox-primary/12 px-3 py-1.5 font-mono text-base font-extrabold text-hyrox-primary"
          aria-live="polite"
          aria-label={`Ronda ${rondaIdx + 1} de ${rondas}`}
        >
          Ronda {rondaIdx + 1}/{rondas}
        </p>
      </div>
      {rondas > 1 && (
        <p className="mb-1 text-right text-2xs text-hyrox-ghost font-mono">
          paso {pasoSeguro + 1}/{totalPasos}
        </p>
      )}

      {/* Progreso de rondas */}
      {rondas > 1 && (
        <div className="flex gap-1.5 mb-4" aria-label={`Ronda ${rondaIdx + 1} de ${rondas}`}>
          {Array.from({ length: rondas }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < rondaIdx ? 'bg-hyrox-accent' : i === rondaIdx ? 'bg-hyrox-primary' : 'bg-white/10'}`}
            />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
        <p className="text-lg font-extrabold text-hyrox-paper">
          {mov?.nombre || `Movimiento ${movIdx + 1}`}
        </p>
        {mov?.peso ? (
          <p className="font-mono text-2xs font-bold text-hyrox-primary mt-0.5">
            {mov.peso} {mov.unidad_peso ?? 'kg'}
          </p>
        ) : null}
        {esMovTiempo && objetivoPaso > 0 ? (
          <>
            <p
              className={`font-mono text-3xl font-extrabold mt-2 ${completo ? 'text-hyrox-accent' : 'text-hyrox-paper'}`}
            >
              {formatoCrono(visibleSeg)}
              <span className="text-base text-hyrox-ghost">
                {' '}
                / {formatoCrono(objetivoPaso)} min
              </span>
            </p>
            {/* Línea verde de progreso del tiempo, en minutos (MM:SS). */}
            <div
              className="mx-auto mt-2 h-1.5 w-44 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={objetivoPaso}
              aria-valuenow={Math.min(visibleSeg, objetivoPaso)}
              aria-label={`${mov?.nombre ?? 'Ejercicio'}: ${formatoCrono(visibleSeg)} de ${formatoCrono(objetivoPaso)} minutos`}
            >
              <div
                className="h-full rounded-full bg-hyrox-accent transition-all duration-500"
                style={{ width: `${pctTiempo}%` }}
              />
            </div>
          </>
        ) : (
          <p
            className={`font-mono text-3xl font-extrabold mt-2 ${completo ? 'text-hyrox-accent' : 'text-hyrox-paper'}`}
          >
            {Number.isInteger(hechoPaso) ? hechoPaso : hechoPaso.toFixed(1)}
            {objetivoPaso > 0 && (
              <span className="text-base text-hyrox-ghost">
                {' '}
                / {objetivoPaso} {unidad}
              </span>
            )}
          </p>
        )}
        {completo && (
          <p className="mt-1 inline-flex items-center gap-1 text-2xs font-bold text-hyrox-accent">
            <Check className="w-3.5 h-3.5" aria-hidden="true" /> Completo — puedes avanzar
          </p>
        )}

        <div className="flex items-center justify-center gap-3 mt-4">
          {tipo === 'tiempo' ? (
            <div className="flex flex-col items-center gap-2">
              <span
                className="font-mono text-4xl font-extrabold text-hyrox-paper tabular-nums"
                role="timer"
              >
                {formatoCrono(cronoSeg)}
              </span>
              <div className="flex items-center gap-2">
                {!cronoOn ? (
                  <button
                    type="button"
                    onClick={iniciarCrono}
                    disabled={deshabilitado || (!permitirExceder && completo)}
                    className="inline-flex items-center gap-1.5 px-4 min-h-[3rem] rounded-xl border-2 border-hyrox-accent bg-hyrox-accent/12 text-hyrox-accent text-sm font-bold hover:bg-hyrox-accent/20 active:scale-95 transition disabled:opacity-30 cursor-pointer"
                  >
                    <Play className="w-4 h-4" aria-hidden="true" /> Iniciar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={detenerCrono}
                    className="inline-flex items-center gap-1.5 px-4 min-h-[3rem] rounded-xl border-2 border-hyrox-danger bg-hyrox-danger/12 text-hyrox-danger text-sm font-bold hover:bg-hyrox-danger/20 active:scale-95 transition cursor-pointer"
                  >
                    <Square className="w-4 h-4" aria-hidden="true" /> Detener y anotar
                  </button>
                )}
                <button
                  type="button"
                  onClick={reiniciarCrono}
                  disabled={deshabilitado || (cronoSeg === 0 && !cronoOn)}
                  aria-label="Reiniciar cronómetro"
                  className="grid place-items-center w-12 h-12 rounded-lg border border-white/10 bg-white/[0.03] text-hyrox-paper hover:bg-white/[0.08] active:scale-90 transition disabled:opacity-30 cursor-pointer"
                >
                  <RotateCcw className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <p className="text-2xs text-hyrox-ghost">
                Al cumplirse el tiempo se anota solo y se avanza · también puedes teclearlo abajo
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={hechoPaso || ''}
                  onChange={(e) => {
                    if (e.target.value === '') {
                      fijar(base);
                      return;
                    }
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 0) fijar(base + val);
                  }}
                  disabled={deshabilitado}
                  placeholder="0"
                  className="w-24 h-12 text-center font-mono text-xl font-bold text-hyrox-paper bg-white/[0.03] border border-white/10 rounded-lg focus:outline-none focus:border-hyrox-primary disabled:opacity-30"
                  aria-label={`${mov?.nombre} en segundos`}
                />
                <span className="text-2xs text-hyrox-ghost">
                  seg{hechoPaso > 0 ? ` · ${formatoCrono(hechoPaso)} min` : ''}
                </span>
              </div>
            </div>
          ) : tipo === 'distancia' ? (
            <>
              <input
                type="number"
                inputMode="decimal"
                value={hechoPaso || ''}
                onChange={(e) => {
                  if (e.target.value === '') {
                    fijar(base);
                    return;
                  }
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0) fijar(base + val);
                }}
                disabled={deshabilitado}
                placeholder="0"
                className="w-24 h-12 text-center font-mono text-xl font-bold text-hyrox-paper bg-white/[0.03] border border-white/10 rounded-lg focus:outline-none focus:border-hyrox-primary disabled:opacity-30"
                aria-label={`${mov?.nombre} en ${unidad}`}
              />
              <span className="text-2xs text-hyrox-ghost">{unidad}</span>
            </>
          ) : tipo === 'peso' ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fijar(totalMov - 1.25)}
                  disabled={deshabilitado || hechoPaso <= 0}
                  aria-label="Restar"
                  className="grid place-items-center w-12 h-12 rounded-lg border border-white/10 bg-white/[0.03] text-hyrox-paper hover:bg-white/[0.08] active:scale-90 transition disabled:opacity-30 cursor-pointer"
                >
                  <Minus className="w-5 h-5" aria-hidden="true" />
                </button>
                <span className="w-16 text-center font-mono text-xl font-bold text-hyrox-paper tabular-nums">
                  {hechoPaso.toFixed(1)}
                </span>
                <button
                  type="button"
                  onClick={() => fijar(totalMov + 1.25)}
                  disabled={deshabilitado || (!permitirExceder && completo)}
                  aria-label="Sumar"
                  className="grid place-items-center w-12 h-12 rounded-lg border-2 border-hyrox-primary bg-hyrox-primary/12 text-hyrox-primary hover:bg-hyrox-primary/20 active:scale-90 transition disabled:opacity-30 cursor-pointer"
                >
                  <Plus className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              {/* Entrada directa: subir de 1.25 en 1.25 hasta 100 kg es inviable. */}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={hechoPaso || ''}
                  onChange={(e) => {
                    if (e.target.value === '') {
                      fijar(base);
                      return;
                    }
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0) fijar(base + val);
                  }}
                  disabled={deshabilitado}
                  placeholder="0"
                  className="w-24 h-12 text-center font-mono text-xl font-bold text-hyrox-paper bg-white/[0.03] border border-white/10 rounded-lg focus:outline-none focus:border-hyrox-primary disabled:opacity-30"
                  aria-label={`${mov?.nombre} en ${unidad}`}
                />
                <span className="text-2xs text-hyrox-ghost">{unidad}</span>
              </div>
            </div>
          ) : tipo === 'calorías' ? (
            <>
              <input
                type="number"
                inputMode="numeric"
                value={hechoPaso || ''}
                onChange={(e) => {
                  if (e.target.value === '') {
                    fijar(base);
                    return;
                  }
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 0) fijar(base + val);
                }}
                disabled={deshabilitado}
                placeholder="0"
                className="w-24 h-12 text-center font-mono text-xl font-bold text-hyrox-paper bg-white/[0.03] border border-white/10 rounded-lg focus:outline-none focus:border-hyrox-primary disabled:opacity-30"
                aria-label={`${mov?.nombre} - calorías quemadas en ${unidad}`}
              />
              <span className="text-2xs text-hyrox-ghost">{unidad}</span>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fijar(totalMov - 1)}
                disabled={deshabilitado || hechoPaso <= 0}
                aria-label="Restar repetición"
                className="grid place-items-center w-20 h-20 rounded-2xl border border-white/10 bg-white/[0.03] text-hyrox-paper hover:bg-white/[0.08] active:scale-90 transition disabled:opacity-30 cursor-pointer"
              >
                <Minus className="w-9 h-9" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => fijar(totalMov + 1)}
                disabled={deshabilitado || (!permitirExceder && completo)}
                aria-label="Sumar repetición"
                className="grid place-items-center w-20 h-20 rounded-2xl border-2 border-hyrox-primary bg-hyrox-primary/12 text-hyrox-primary hover:bg-hyrox-primary/20 active:scale-90 transition disabled:opacity-30 cursor-pointer"
              >
                <Plus className="w-9 h-9" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={() => setPaso((p) => Math.max(0, p - 1))}
          disabled={pasoSeguro === 0}
          className="flex-1 min-h-[3rem] inline-flex items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] text-hyrox-paper text-sm font-bold hover:bg-white/[0.07] transition disabled:opacity-30 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Anterior
        </button>
        <button
          type="button"
          onClick={() => setPaso((p) => Math.min(totalPasos - 1, p + 1))}
          disabled={!completo || pasoSeguro >= totalPasos - 1}
          title={
            !completo
              ? `Completa ${esMovTiempo ? `${formatoCrono(objetivoPaso)} min` : `${objetivoPaso} ${unidad}`} para avanzar`
              : undefined
          }
          className="flex-1 min-h-[3rem] inline-flex items-center justify-center gap-1 rounded-xl border-2 border-hyrox-primary bg-hyrox-primary/12 text-hyrox-primary text-sm font-bold hover:bg-hyrox-primary/20 transition disabled:opacity-30 cursor-pointer"
        >
          {pasoSeguro >= totalPasos - 1 ? 'Último ejercicio' : 'Siguiente'}{' '}
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <p className="mt-3 text-center text-2xs text-hyrox-ghost font-mono">
        Total: {esMovTiempo ? `${formatoCrono(total)} min` : `${total} reps`} · Ronda {rondaIdx + 1}
        /{rondas}
      </p>
    </section>
  );
}
