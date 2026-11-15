import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ListX, Timer, Trophy } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import AppShell from '../../components/layout/AppShell';
import { Alert, Button, EmptyState, SkeletonList } from '../../components/ui';
import { ETIQUETA_MEDICION, unidadDeWod, type Competencia } from '../../types';
import { formatearCategorias } from '../../utils/formato';

/** Meta de distancia del WOD (número único o matriz por categoría). */
function textoMetaDistancia(wod: { esquema?: { distancia_meta?: unknown } | null; unidad_distancia?: string | null }): string {
  const meta = wod.esquema?.distancia_meta;
  const unidad = wod.unidad_distancia ?? 'm';
  if (typeof meta === 'number') return meta > 0 ? `meta ${meta} ${unidad}` : '';
  if (meta && typeof meta === 'object') {
    const partes = Object.entries(meta as Record<string, unknown>)
      .map(([k, v]) => ({ k, n: Number(v) || 0 }))
      .filter((e) => e.n > 0)
      .map((e) => `${e.k}: ${e.n} ${unidad}`);
    return partes.length > 0 ? `metas ${partes.join(' · ')}` : '';
  }
  return '';
}

/** Paso 2 del flujo del juez: elegir el WOD dentro de la competencia. */
export default function JuezWodsPage() {
  const { competenciaId } = useParams();
  const navigate = useNavigate();

  const [competencia, setCompetencia] = useState<Competencia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Se usa el listado del juez porque valida en el servidor que este
    // asignado a esa competencia; entrar por URL a uno ajeno no funciona.
    api
      .get<Competencia[]>('/competencias/judge')
      .then((res) => {
        const encontrado = (Array.isArray(res.data) ? res.data : []).find((w) => w.id === Number(competenciaId));
        if (!encontrado) {
          setError('No estas asignado a esta competencia o ya no existe.');
          return;
        }
        setCompetencia(encontrado);
      })
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar la competencia')))
      .finally(() => setCargando(false));
  }, [competenciaId]);

  const wods = [...(competencia?.wods ?? [])].sort((a, b) => a.orden - b.orden);

  return (
    <AppShell
      title={competencia?.nombre ?? 'Wods'}
      subtitle="Elige el WOD a evaluar"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={Trophy} onClick={() => navigate(`/leaderboard/${competenciaId}`)}>
            <span className="hidden sm:inline">Clasificacion</span>
          </Button>
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate('/juez')}>
            <span className="hidden sm:inline">Competencias</span>
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 max-w-2xl">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <section className="surface overflow-hidden max-w-2xl">
        <header className="panel-header">
          <h2 className="eyebrow">Wods</h2>
        </header>

        {cargando ? (
          <SkeletonList rows={3} />
        ) : wods.length === 0 ? (
          <EmptyState
            icon={ListX}
            title="Esta competencia no tiene WODs"
            description="El administrador debe definir al menos un WOD antes de poder medir."
          />
        ) : (
          <ul className="divide-hairline">
            {wods.map((wod) => (
              <li key={wod.id}>
                <Link
                  to={`/juez/${competenciaId}/${wod.id}`}
                  className="group flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-white/[0.03] transition-colors duration-200"
                >
                  <span className="grid place-items-center w-11 h-11 rounded-xl bg-hyrox-primary/12 shrink-0 overflow-hidden">
                    {wod.imagen_url ? (
                      <img src={wod.imagen_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-display text-lg font-extrabold text-hyrox-primary">{wod.orden}</span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-hyrox-paper truncate">{wod.nombre_ejercicio}</span>
                    <span className="flex items-center gap-2 mt-0.5 text-xs text-hyrox-mist">
                      <Timer className="w-3 h-3" aria-hidden="true" />
                      {ETIQUETA_MEDICION[wod.tipo_medicion]}
                      {wod.tipo_medicion === 'distancia' && (
                        <>
                          <span aria-hidden="true">&middot;</span>
                          en {unidadDeWod(wod) === 'km' ? 'kilómetros' : unidadDeWod(wod) === 'mi' ? 'millas' : 'metros'}
                          {textoMetaDistancia(wod) && (
                            <>
                              <span aria-hidden="true">&middot;</span>
                              {textoMetaDistancia(wod)}
                            </>
                          )}
                        </>
                      )}
                      <span aria-hidden="true">&middot;</span>
                      Max {wod.puntaje_maximo} pts
                    </span>
                    <span className="block mt-1 text-2xs text-hyrox-ghost truncate">
                      Categorias: {formatearCategorias(competencia?.divisiones)}
                    </span>
                  </span>
                  <ChevronRight
                    className="w-5 h-5 text-hyrox-ghost group-hover:text-hyrox-primary group-hover:translate-x-0.5 transition-all duration-200 shrink-0"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
