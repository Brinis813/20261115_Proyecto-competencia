import { Minus, Plus } from 'lucide-react';
import type { TipoMedicion, UnidadDistancia } from '../../types';
import { formatoCrono, unidadParaTipo } from '../../utils/unidadesMedicion';

export interface MovimientoObjetivo {
  nombre: string;
  /** Reps objetivo totales del movimiento (rondas x reps de la division). */
  objetivo: number;
  /** Carga prescrita a la categoria del atleta. 0 o ausente = sin carga. */
  peso?: number;
  /** Unidad de `peso`. */
  unidad_peso?: 'kg' | 'lb' | 'kcal' | 'cal';
  /** Tipo de medición individual del movimiento. */
  tipo_medicion?: TipoMedicion;
  /** Para distancia: unidad de medida. */
  unidad_distancia?: UnidadDistancia;
  /** Para distancia: valor de la distancia. */
  distancia?: number;
  /** Para tiempo: duración en segundos. */
  duracion_seg?: number;
  /** Para calorías: cantidad de calorías. */
  calorias?: number;
  /** Para calorías: unidad de energía. */
  unidad_energia?: 'kcal' | 'cal';
}

/**
 * Contador guiado por movimiento (la rejilla del scorecard de CrossFit).
 *
 * En lugar de un unico numero, el juez cuenta por movimiento y el componente
 * suma el total. Cada movimiento muestra su objetivo (segun la division del
 * atleta) y cuanto lleva, para no perder la cuenta. El padre es la fuente de
 * verdad: guarda el arreglo de conteos y de ahi salen el total y el detalle.
 *
 * Cada movimiento puede tener un `tipo_medicion` individual que determina
 * el tipo de control de entrada a mostrar (contador, campo numerico, etc.).
 */
