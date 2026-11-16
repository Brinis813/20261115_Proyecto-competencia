import { Check, Minus, Plus, X } from 'lucide-react';

export interface IntentoPeso {
  peso: number;
  valido: boolean;
  /** Peso de la barra usada en el intento (kg). */
  barra?: number;
  /** Discos cargados por lado, tal cual los anotó el juez (ej. "25 + 15"). */
  discos?: string;
}

/** Barra olímpica por defecto (kg) cuando el juez no indica otra. */
export const BARRA_POR_DEFECTO = 20;

/** Intentos permitidos en una prueba de carga maxima. */
export const MAX_INTENTOS = 3;

const KG_POR_LIBRA = 0.453592;

/** Discos habituales: sube de 1.25 en 1.25 porque es el disco mas pequeno. */
const INCREMENTOS = [1.25, 2.5, 5, 10, 20];

/**
 * Calcula la carga total desde el equipo: barra + 2 × (discos por lado).
 * Acepta "25 + 15", "25x10" o "25, 10": lo no numérico se ignora.
 * null = no hay discos válidos que sumar.
 */
export function totalDesdeEquipo(barraKg: number, discosTexto: string): number | null {
  const partes = discosTexto
    .split(/[+×x*,;]/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (partes.length === 0) return null;
  return Math.round((Math.max(0, barraKg) + 2 * partes.reduce((a, b) => a + b, 0)) * 100) / 100;
}

/**
 * Registro de intentos de carga maxima al estilo halterofilia.
 *
 * El atleta dispone de N intentos (configurables) y el resultado es el mejor
 * peso valido, no el ultimo: fallar el siguiente no puede borrar uno bueno.
 * Por eso el componente conserva el historico completo en lugar de un unico
 * numero. Cada intento guarda además la barra y los discos usados, que viajan
 * en el detalle para auditoría.
 *
 * El estado vive en el padre porque el mejor peso es el valor que se envia.
 */
export default function IntentosPeso({
  intentos,
  peso,
  onCambiarPeso,
  onRegistrar,
  onDeshacer,
  unidad = 'kg',
  maxIntentos = MAX_INTENTOS,
  deshabilitado,
  barra,
  onCambiarBarra,
  discos,
  onCambiarDiscos,
}: {
  intentos: IntentoPeso[];
  peso: number;
  onCambiarPeso: (n: number) => void;
  onRegistrar: (valido: boolean) => void;
  onDeshacer: () => void;
  unidad?: string;
  /** Numero de intentos permitidos (por defecto MAX_INTENTOS). */
  maxIntentos?: number;
  /** Pausa global del admin: congela el registro sin perder lo anotado. */
  deshabilitado?: boolean;
  /** Peso de la barra en uso (kg). El padre la conserva entre atletas. */
  barra: number;
  onCambiarBarra: (n: number) => void;
  /** Discos por lado tal cual los anota el juez (ej. "25 + 15"). */
  discos: string;
  onCambiarDiscos: (s: string) => void;
}) {
  const usados = intentos.length;
  const quedanIntentos = usados < maxIntentos;
  const mejor = intentos.filter((i) => i.valido).reduce((max, i) => Math.max(max, i.peso), 0);

  // Sumar 1.25 en coma flotante acumula restos (41.25000000000001) que
  // acabarian viajando tal cual en el resultado enviado.
  const ajustar = (delta: number) =>
    onCambiarPeso(Math.max(0, Math.round((peso + delta) * 100) / 100));

  return (
    <>
      <section className="surface p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="eyebrow">Intentos</p>
          <div className="flex items-center gap-2">
            <span className={usados >= maxIntentos ? 'badge-amber' : 'badge-gray'}>
              {usados}/{maxIntentos}
            </span>
            {usados > 0 && (
              <button
                type="button"
                onClick={onDeshacer}
                disabled={deshabilitado}
                className="text-2xs font-semibold text-hyrox-mist hover:text-hyrox-paper transition-colors cursor-pointer disabled:opacity-30"
              >
                Deshacer
              </button>
            )}
          </div>
        </div>

        <ul className="space-y-2">
          {Array.from({ length: maxIntentos }).map((_, indice) => {
            const intento = intentos[indice];
            const esActual = indice === usados;

            return (
              <li
                key={indice}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                  esActual
                    ? 'border-hyrox-primary/40 bg-hyrox-primary/[0.07]'
                    : 'border-white/[0.06] bg-white/[0.02]'
                }`}
              >
                <span className="font-bold text-hyrox-mist text-sm w-7 shrink-0">
                  #{indice + 1}
                </span>
                <span className="min-w-0">
                  <span className="font-mono font-bold text-hyrox-paper block">
                    {intento ? `${intento.peso} ${unidad}` : esActual ? `${peso} ${unidad}` : '--'}
                  </span>
                  {intento && (intento.barra != null || intento.discos) && (
                    <span className="block text-2xs text-hyrox-ghost truncate">
                      {intento.barra != null ? `barra ${intento.barra}` : 'barra ?'}
                      {intento.discos ? ` · ${intento.discos} p/lado` : ''}
                    </span>
                  )}
                </span>
                <span className="ml-auto shrink-0">
                  {intento ? (
                    <span className={intento.valido ? 'badge-green' : 'badge-red'}>
                      {intento.valido ? 'Valido' : 'Nulo'}
                    </span>
                  ) : (
                    <span className="badge-gray">{esActual ? 'En curso' : 'Pendiente'}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {quedanIntentos && (
        <section className="surface-raised p-5 text-center">
          <p className="eyebrow mb-4">Carga del intento {usados + 1}</p>

          <div className="flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={() => ajustar(-1.25)}
              disabled={deshabilitado || peso <= 0}
              aria-label="Bajar la carga"
              className="grid place-items-center w-14 h-14 rounded-full border border-white/10 bg-white/[0.03] text-hyrox-paper hover:bg-white/[0.08] active:scale-90 transition disabled:opacity-30 cursor-pointer"
            >
              <Minus className="w-6 h-6" aria-hidden="true" />
            </button>

            <div className="min-w-[6ch]">
              <p className="timer-display leading-none text-5xl sm:text-6xl select-none">{peso}</p>
              <p className="text-2xs text-hyrox-mist mt-1 uppercase tracking-wide">
                {unidad}
                {/* Muchas tablas de referencia siguen en libras. */}
                {unidad === 'kg' && peso > 0 && ` · ${Math.round(peso / KG_POR_LIBRA)} lb`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => ajustar(1.25)}
              disabled={deshabilitado}
              aria-label="Subir la carga"
              className="grid place-items-center w-14 h-14 rounded-full border border-hyrox-primary/40 bg-hyrox-primary/15 text-hyrox-primary hover:bg-hyrox-primary/25 active:scale-90 transition cursor-pointer"
            >
              <Plus className="w-6 h-6" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2 justify-center mt-5">
            {INCREMENTOS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => ajustar(n)}
                disabled={deshabilitado}
                className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-hyrox-paper text-xs font-bold hover:border-hyrox-primary/50 hover:text-hyrox-primary transition cursor-pointer"
              >
                +{n}
              </button>
            ))}
          </div>

          {/* Equipo en uso: barra y discos por lado. Queda anotado en cada
              intento que se registre y viaja en el detalle. */}
          <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left">
            <p className="eyebrow mb-2">Equipo · barra y discos</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col">
                <span className="text-2xs text-hyrox-ghost mb-0.5">Barra (kg)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  value={barra}
                  onChange={(e) => onCambiarBarra(Math.max(0, Number(e.target.value) || 0))}
                  disabled={deshabilitado}
                  className="input-field text-center"
                  aria-label="Peso de la barra en kilogramos"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-2xs text-hyrox-ghost mb-0.5">Discos por lado</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={discos}
                  onChange={(e) => onCambiarDiscos(e.target.value)}
                  disabled={deshabilitado}
                  placeholder="25 + 15"
                  maxLength={30}
                  className="input-field text-center"
                  aria-label="Discos por lado, por ejemplo 25 más 15"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const total = totalDesdeEquipo(barra, discos);
                if (total !== null && total > 0) onCambiarPeso(total);
              }}
              disabled={deshabilitado || totalDesdeEquipo(barra, discos) === null}
              className="mt-2 w-full min-h-[2.5rem] rounded-lg border border-hyrox-primary/40 bg-hyrox-primary/10 text-hyrox-primary text-xs font-bold hover:bg-hyrox-primary/20 transition disabled:opacity-30 cursor-pointer"
            >
              Usar total en la carga
              {totalDesdeEquipo(barra, discos) !== null &&
                ` (${totalDesdeEquipo(barra, discos)} ${unidad})`}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-6">
            <button
              type="button"
              onClick={() => onRegistrar(true)}
              disabled={deshabilitado || peso <= 0}
              className="min-h-[3.25rem] rounded-xl border-2 border-hyrox-accent bg-hyrox-accent/12 text-hyrox-accent font-bold uppercase tracking-wide text-sm inline-flex items-center justify-center gap-2 hover:bg-hyrox-accent/20 active:scale-95 transition disabled:opacity-30 cursor-pointer"
            >
              <Check className="w-5 h-5" aria-hidden="true" />
              Valido
            </button>
            <button
              type="button"
              onClick={() => onRegistrar(false)}
              disabled={deshabilitado || peso <= 0}
              className="min-h-[3.25rem] rounded-xl border-2 border-hyrox-danger bg-hyrox-danger/12 text-hyrox-danger font-bold uppercase tracking-wide text-sm inline-flex items-center justify-center gap-2 hover:bg-hyrox-danger/20 active:scale-95 transition disabled:opacity-30 cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
              Nulo
            </button>
          </div>
        </section>
      )}

      <section className="surface p-4 flex items-center justify-between gap-3">
        <span className="eyebrow">Mejor levantamiento</span>
        <span className="font-mono text-2xl font-bold text-hyrox-primary">
          {mejor > 0 ? `${mejor} ${unidad}` : '--'}
        </span>
      </section>
    </>
  );
}
