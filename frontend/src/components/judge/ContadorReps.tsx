import { Minus, Plus, RotateCcw } from 'lucide-react';

/**
 * Contador de repeticiones a pantalla completa.
 *
 * Sustituye al campo de texto: el juez cuenta mirando al atleta, y teclear un
 * numero obliga a mirar el movil. Los botones son grandes y separados a
 * proposito porque se pulsan sin mirar y muchas veces con guantes.
 *
 * `onCambiar` recibe siempre el total ya calculado, nunca el incremento, para
 * que el padre sea la unica fuente de verdad del valor que se envia.
 */
export default function ContadorReps({
  valor,
  onCambiar,
  etiqueta = 'Repeticiones',
  deshabilitado,
}: {
  valor: number;
  onCambiar: (nuevo: number) => void;
  etiqueta?: string;
  deshabilitado?: boolean;
}) {
  // Nunca por debajo de cero: un total negativo no significa nada y ademas
  // rompe la puntuacion al enviarse.
  const sumar = (n: number) => onCambiar(Math.max(0, valor + n));

  return (
    <section className="surface-raised p-5 sm:p-7 text-center">
      <p className="eyebrow mb-4">{etiqueta}</p>

      <div className="flex items-center justify-center gap-5 sm:gap-8">
        <button
          type="button"
          onClick={() => sumar(-1)}
          disabled={deshabilitado || valor <= 0}
          aria-label="Restar una repeticion"
          className="grid place-items-center w-16 h-16 rounded-full border border-white/10 bg-white/[0.03] text-hyrox-paper hover:bg-white/[0.08] active:scale-90 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <Minus className="w-7 h-7" aria-hidden="true" />
        </button>

        <p
          className="timer-display leading-none text-6xl sm:text-7xl min-w-[4ch] select-none"
          role="status"
          aria-live="polite"
          aria-label={`${valor} repeticiones`}
        >
          {valor}
        </p>

        <button
          type="button"
          onClick={() => sumar(1)}
          disabled={deshabilitado}
          aria-label="Sumar una repeticion"
          className="grid place-items-center w-16 h-16 rounded-full border border-hyrox-primary/40 bg-hyrox-primary/15 text-hyrox-primary hover:bg-hyrox-primary/25 active:scale-90 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <Plus className="w-7 h-7" aria-hidden="true" />
        </button>
      </div>

      {/* Atajos para series largas: contar de 5 en 5 evita 60 pulsaciones. */}
      <div className="flex flex-wrap gap-2 justify-center mt-6">
        {[5, 10].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => sumar(n)}
            disabled={deshabilitado}
            className="px-4 py-2 rounded-xl border border-hyrox-primary/40 bg-hyrox-primary/12 text-hyrox-primary text-sm font-bold hover:bg-hyrox-primary/20 transition disabled:opacity-30 cursor-pointer"
          >
            +{n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onCambiar(0)}
          disabled={deshabilitado || valor === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-hyrox-mist text-sm font-bold hover:bg-white/[0.07] transition disabled:opacity-30 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          Poner a cero
        </button>
      </div>
    </section>
  );
}
