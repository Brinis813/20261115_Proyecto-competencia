import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Trophy } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import { PublicHeader } from '../../components/layout/AppShell';
import { Alert, EmptyState, SkeletonList } from '../../components/ui';
import { ETIQUETA_SCORING, ETIQUETA_TIEBREAK_GLOBAL, type EventoScoringType, type EventoTieBreakPolicy, type LeaderboardEntry } from '../../types';

interface PorCompetencia {
  competencia: { id: number; nombre: string };
  leaderboard: LeaderboardEntry[];
  ganador: LeaderboardEntry | null;
}

interface Respuesta {
  evento: {
    id: number;
    nombre: string;
    scoringType: EventoScoringType;
    tiebreakPolicy?: EventoTieBreakPolicy | null;
    tiebreakCompetenciaId?: number | null;
  };
  general: LeaderboardEntry[] | null;
  porCompetencia: PorCompetencia[];
}

/**
 * Clasificación global de un evento.
 * - POINTS_ACCUMULATION: ranking general + detalle por Competencia.
 * - WINNER_PER_COMPETENCIA: tarjetas por competencia con su ganador, sin total global.
 */
export default function EventoLeaderboardPage() {
  const { eventoId } = useParams();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<number | 'general'>('general');

  useEffect(() => {
    setCargando(true);
    api
      .get<Respuesta>(`/leaderboard/evento/${eventoId}`)
      .then((res) => setDatos(res.data))
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar la clasificación global')))
      .finally(() => setCargando(false));
  }, [eventoId]);

  return (
    <div className="min-h-screen bg-hyrox-void">
      <PublicHeader />
      <main className="px-4 sm:px-6 py-8 max-w-3xl mx-auto pb-safe">
        <Link
          to={`/eventos/${eventoId}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-hyrox-mist hover:text-hyrox-paper mb-6"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Volver al evento
        </Link>

        {error && (
          <div className="mb-5">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {cargando ? (
          <div className="surface">
            <SkeletonList rows={5} />
          </div>
        ) : !datos ? null : (
          <>
            <header className="mb-6">
              <div className="flex flex-wrap gap-2">
                <span className="badge-blue">{ETIQUETA_SCORING[datos.evento.scoringType]}</span>
                <span className="badge-gray" title="Criterio aplicado a los empates en el acumulado">
                  Desempate: {ETIQUETA_TIEBREAK_GLOBAL[datos.evento.tiebreakPolicy ?? 'BEST_INDIVIDUAL_RANK']}
                </span>
              </div>
              <h1 className="font-display text-3xl font-extrabold text-hyrox-paper mt-2">
                {datos.evento.nombre}
              </h1>
              <p className="text-sm text-hyrox-mist mt-1">
                {datos.evento.scoringType === 'POINTS_ACCUMULATION'
                  ? 'Ranking general acumulado de todos las competencias'
                  : 'Ganadores independientes por cada competencia'}
              </p>
            </header>

            {/* Pestañas: general (si existe) + un tab por Competencia */}
            <div className="flex flex-wrap gap-2 mb-5">
              {datos.general && (
                <button
                  type="button"
                  onClick={() => setTab('general')}
                  className={tab === 'general' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                >
                  General
                </button>
              )}
              {datos.porCompetencia.map((p, i) => (
                <button
                  key={p.competencia.id}
                  type="button"
                  onClick={() => setTab(i)}
                  className={tab === i ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                >
                  {p.competencia.nombre}
                </button>
              ))}
            </div>

            {tab === 'general' && datos.general ? (
              <TablaGeneral entradas={datos.general} />
            ) : typeof tab === 'number' && datos.porCompetencia[tab] ? (
              <section className="surface overflow-hidden">
                <header className="panel-header">
                  <h2 className="eyebrow">{datos.porCompetencia[tab].competencia.nombre}</h2>
                  {datos.porCompetencia[tab].ganador && (
                    <span className="badge-green inline-flex items-center gap-1">
                      <Trophy className="w-3 h-3" aria-hidden="true" />
                      {datos.porCompetencia[tab].ganador!.nombre} {datos.porCompetencia[tab].ganador!.apellidos}
                    </span>
                  )}
                </header>
                <TablaGeneral entradas={datos.porCompetencia[tab].leaderboard} />
              </section>
            ) : (
              <div className="surface">
                <EmptyState
                  icon={Trophy}
                  title="Sin resultados todavía"
                  description="Cuando los jueces registren mediciones aparecerán aquí."
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function TablaGeneral({ entradas }: { entradas: LeaderboardEntry[] }) {
  if (entradas.length === 0) {
    return (
      <div className="surface">
        <EmptyState icon={Trophy} title="Sin resultados" description="Todavía no hay puntuaciones." />
      </div>
    );
  }
  return (
    <ol className="surface divide-hairline">
      {entradas.map((e) => (
        <li key={e.participante_id} className="flex items-center gap-3 px-4 py-3">
          <span className="w-8 text-center font-mono font-bold text-hyrox-primary">{e.puesto}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-hyrox-paper truncate">
              {e.nombre} {e.apellidos}
            </span>
            <span className="flex items-center gap-2 mt-0.5">
              {e.categoria && <span className="block text-2xs text-hyrox-mist">{e.categoria}</span>}
              {e.comparte_puesto && e.puntos_total > 0 && (
                <span className="badge-gray" title="Comparte puesto y puntos por empate">
                  Empate
                </span>
              )}
            </span>
          </span>
          <span className="font-mono font-bold text-hyrox-paper tabular-nums">{e.puntos_total} pts</span>
        </li>
      ))}
    </ol>
  );
}