export default function ContadorEsquema({
  movimientos,
  conteos,
  onCambiar,
  deshabilitado,
  permitirExceder,
}: {
  movimientos: MovimientoObjetivo[];
  conteos: number[];
  onCambiar: (conteos: number[]) => void;
  deshabilitado?: boolean;
  /** AMRAP: el atleta repite rondas, asi que el conteo puede superar el objetivo. */
  permitirExceder?: boolean;
}) {
  const total = conteos.reduce((a, b) => a + b, 0);
  const objetivoTotal = movimientos.reduce((a, m) => a + m.objetivo, 0);

  function ajustar(indice: number, delta: number) {
    const copia = [...conteos];
    const tope = permitirExceder ? Infinity : movimientos[indice]?.objetivo || Infinity;
    copia[indice] = Math.min(tope, Math.max(0, (copia[indice] || 0) + delta));
    onCambiar(copia);
  }

  function cambiarValor(indice: number, nuevoValor: number) {
    const copia = [...conteos];
    const tope = permitirExceder ? Infinity : movimientos[indice]?.objetivo || Infinity;
    copia[indice] = Math.min(tope, Math.max(0, nuevoValor));
    onCambiar(copia);
  }

  return (
    <section className="surface-raised p-4 sm:p-5">
      <div className="flex items-end justify-between mb-4">
        <p className="eyebrow">Conteo por movimiento</p>
        <p className="text-right">
          <span className="block font-mono text-3xl font-extrabold text-hyrox-paper leading-none">
            {total}
          </span>
          {objetivoTotal > 0 && (
            <span className="text-2xs text-hyrox-ghost">
              {permitirExceder ? `${objetivoTotal} reps / ronda` : `de ${objetivoTotal} reps`}
            </span>
          )}
        </p>
      </div>

      <div className="space-y-2.5">
        {movimientos.map((mov, i) => {
          const hecho = conteos[i] || 0;
          const completo = !permitirExceder && mov.objetivo > 0 && hecho >= mov.objetivo;
          const tipo = mov.tipo_medicion ?? 'repeticiones';
          const unidad = unidadParaTipo(tipo, mov.unidad_distancia, mov.unidad_energia);

          return (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-hyrox-paper truncate">
                  {mov.nombre || `Movimiento ${i + 1}`}
                  {/* La carga es de la categoria del atleta: el juez la
                      necesita a la vista para validar el movimiento. */}
                  {mov.peso ? (
                    <span className="ml-2 font-mono text-2xs font-bold text-hyrox-primary">
                      {mov.peso} {mov.unidad_peso ?? 'kg'}
                    </span>
                  ) : null}
                </span>
                {mov.objetivo > 0 && (
                  <span
                    className={`text-2xs ${completo ? 'text-hyrox-accent' : 'text-hyrox-ghost'}`}
                  >
                    {tipo === 'tiempo'
                      ? `${formatoCrono(hecho)} / ${formatoCrono(mov.objetivo)} min`
                      : `${hecho} / ${mov.objetivo} ${unidad}`}
                    {completo ? ' · completo' : ''}
                  </span>
                )}
              </span>

              {/* Campo de entrada segun tipo de medicion */}
              {tipo === 'distancia' ? (
                /* Distancia: campo numerico decimal */
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={hecho || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val >= 0) {
                        cambiarValor(i, val);
                      } else if (e.target.value === '') {
                        cambiarValor(i, 0);
                      }
                    }}
                    disabled={deshabilitado}
                    placeholder="0"
                    className="w-20 h-11 text-center font-mono text-lg font-bold text-hyrox-paper bg-white/[0.03] border border-white/10 rounded-lg focus:outline-none focus:border-hyrox-primary disabled:opacity-30"
                    aria-label={`${mov.nombre} - distancia en ${unidad}`}
                  />
                  <span className="text-2xs text-hyrox-ghost">{unidad}</span>
                </div>
              ) : tipo === 'peso' ? (
                /* Peso: botones +/- con incrementos de 1.25kg */
                <>
                  <button
                    type="button"
                    onClick={() => ajustar(i, -1.25)}
                    disabled={deshabilitado || hecho <= 0}
                    aria-label={`Restar en ${mov.nombre}`}
                    className="grid place-items-center w-11 h-11 rounded-lg border border-white/10 bg-white/[0.03] text-hyrox-paper hover:bg-white/[0.08] active:scale-90 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  >
                    <Minus className="w-5 h-5" aria-hidden="true" />
                  </button>
                  <span className="w-14 text-center font-mono text-lg font-bold text-hyrox-paper tabular-nums">
                    {hecho.toFixed(1)}
                  </span>
                  <button
                    type="button"
                    onClick={() => ajustar(i, 1.25)}
                    disabled={deshabilitado || completo}
                    aria-label={`Sumar en ${mov.nombre}`}
                    className="grid place-items-center w-11 h-11 rounded-lg border-2 border-hyrox-primary bg-hyrox-primary/12 text-hyrox-primary hover:bg-hyrox-primary/20 active:scale-90 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  >
                    <Plus className="w-5 h-5" aria-hidden="true" />
                  </button>
                </>
              ) : tipo === 'tiempo' ? (
                /* Tiempo: campo de entrada en segundos */
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={hecho || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 0) {
                        cambiarValor(i, val);
                      } else if (e.target.value === '') {
                        cambiarValor(i, 0);
                      }
                    }}
                    disabled={deshabilitado}
                    placeholder="0"
                    className="w-16 h-11 text-center font-mono text-lg font-bold text-hyrox-paper bg-white/[0.03] border border-white/10 rounded-lg focus:outline-none focus:border-hyrox-primary disabled:opacity-30"
                    aria-label={`${mov.nombre} - duración en segundos`}
                  />
                  <span className="text-2xs text-hyrox-ghost">
                    seg{hecho > 0 ? ` · ${formatoCrono(hecho)}` : ''}
                  </span>
                </div>
              ) : tipo === 'calorías' ? (
                /* Calorías: registro manual del total quemado (lo que marca la máquina) */
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={hecho || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 0) {
                        cambiarValor(i, val);
                      } else if (e.target.value === '') {
                        cambiarValor(i, 0);
                      }
                    }}
                    disabled={deshabilitado}
                    placeholder="0"
                    className="w-20 h-11 text-center font-mono text-lg font-bold text-hyrox-paper bg-white/[0.03] border border-white/10 rounded-lg focus:outline-none focus:border-hyrox-primary disabled:opacity-30"
                    aria-label={`${mov.nombre} - calorías quemadas en ${unidad}`}
                  />
                  <span className="text-2xs text-hyrox-ghost">{unidad}</span>
                </div>
              ) : (
                /* Repeticiones: contador +/- (por defecto) */
                <>
                  <button
                    type="button"
                    onClick={() => ajustar(i, -1)}
                    disabled={deshabilitado || hecho <= 0}
                    aria-label={`Restar en ${mov.nombre}`}
                    className="grid place-items-center w-11 h-11 rounded-lg border border-white/10 bg-white/[0.03] text-hyrox-paper hover:bg-white/[0.08] active:scale-90 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  >
                    <Minus className="w-5 h-5" aria-hidden="true" />
                  </button>
                  <span className="w-10 text-center font-mono text-xl font-bold text-hyrox-paper tabular-nums">
                    {hecho}
                  </span>
                  <button
                    type="button"
                    onClick={() => ajustar(i, 1)}
                    disabled={deshabilitado || completo}
                    aria-label={`Sumar en ${mov.nombre}`}
                    className="grid place-items-center w-11 h-11 rounded-lg border-2 border-hyrox-primary bg-hyrox-primary/12 text-hyrox-primary hover:bg-hyrox-primary/20 active:scale-90 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  >
                    <Plus className="w-5 h-5" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
