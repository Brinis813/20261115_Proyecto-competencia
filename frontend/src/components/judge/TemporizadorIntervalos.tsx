import { Play, RotateCcw, Square } from 'lucide-react';
import { useIntervalTimer, type ConfigIntervalos } from '../../hooks/useIntervalTimer';

/** Formatos habituales de intervalos. */
export const PRESETS: Record<string, { etiqueta: string; config: ConfigIntervalos }> = {
  emom: { etiqueta: 'EMOM 10', config: { segundosTrabajo: 60, segundosDescanso: 0, rondas: 10 } },
  tabata: {
    etiqueta: 'Tabata 8',
    config: { segundosTrabajo: 20, segundosDescanso: 10, rondas: 8 },
  },
  e2mom: {
    etiqueta: 'E2MOM 10',
    config: { segundosTrabajo: 120, segundosDescanso: 0, rondas: 10 },
  },
};

/**
 * Temporizador de intervalos (EMOM / Tabata) como ayuda de pacing.
 *
 * No define como se puntua el WOD: marca los cambios de fase con un
 * pitido para que el juez no tenga que llevar la cuenta mientras cuenta las
 * repeticiones. El resultado que se envia sigue saliendo del contador de reps.
 */
export default function TemporizadorIntervalos({
  config,
  onCambiarConfig,
  onRondaCompletada,
}: {
  config: ConfigIntervalos;
  onCambiarConfig: (config: ConfigIntervalos) => void;
  /** Se dispara al cerrar cada ronda, por si el padre acumula reps por ronda. */
  onRondaCompletada?: (ronda: number) => void;
}) {
  const { ronda, fase, segundosRestantes, enMarcha, terminado, start, stop, reset } =
    useIntervalTimer(config);

  const enDescanso = fase === 'descanso';
  // Ajustar la configuracion a mitad de una serie descuadraria el reloj.
  const bloqueado = enMarcha;

  return (
    <section className="surface-raised p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Intervalos</p>
        <span className={terminado ? 'badge-green' : enMarcha ? 'badge-orange' : 'badge-gray'}>
          {terminado ? 'Completado' : enMarcha ? `Ronda ${ronda}/${config.rondas}` : 'Listo'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(PRESETS).map(([clave, { etiqueta, config: preset }]) => (
          <button
            key={clave}
            type="button"
            disabled={bloqueado}
            onClick={() => onCambiarConfig(preset)}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-hyrox-paper text-xs font-bold hover:border-hyrox-primary/50 hover:text-hyrox-primary transition disabled:opacity-30 cursor-pointer"
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ['segundosTrabajo', 'Trabajo (s)', 5],
            ['segundosDescanso', 'Descanso (s)', 0],
            ['rondas', 'Rondas', 1],
          ] as const
        ).map(([clave, etiqueta, minimo]) => (
          <div key={clave}>
            <label htmlFor={`intervalo-${clave}`} className="label">
              {etiqueta}
            </label>
            <input
              id={`intervalo-${clave}`}
              type="number"
              min={minimo}
              inputMode="numeric"
              disabled={bloqueado}
              value={config[clave]}
              onChange={(e) =>
                onCambiarConfig({
                  ...config,
                  [clave]: Math.max(minimo, Number(e.target.value) || minimo),
                })
              }
              className="input-field font-mono text-center disabled:opacity-50"
            />
          </div>
        ))}
      </div>

      <div
        className={`rounded-2xl border p-6 text-center transition-colors ${
          enDescanso
            ? 'border-hyrox-danger/35 bg-hyrox-danger/[0.07]'
            : 'border-hyrox-accent/35 bg-hyrox-accent/[0.06]'
        }`}
      >
        <span className={enDescanso ? 'badge-red' : 'badge-green'}>
          {enDescanso ? 'Descanso' : 'Trabajo'}
        </span>
        <p
          className={`timer-display leading-none text-6xl sm:text-7xl mt-3 ${
            enDescanso ? 'text-hyrox-danger' : 'text-hyrox-accent'
          }`}
          role="timer"
          aria-live="off"
        >
          {segundosRestantes}
        </p>
        <p className="text-2xs text-hyrox-mist mt-2 uppercase tracking-eyebrow">
          Segundos restantes
        </p>
      </div>

      {/* Progreso de rondas. Por encima de 20 la fila de puntos se vuelve
          ilegible en un movil, asi que solo se muestra el contador. */}
      {config.rondas <= 20 ? (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {Array.from({ length: config.rondas }).map((_, indice) => {
            const numero = indice + 1;
            const completada = numero < ronda || terminado;
            const actual = numero === ronda && enMarcha;
            return (
              <span
                key={numero}
                title={`Ronda ${numero}`}
                className={`grid place-items-center w-8 h-8 rounded-full text-2xs font-bold border transition-colors ${
                  completada
                    ? 'bg-hyrox-accent border-hyrox-accent text-hyrox-void'
                    : actual
                      ? 'bg-hyrox-primary border-hyrox-primary text-white'
                      : 'border-white/10 bg-white/[0.02] text-hyrox-ghost'
                }`}
              >
                {numero}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-xs text-hyrox-mist font-mono">
          Ronda {ronda} de {config.rondas}
        </p>
      )}

      <div className="flex flex-wrap gap-3 justify-center">
        {!enMarcha ? (
          <button
            type="button"
            onClick={() => {
              reset();
              start();
            }}
            className="btn-success min-h-[3rem] px-6"
          >
            <Play className="w-5 h-5" aria-hidden="true" />
            {terminado ? 'Repetir' : 'Iniciar'}
          </button>
        ) : (
          <>
            <button type="button" onClick={stop} className="btn-danger min-h-[3rem] px-6">
              <Square className="w-5 h-5" aria-hidden="true" />
              Detener
            </button>
            {onRondaCompletada && (
              <button
                type="button"
                onClick={() => onRondaCompletada(ronda)}
                className="btn-secondary min-h-[3rem] px-5"
              >
                Cerrar ronda
              </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={reset}
          className="btn-secondary min-h-[3rem] px-5"
          aria-label="Reiniciar intervalos"
        >
          <RotateCcw className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
