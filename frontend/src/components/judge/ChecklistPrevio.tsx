import { Check } from 'lucide-react';

/** Comprobaciones obligatorias antes de dar salida a un atleta. */
export const PUNTOS_CHECKLIST = [
  'Peso de la barra verificado',
  'Alturas y mediciones verificadas',
  'Camara colocada correctamente',
  'Atleta en posicion de inicio',
] as const;

/**
 * Checklist previo a la salida.
 *
 * Bloquea el boton de iniciar hasta que el juez confirma los cuatro puntos.
 * Es la parte del protocolo que mas se salta cuando se compite con prisa, y
 * una barra mal cargada invalida el resultado a posteriori.
 *
 * El estado vive en el padre porque tambien condiciona el boton de salida.
 */
export default function ChecklistPrevio({
  marcados,
  onCambiar,
  bloqueado,
}: {
  marcados: boolean[];
  onCambiar: (indice: number) => void;
  bloqueado?: boolean;
}) {
  const completos = marcados.filter(Boolean).length;
  const total = PUNTOS_CHECKLIST.length;
  const todoListo = completos === total;

  return (
    <section className="surface p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="eyebrow">Comprobaciones previas</p>
        <span className={todoListo ? 'badge-green' : 'badge-amber'}>
          {completos}/{total}
        </span>
      </div>

      <ul className="space-y-2">
        {PUNTOS_CHECKLIST.map((punto, indice) => {
          const marcado = marcados[indice];
          return (
            <li key={punto}>
              <label
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  bloqueado ? 'opacity-60' : 'cursor-pointer hover:bg-white/[0.04]'
                } ${marcado ? 'border-hyrox-accent/40 bg-hyrox-accent/[0.07]' : 'border-white/[0.06] bg-white/[0.02]'}`}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  disabled={bloqueado}
                  onChange={() => onCambiar(indice)}
                  className="sr-only"
                />
                <span
                  className={`grid place-items-center w-6 h-6 rounded-lg border shrink-0 transition-colors ${
                    marcado
                      ? 'bg-hyrox-accent border-hyrox-accent text-hyrox-void'
                      : 'border-white/15 text-transparent'
                  }`}
                  aria-hidden="true"
                >
                  <Check className="w-4 h-4" strokeWidth={3} />
                </span>
                <span className={`text-sm ${marcado ? 'text-hyrox-accent' : 'text-hyrox-paper'}`}>
                  {punto}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
