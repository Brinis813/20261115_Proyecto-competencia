import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Maximize2,
  Minimize2,
  Minus,
  Trophy,
  Users,
} from 'lucide-react';
import { useLiveLeaderboard } from '../../hooks/useLiveLeaderboard';
import { useLeaderboardStore, type EntradaConMovimiento } from '../../stores/leaderboardStore';
import { PublicHeader } from '../../components/layout/AppShell';
import { Alert, EmptyState, IconButton, SkeletonList, cx } from '../../components/ui';
import { formatearValor, unidadDeWod, ETIQUETA_TIEBREAK_COMPETENCIA, type LeaderboardWod } from '../../types';

const INTERVALO_ROTACION = 9000;

/**
 * Tablero de clasificacion en vivo.
 *
 * Los datos llegan por WebSocket a un store de Zustand: cuando un juez guarda
 * una medicion la tabla se reordena sola, sin recargar ni consultar en bucle.
 * Los atletas que cambian de puesto se resaltan un instante y muestran una
 * flecha con los puestos ganados o perdidos.
 */
export default function LeaderboardPage() {
  const { competenciaId: competenciaIdParam } = useParams();
  const navigate = useNavigate();
  const competenciaId = Number(competenciaIdParam);

  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [wodActivo, setWodActivo] = useState(0);
  const [rotacionAutomatica, setRotacionAutomatica] = useState(true);
  const [categoriaActiva, setCategoriaActiva] = useState(0);
  const [rotacionCategorias, setRotacionCategorias] = useState(true);

  useLiveLeaderboard(Number.isFinite(competenciaId) && competenciaId > 0 ? competenciaId : null);

  const entradas = useLeaderboardStore((s) => s.entradas);
  const wods = useLeaderboardStore((s) => s.wods);
  const competenciaNombre = useLeaderboardStore((s) => s.competenciaNombre);
  const competenciaDivisiones = useLeaderboardStore((s) => s.competenciaDivisiones);
  const competenciaTiebreak = useLeaderboardStore((s) => s.competenciaTiebreak);
  const cargando = useLeaderboardStore((s) => s.cargando);
  const error = useLeaderboardStore((s) => s.error);
  const actualizadoEn = useLeaderboardStore((s) => s.actualizadoEn);
  const resaltados = useLeaderboardStore((s) => s.resaltados);
  const limpiarResaltados = useLeaderboardStore((s) => s.limpiarResaltados);

  // El resaltado es un destello, no un estado: se apaga solo.
  useEffect(() => {
    if (resaltados.size === 0) return;
    const t = setTimeout(limpiarResaltados, 1600);
    return () => clearTimeout(t);
  }, [resaltados, limpiarResaltados]);

  // Rotacion del panel de wods, para dejar la pantalla desatendida.
  useEffect(() => {
    if (!rotacionAutomatica || wods.length < 2) return;
    const t = setInterval(() => {
      setWodActivo((prev) => (prev + 1) % wods.length);
    }, INTERVALO_ROTACION);
    return () => clearInterval(t);
  }, [rotacionAutomatica, wods.length]);

  // Si se elimina un WOD, el indice podria quedar fuera de rango.
  useEffect(() => {
    if (wodActivo >= wods.length) setWodActivo(0);
  }, [wods.length, wodActivo]);

  const categorias = useMemo(() => construirCategorias(entradas, competenciaDivisiones), [entradas, competenciaDivisiones]);
  const categoria = categorias[categoriaActiva] ?? categorias[0] ?? { clave: '__sin_categoria__', etiqueta: 'Sin categoria' };
  const entradasCategoria = useMemo(
    () => entradas.filter((e) => claveCategoria(e.categoria) === categoria.clave),
    [entradas, categoria.clave]
  );
  const conResultadosCategoria = useMemo(
    () => entradasCategoria.filter((e) => e.wods_completados > 0).length,
    [entradasCategoria]
  );

  useEffect(() => {
    if (categoriaActiva >= categorias.length) setCategoriaActiva(0);
  }, [categorias.length, categoriaActiva]);

  useEffect(() => {
    if (!rotacionCategorias || categorias.length < 2) return;
    const t = setInterval(() => {
      setCategoriaActiva((prev) => (prev + 1) % categorias.length);
    }, INTERVALO_ROTACION);
    return () => clearInterval(t);
  }, [rotacionCategorias, categorias.length]);

  const wod = wods[wodActivo] ?? null;

  const conResultados = useMemo(
    () => entradas.filter((e) => e.wods_completados > 0).length,
    [entradas]
  );

  if (!Number.isFinite(competenciaId) || competenciaId <= 0) {
    return (
      <div className="min-h-screen bg-hyrox-void">
        <PublicHeader />
        <div className="max-w-lg mx-auto px-4 py-16">
          <Alert tone="error">El identificador de la competencia no es valido.</Alert>
        </div>
      </div>
    );
  }

  return (
    <div className={cx('min-h-screen bg-hyrox-void', pantallaCompleta && 'fixed inset-0 z-40 overflow-y-auto')}>
      {!pantallaCompleta && (
        <PublicHeader
          actions={
            <IconButton
              icon={Maximize2}
              label="Modo pantalla de evento"
              onClick={() => setPantallaCompleta(true)}
            />
          }
        />
      )}

      <main className="px-3 sm:px-5 py-5 max-w-[1600px] mx-auto pb-safe">
        {/* ---------- Titulo ---------- */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            {!pantallaCompleta && (
              <button
                type="button"
                onClick={() => navigate('/inicio')}
                className="inline-flex items-center gap-1.5 mb-2 text-xs font-semibold text-hyrox-mist hover:text-hyrox-paper transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Todos las competencias
              </button>
            )}
            <h1
              className={cx(
                'font-display font-extrabold tracking-display text-hyrox-paper leading-none truncate',
                pantallaCompleta ? 'text-4xl sm:text-6xl' : 'text-3xl sm:text-4xl'
              )}
            >
              {competenciaNombre ?? 'Clasificacion'}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-hyrox-mist">
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                {entradas.length} atletas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                {conResultados} con resultados
              </span>
              <IndicadorEnVivo actualizadoEn={actualizadoEn} />
              {competenciaTiebreak && (
                <span className="badge-gray" title="Criterio aplicado a los empates en esta competencia">
                  Desempate: {ETIQUETA_TIEBREAK_COMPETENCIA[competenciaTiebreak] ?? competenciaTiebreak}
                </span>
              )}
            </div>
            {categorias.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-2xs uppercase tracking-[0.18em] text-hyrox-ghost">Categorias</span>
                {categorias.map((item, indice) => (
                  <button
                    key={item.clave}
                    type="button"
                    onClick={() => {
                      setCategoriaActiva(indice);
                      setRotacionCategorias(false);
                    }}
                    className={cx(
                      'badge-gray cursor-pointer transition-colors',
                      indice === categoriaActiva && 'bg-hyrox-primary/20 text-hyrox-paper border-hyrox-primary/30'
                    )}
                  >
                    {item.etiqueta}
                  </button>
                ))}
                {categorias.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRotacionCategorias((v) => !v)}
                    className="text-2xs font-semibold text-hyrox-mist hover:text-hyrox-paper transition-colors cursor-pointer"
                  >
                    {rotacionCategorias ? 'Pausar categorias' : 'Rotar categorias'}
                  </button>
                )}
              </div>
            )}
          </div>

          {pantallaCompleta && (
            <IconButton icon={Minimize2} label="Salir de pantalla completa" onClick={() => setPantallaCompleta(false)} />
          )}
        </div>

        {error && (
          <div className="mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {/* ---------- Paneles ---------- */}
        {/* En escritorio los paneles llenan el alto disponible: esta vista se
            proyecta en la pantalla del evento y el espacio vacio se nota. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem] lg:min-h-[calc(100vh-13rem)] lg:items-stretch">
          <section className="surface overflow-hidden flex flex-col">
            <header className="panel-header">
              <div>
                <h2 className="eyebrow">Clasificacion general</h2>
                <p className="text-2xs text-hyrox-ghost mt-0.5">Categoria: {categoria.etiqueta}</p>
              </div>
              {wods.length > 0 && (
                <span className="text-2xs text-hyrox-ghost">{wods.length} wods</span>
              )}
            </header>

            {cargando ? (
              <SkeletonList rows={6} />
            ) : entradas.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="Aun no hay atletas inscritos"
                description="Cuando el administrador asigne participantes a esta competencia apareceran aqui."
              />
            ) : entradasCategoria.length === 0 ? (
              <EmptyState icon={Users} title="Sin atletas en esta categoria" description="Cambia de categoria." />
            ) : (
              <TablaGeneral
                entradas={entradasCategoria}
                resaltados={resaltados}
                grande={pantallaCompleta}
                categoria={categoria.etiqueta}
                conResultados={conResultadosCategoria}
              />
            )}
          </section>

          <section className="surface overflow-hidden flex flex-col">
            <header className="panel-header">
              <h2 className="eyebrow">Resultados por WOD</h2>
              {wods.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRotacionAutomatica((v) => !v)}
                  className="text-2xs font-semibold text-hyrox-mist hover:text-hyrox-paper transition-colors cursor-pointer"
                >
                  {rotacionAutomatica ? 'Pausar rotacion' : 'Rotar automatico'}
                </button>
              )}
            </header>

            {wod ? (
              <PanelWod
                wod={wod}
                indice={wodActivo}
                total={wods.length}
                entradas={entradas}
                categorias={categorias}
                onSeleccionar={(i) => {
                  setWodActivo(i);
                  // Elegir un WOD a mano detiene la rotacion: si no,
                  // se movería sola a los pocos segundos.
                  setRotacionAutomatica(false);
                }}
              />
            ) : (
              <EmptyState icon={Clock} title="Esta competencia no tiene WODs" />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function IndicadorEnVivo({ actualizadoEn }: { actualizadoEn: number | null }) {
  const [, refrescar] = useState(0);

  // Se vuelve a pintar cada 10 s para que "hace X" no se quede congelado.
  useEffect(() => {
    const t = setInterval(() => refrescar((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  if (!actualizadoEn) return null;

  const segundos = Math.floor((Date.now() - actualizadoEn) / 1000);
  const texto =
    segundos < 15 ? 'ahora mismo' : segundos < 60 ? `hace ${segundos}s` : `hace ${Math.floor(segundos / 60)} min`;

  return (
    <span className="inline-flex items-center gap-1.5" role="status">
      <span className="w-1.5 h-1.5 rounded-full bg-hyrox-accent animate-pulse-dot" aria-hidden="true" />
      Actualizado {texto}
    </span>
  );
}

function claveCategoria(valor: string | null | undefined): string {
  const limpia = (valor ?? '').trim().toLowerCase();
  return limpia || '__sin_categoria__';
}

function etiquetaCategoria(valor: string | null | undefined): string {
  const limpia = (valor ?? '').trim();
  return limpia || 'Sin categoria';
}

function construirCategorias(
  entradas: EntradaConMovimiento[],
  divisiones?: string[] | null
): Array<{ clave: string; etiqueta: string }> {
  const mapa = new Map<string, string>();

  for (const division of divisiones ?? []) {
    const limpia = division.trim();
    if (limpia) mapa.set(limpia.toLowerCase(), limpia);
  }

  for (const entrada of entradas) {
    const clave = claveCategoria(entrada.categoria);
    const etiqueta = etiquetaCategoria(entrada.categoria);
    if (!mapa.has(clave)) mapa.set(clave, etiqueta);
  }

  if (mapa.size === 0) mapa.set('__sin_categoria__', 'Sin categoria');

  return Array.from(mapa.entries()).map(([clave, etiqueta]) => ({ clave, etiqueta }));
}

/** Fila memorizada del leaderboard: solo re-renderiza si sus props cambiaron. */
const FilaRow = React.memo(function FilaRow({
  entrada,
  resaltado,
  grande,
}: {
  entrada: EntradaConMovimiento;
  resaltado: boolean;
  grande: boolean;
}) {
  return (
    <tr
      className={cx(
        'transition-colors duration-300',
        resaltado && 'animate-flash-row',
        entrada.puesto === 1 && 'bg-hyrox-primary/[0.06]'
      )}
    >
      <td className="px-3 py-3">
        <Puesto
          puesto={entrada.puesto}
          movimiento={entrada.movimiento}
          delta={entrada.delta}
          podio={entrada.puntos_total > 0}
        />
      </td>

      <td className="px-2 py-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cx(
              'font-semibold truncate',
              grande ? 'text-lg' : 'text-sm',
              entrada.puesto === 1 ? 'text-hyrox-paper' : 'text-hyrox-paper/90'
            )}
          >
            {entrada.nombre} {entrada.apellidos}
          </span>
          {entrada.wods_completados === 0 && <span className="badge-gray">Sin medir</span>}
          {entrada.comparte_puesto && entrada.puntos_total > 0 && (
            <span className="badge-gray" title="Comparte puesto y puntos por empate">
              Empate
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-2xs text-hyrox-ghost">
          {entrada.box && <span className="truncate">{entrada.box}</span>}
          {entrada.categoria && (
            <>
              <span aria-hidden="true">&middot;</span>
              <span className="truncate">{entrada.categoria}</span>
            </>
          )}
        </div>
      </td>

      <td className="px-3 py-3 text-right whitespace-nowrap">
        <span
          className={cx(
            'font-mono font-bold text-hyrox-primary tabular-nums',
            grande ? 'text-2xl' : entrada.puesto === 1 ? 'text-xl' : 'text-base'
          )}
        >
          {entrada.puntos_total}
        </span>
        <span className="ml-1 text-2xs text-hyrox-ghost">pts</span>
      </td>
    </tr>
  );
});

function TablaGeneral({
  entradas,
  resaltados,
  grande,
  categoria,
  conResultados,
}: {
  entradas: EntradaConMovimiento[];
  resaltados: Set<number>;
  grande: boolean;
  categoria: string;
  conResultados: number;
}) {
  return (
    <div className="scroll-x overflow-y-auto flex-1">
      <table className="w-full min-w-[22rem]">
        <caption className="sr-only">Clasificacion general de la competencia para la categoria {categoria}, ordenada por puntos</caption>
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <th scope="col" className="w-14 px-3 py-2.5 text-left eyebrow">
              #
            </th>
            <th scope="col" className="px-2 py-2.5 text-left eyebrow">
              Atleta
            </th>
            <th scope="col" className="w-24 px-3 py-2.5 text-right eyebrow">
              Puntos
            </th>
          </tr>
        </thead>
        <tbody className="divide-hairline">
          {entradas.map((entrada) => (
            <FilaRow
              key={entrada.participante_id}
              entrada={entrada}
              resaltado={resaltados.has(entrada.participante_id)}
              grande={grande}
            />
          ))}
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <td className="px-3 py-2.5 text-2xs text-hyrox-ghost" colSpan={3}>
              {entradas.length} atletas · {conResultados} con resultados · {categoria}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const COLOR_PODIO: Record<number, string> = {
  1: 'bg-hyrox-gold/15 text-hyrox-gold border-hyrox-gold/30',
  2: 'bg-hyrox-silver/12 text-hyrox-silver border-hyrox-silver/25',
  3: 'bg-hyrox-bronze/15 text-hyrox-bronze border-hyrox-bronze/30',
};

function Puesto({
  puesto,
  movimiento,
  delta,
  podio = true,
}: {
  puesto: number;
  movimiento: EntradaConMovimiento['movimiento'];
  delta: number;
  podio?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={cx(
          'grid place-items-center w-8 h-8 rounded-lg border font-mono font-bold text-sm tabular-nums',
          (podio && COLOR_PODIO[puesto]) || 'bg-white/[0.04] text-hyrox-mist border-white/[0.06]'
        )}
      >
        {puesto}
      </span>

      {/* El movimiento no se comunica solo con color: lleva flecha y texto. */}
      {movimiento === 'sube' && (
        <span className="flex items-center text-hyrox-accent text-2xs font-bold" title={`Sube ${delta} puestos`}>
          <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          {delta}
          <span className="sr-only">puestos ganados</span>
        </span>
      )}
      {movimiento === 'baja' && (
        <span className="flex items-center text-hyrox-danger text-2xs font-bold" title={`Baja ${delta} puestos`}>
          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          {delta}
          <span className="sr-only">puestos perdidos</span>
        </span>
      )}
      {movimiento === 'igual' && <Minus className="w-3 h-3 text-hyrox-ghost/40" aria-hidden="true" />}
    </span>
  );
}

function PanelWod({
  wod,
  indice,
  total,
  entradas,
  categorias,
  onSeleccionar,
}: {
  wod: LeaderboardWod;
  indice: number;
  total: number;
  entradas: EntradaConMovimiento[];
  categorias: Array<{ clave: string; etiqueta: string }>;
  onSeleccionar: (indice: number) => void;
}) {
  // Dentro de un WOD se ordena por su posicion, no por el total general.
  const filas = useMemo(() => {
    return entradas
      .map((entrada) => ({
        entrada,
        resultado: entrada.resultados.find((r) => r.wod_id === wod.id) ?? null,
      }))
      .sort((a, b) => {
        const pa = a.resultado?.posicion ?? Number.MAX_SAFE_INTEGER;
        const pb = b.resultado?.posicion ?? Number.MAX_SAFE_INTEGER;
        return pa - pb;
      });
  }, [entradas, wod.id]);

  const filasPorCategoria = useMemo(() => {
    const porCategoria = new Map<string, typeof filas>();
    for (const fila of filas) {
      const clave = claveCategoria(fila.entrada.categoria);
      const lista = porCategoria.get(clave) ?? [];
      lista.push(fila);
      porCategoria.set(clave, lista);
    }

    return categorias
      .map((categoria) => ({
        ...categoria,
        filas: porCategoria.get(categoria.clave) ?? [],
      }))
      .filter((grupo) => grupo.filas.length > 0);
  }, [filas, categorias]);

  return (
    <>
      <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] bg-white/[0.02]">
        {wod.imagen_url && (
          <img
            src={wod.imagen_url}
            alt=""
            className="w-full max-h-44 object-cover rounded-xl border border-white/[0.08] mb-3"
          />
        )}
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-hyrox-primary/12 shrink-0">
            <span className="font-display text-lg font-extrabold text-hyrox-primary">{wod.orden}</span>
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-bold text-hyrox-paper leading-tight truncate">
              {wod.nombre_ejercicio}
            </h3>
            <p className="text-2xs text-hyrox-mist">
              {wod.tipo_medicion === 'tiempo'
                ? 'Menor tiempo gana'
                : wod.tipo_medicion === 'peso'
                  ? 'Mayor peso gana'
                  : 'Mayor cantidad gana'}
              {' · '}
              Max {wod.puntaje_maximo} pts
            </p>
          </div>
        </div>

        {/* Los indicadores tambien sirven para saltar a un WOD concreto. */}
        {total > 1 && (
          <div className="flex gap-1.5 mt-3.5" role="tablist" aria-label="Wods">
            {Array.from({ length: total }).map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === indice}
                aria-label={`WOD ${i + 1}`}
                onClick={() => onSeleccionar(i)}
                className="flex-1 py-2 -my-2 group cursor-pointer"
              >
                <span
                  className={cx(
                    'block h-1 rounded-full transition-all duration-500',
                    i === indice ? 'bg-hyrox-primary' : 'bg-white/[0.1] group-hover:bg-white/25'
                  )}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="divide-hairline overflow-y-auto flex-1 max-h-[60vh] lg:max-h-none">
        {filas.length === 0 ? (
          <EmptyState icon={Clock} title="Sin atletas" />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {filasPorCategoria.map((grupo) => (
              <section key={grupo.clave}>
                <div className="px-4 sm:px-5 py-3 border-b border-white/[0.04] bg-white/[0.02] flex items-center justify-between gap-3">
                  <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-hyrox-primary">{grupo.etiqueta}</h4>
                  <span className="text-2xs text-hyrox-ghost">{grupo.filas.length} atletas</span>
                </div>
                {grupo.filas.map(({ entrada, resultado }) => {
                  const medido = Boolean(resultado?.valor_bruto);
                  return (
                    <div key={entrada.participante_id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                      <span
                        className={cx(
                          'grid place-items-center w-7 h-7 rounded-lg font-mono font-bold text-2xs tabular-nums shrink-0',
                          resultado?.posicion && resultado.posicion <= 3 && medido
                            ? COLOR_PODIO[resultado.posicion]
                            : 'bg-white/[0.04] text-hyrox-ghost'
                        )}
                      >
                        {medido ? resultado!.posicion : '–'}
                      </span>

                      <span className="flex-1 min-w-0 text-sm font-medium text-hyrox-paper truncate">
                        {entrada.nombre} {entrada.apellidos}
                      </span>

                      <span
                        className={cx(
                          'font-mono text-sm font-bold tabular-nums shrink-0',
                          resultado?.abandono ? 'text-hyrox-danger' : medido ? 'text-hyrox-paper' : 'text-hyrox-ghost/40'
                        )}
                      >
                        {formatearValor(
                          resultado?.valor_bruto ?? null,
                          wod.tipo_medicion,
                          resultado?.abandono,
                          resultado?.capado,
                          unidadDeWod(wod)
                        )}
                      </span>

                      <span className="w-14 text-right shrink-0">
                        <span
                          className={cx(
                            'font-mono text-sm font-bold tabular-nums',
                            medido ? 'text-hyrox-primary' : 'text-hyrox-ghost/40'
                          )}
                        >
                          {resultado?.puntos_calculados ?? 0}
                        </span>
                        <span className="ml-0.5 text-2xs text-hyrox-ghost">pts</span>
                      </span>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
