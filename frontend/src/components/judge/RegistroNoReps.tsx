import { Undo2, XCircle } from 'lucide-react';

export interface NoRep {
  id: number;
  /** Momento en que se anoto: marca del cronometro o ronda. */
  marca: string;
  /** Efecto sobre el resultado, ya en texto ("+5 s", "-1 rep"). */
  efecto: string;
}

/**
 * Log de repeticiones invalidadas.
 *
 * Cada no-rep altera el resultado que se acaba enviando, asi que se listan una
 * a una con su marca de tiempo (el atleta puede reclamar) y se puede deshacer
 * la ultima: en una medicion real el juez se equivoca de boton con el movil en
 * la mano, y sin deshacer la unica salida seria reiniciar toda la medicion.
 */
export default function RegistroNoReps({
  entradas,
  resumen,
  onDeshacer,
}: {
  entradas: NoRep[];
  /** Total acumulado, ya formateado ("+15 s" / "-3 reps"). */
  resumen: string;
  onDeshacer: () => void;
}) {
  return (
    <section className="surface p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="eyebrow">No-reps</p>
        <div className="flex items-center gap-2">
          <span className={entradas.length > 0 ? 'badge-red' : 'badge-gray'}>{resumen}</span>
          {entradas.length > 0 && (
            <button
              type="button"
              onClick={onDeshacer}
              className="inline-flex items-center gap-1 text-2xs font-semibold text-hyrox-mist hover:text-hyrox-paper transition-colors cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
              Deshacer
            </button>
          )}
        </div>
      </div>

      {entradas.length === 0 ? (
        <p className="text-xs text-hyrox-ghost text-center py-3">Sin no-reps anotadas</p>
      ) : (
        // Las mas recientes arriba: es lo que el juez acaba de pulsar y lo
        // unico que puede deshacer.
        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
          {[...entradas].reverse().map((entrada, indice) => (
            <li
              key={entrada.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border-l-2 border-hyrox-danger"
            >
              <XCircle className="w-3.5 h-3.5 text-hyrox-danger shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-hyrox-paper">
                No-rep #{entradas.length - indice}
              </span>
              <span className="ml-auto font-mono text-2xs text-hyrox-mist">{entrada.marca}</span>
              <span className="font-mono text-2xs font-bold text-hyrox-danger">{entrada.efecto}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
