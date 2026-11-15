import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Download, ListChecks, RotateCcw, Trophy } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import AppShell from '../../components/layout/AppShell';
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  SkeletonList,
  Spinner,
  cx,
} from '../../components/ui';
import { formatearValor, unidadDeWod, type Asignacion, type Participante, type ResultadosPorCompetencia, type ResultadoFila, type Competencia } from '../../types';
import { csvResultadosCompetencia, descargarTexto, nombreArchivo } from '../../utils/export';
import { formatearCategorias } from '../../utils/formato';

/** Revision y correccion de mediciones. Resetear una la deja libre para medirla de nuevo. */
export default function ResultadosPage() {
  const { competenciaId } = useParams();
  return competenciaId ? <PanelResultados competenciaId={Number(competenciaId)} /> : <SelectorCompetencia />;
}

function SelectorCompetencia() {
  const navigate = useNavigate();
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .get<Competencia[]>('/competencias')
      .then((res) => setCompetencias(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCompetencias([]))
      .finally(() => setCargando(false));
  }, []);

  return (
    <AppShell title="Resultados" subtitle="Elige la competencia que quieres revisar">
      <section className="surface overflow-hidden max-w-2xl">
        <header className="panel-header">
          <h2 className="eyebrow">Competencias</h2>
        </header>

        {cargando ? (
          <SkeletonList rows={3} />
        ) : competencias.length === 0 ? (
          <EmptyState icon={ListChecks} title="No hay competencias" description="Crea una competencia para empezar a medir." />
        ) : (
          <ul className="divide-hairline">
            {competencias.map((competencia) => (
              <li key={competencia.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/admin/resultados/${competencia.id}`)}
                  className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-hyrox-primary/12 text-hyrox-primary shrink-0">
                    <ListChecks className="w-4.5 h-4.5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-hyrox-paper truncate">{competencia.nombre}</span>
                    <span className="block text-xs text-hyrox-mist">{competencia.wods?.length ?? 0} wods</span>
                    <span className="block text-2xs text-hyrox-ghost truncate">
                      Categorias: {formatearCategorias(competencia.divisiones)}
                    </span>
                  </span>
                  <span className="text-hyrox-ghost" aria-hidden="true">
                    &rsaquo;
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

function PanelResultados({ competenciaId }: { competenciaId: number }) {
  const navigate = useNavigate();

  const [competencia, setCompetencia] = useState<Competencia | null>(null);
  const [datos, setDatos] = useState<ResultadosPorCompetencia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [expandido, setExpandido] = useState<number | null>(null);

  const [aResetear, setAResetear] = useState<ResultadoFila | null>(null);
  const [reseteando, setReseteando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [competenciaRes, resultadosRes] = await Promise.all([
        api.get<Competencia>(`/competencias/${competenciaId}`),
        api.get<ResultadosPorCompetencia>(`/results/competencia/${competenciaId}`),
      ]);
      setCompetencia(competenciaRes.data);
      setDatos(resultadosRes.data);
      // Se abre el primer WOD: llegar a una lista toda cerrada obliga a
      // un clic extra para ver cualquier dato.
      setExpandido((prev) => prev ?? resultadosRes.data.wods?.[0]?.id ?? null);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar los resultados'));
    } finally {
      setCargando(false);
    }
  }, [competenciaId]);

  useEffect(() => {
    setCargando(true);
    cargar();
  }, [competenciaId, cargar]);

  async function resetear() {
    if (!aResetear) return;
    setReseteando(true);
    try {
      await api.post('/results/reset', {
        participante_id: aResetear.participante_id,
        wod_id: aResetear.wod_id,
      });
      setExito(`Medicion de ${aResetear.nombre} reseteada. Ya se puede volver a medir.`);
      setAResetear(null);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo resetear la medicion'));
    } finally {
      setReseteando(false);
    }
  }

  // Antes del `return` de carga: un hook detras de un return condicional se
  // salta en el primer render y React aborta la pagina en el segundo.
  const categorias = useMemo(() => construirCategorias(competencia?.divisiones ?? null, datos?.participantes ?? []), [competencia, datos]);

  /** Descarga las mediciones de la competencia en CSV (atleta, marca, puntos, estado y juez). */
  async function exportarCSV() {
    if (!competencia || !datos) return;
    setExportando(true);
    try {
      const [resAsig, resAtletas] = await Promise.all([
        api.get<Asignacion[]>(`/competencias/${competenciaId}/assignments`),
        api.get<Participante[]>('/users/participantes'),
      ]);
      descargarTexto(
        nombreArchivo(`resultados_${competencia.nombre}`, 'csv'),
        csvResultadosCompetencia(
          competencia.nombre,
          datos.wods ?? [],
          datos.participantes ?? [],
          Array.isArray(resAsig.data) ? resAsig.data : [],
          Array.isArray(resAtletas.data) ? resAtletas.data : []
        )
      );
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo exportar el CSV'));
    } finally {
      setExportando(false);
    }
  }

  if (cargando) {
    return (
      <AppShell title="Resultados">
        <Spinner />
      </AppShell>
    );
  }

  const wods = datos?.wods ?? [];

  return (
    <AppShell
      title={competencia?.nombre ?? 'Resultados'}
      subtitle="Revisa y corrige las mediciones registradas"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={Download} onClick={exportarCSV} loading={exportando} disabled={!datos}>
            <span className="hidden sm:inline">CSV</span>
          </Button>
          <Button variant="ghost" size="sm" icon={Trophy} onClick={() => navigate(`/leaderboard/${competenciaId}`)}>
            <span className="hidden sm:inline">Clasificacion</span>
          </Button>
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate('/admin/resultados')}>
            <span className="hidden sm:inline">Competencias</span>
          </Button>
        </div>
      }
    >
      <div className="max-w-4xl space-y-3">
        {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}
        {exito && <Alert tone="success" onDismiss={() => setExito('')}>{exito}</Alert>}

        {wods.length === 0 ? (
          <div className="surface">
            <EmptyState icon={ListChecks} title="Esta competencia no tiene WODs" />
          </div>
        ) : (
          wods.map((wod) => {
            const filas = (datos?.participantes ?? [])
              .filter((p) => p.wod_id === wod.id)
              .sort((a, b) => b.puntos_calculados - a.puntos_calculados);
            const abierto = expandido === wod.id;

            return (
              <section key={wod.id} className="surface overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandido(abierto ? null : wod.id)}
                  aria-expanded={abierto}
                  className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  <span className="grid place-items-center w-9 h-9 rounded-xl bg-hyrox-primary/12 shrink-0">
                    <span className="font-display text-base font-extrabold text-hyrox-primary">{wod.orden}</span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-hyrox-paper truncate">{wod.nombre_ejercicio}</span>
                    <span className="block text-2xs text-hyrox-mist">
                      {filas.length} mediciones · Max {wod.puntaje_maximo} pts
                    </span>
                  </span>
                  {abierto ? (
                    <ChevronUp className="w-4 h-4 text-hyrox-mist shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-hyrox-mist shrink-0" aria-hidden="true" />
                  )}
                </button>

                {abierto && (
                  <div className="border-t border-white/[0.06]">
                    {filas.length === 0 ? (
                      <p className="px-5 py-6 text-sm text-hyrox-mist text-center">
                        Todavia no hay mediciones en este WOD.
                      </p>
                    ) : (
                      <div className="divide-y divide-white/[0.06]">
                        {categorias.map((categoria) => {
                          const grupo = filas
                            .filter((fila) => claveCategoria(fila.categoria) === categoria.clave)
                            .sort((a, b) => b.puntos_calculados - a.puntos_calculados);

                          if (grupo.length === 0) return null;

                          return (
                            <section key={categoria.clave}>
                              <div className="px-4 sm:px-5 py-3 border-b border-white/[0.04] bg-white/[0.02] flex items-center justify-between gap-3">
                                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-hyrox-primary">
                                  {categoria.etiqueta}
                                </h3>
                                <span className="text-2xs text-hyrox-ghost">{grupo.length} mediciones</span>
                              </div>
                              <ul className="divide-hairline">
                                {grupo.map((fila, indice) => (
                                  <li key={fila.resultado_id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                                    <span className="w-7 text-center font-mono text-2xs font-bold text-hyrox-ghost shrink-0">
                                      {indice + 1}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                      <span className="block text-sm font-medium text-hyrox-paper truncate">
                                        {fila.nombre} {fila.apellidos}
                                      </span>
                                      <span className="block text-2xs text-hyrox-ghost font-mono">
                                        C.I. {fila.cedula}
                                      </span>
                                    </span>
                                    <span className="text-right shrink-0">
                                      <span
                                        className={cx(
                                          'block font-mono font-bold text-sm',
                                          fila.abandono ? 'text-hyrox-danger' : 'text-hyrox-paper'
                                        )}
                                      >
                                        {formatearValor(
                                          fila.valor_bruto,
                                          wod.tipo_medicion,
                                          fila.abandono,
                                          fila.capado,
                                          unidadDeWod(wod)
                                        )}
                                      </span>
                                      <span className="block text-2xs text-hyrox-primary font-mono">
                                        {fila.puntos_calculados} pts
                                      </span>
                                    </span>
                                    <span className="badge-gray hidden sm:inline-flex">
                                      {fila.categoria ?? categoria.etiqueta}
                                    </span>
                                    <IconButton
                                      icon={RotateCcw}
                                      label={`Resetear la medicion de ${fila.nombre}`}
                                      onClick={() => setAResetear(fila)}
                                      className="hover:text-hyrox-warning hover:bg-hyrox-warning/10"
                                    />
                                  </li>
                                ))}
                              </ul>
                            </section>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={aResetear !== null}
        title="Resetear medicion"
        message={`Se borrara el resultado de ${aResetear?.nombre ?? ''} ${aResetear?.apellidos ?? ''} en este WOD y el juez podra volver a medirlo. La clasificacion se recalcula al instante.`}
        confirmLabel="Resetear"
        tone="danger"
        loading={reseteando}
        onConfirm={resetear}
        onCancel={() => setAResetear(null)}
      />
    </AppShell>
  );
}

function claveCategoria(valor: string | null | undefined): string {
  const limpia = (valor ?? '').trim().toLowerCase();
  return limpia || '__sin_categoria__';
}

function construirCategorias(
  divisiones: string[] | null | undefined,
  participantes: ResultadoFila[]
): Array<{ clave: string; etiqueta: string }> {
  const mapa = new Map<string, string>();

  for (const division of divisiones ?? []) {
    const limpia = division.trim();
    if (limpia) mapa.set(limpia.toLowerCase(), limpia);
  }

  for (const fila of participantes) {
    const etiqueta = (fila.categoria ?? '').trim() || 'Sin categoria';
    const clave = claveCategoria(fila.categoria);
    if (!mapa.has(clave)) mapa.set(clave, etiqueta);
  }

  if (mapa.size === 0) mapa.set('__sin_categoria__', 'Sin categoria');

  return Array.from(mapa.entries()).map(([clave, etiqueta]) => ({ clave, etiqueta }));
}
