import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CalendarX,
  ChevronRight,
  Dumbbell,
  LogIn,
  MapPin,
} from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { PublicHeader } from '../../components/layout/AppShell';
import { Alert, EmptyState, SkeletonList } from '../../components/ui';
import { ETIQUETA_ESTADO, rangoFechas } from '../../components/eventos/TarjetaEvento';
import PortadaImagen from '../../components/eventos/PortadaImagen';
import { ETIQUETA_SCORING } from '../../types';
import type { Evento, Competencia } from '../../types';
import { formatearCategorias } from '../../utils/formato';

/** Pagina publica de un evento: sus Competencias, y de ahi a cada clasificacion. */
export default function EventoPublicoPage() {
  const { eventoId } = useParams();
  const { user } = useAuth();
  const [evento, setEvento] = useState<Evento | null>(null);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setCargando(true);
    Promise.all([
      api.get<Evento>(`/eventos/publicas/${eventoId}`),
      api.get<Competencia[]>(`/competencias/public?evento=${eventoId}`),
    ])
      .then(([resEvento, resCompetencias]) => {
        setEvento(resEvento.data);
        setCompetencias(Array.isArray(resCompetencias.data) ? resCompetencias.data : []);
      })
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar el evento')))
      .finally(() => setCargando(false));
  }, [eventoId]);

  const estado = evento ? ETIQUETA_ESTADO[evento.estado] : null;

  return (
    <div className="min-h-screen bg-hyrox-void">
      <PublicHeader
        actions={
          !user && (
            <Link to="/login" className="btn-secondary btn-sm">
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Iniciar sesion</span>
            </Link>
          )
        }
      />

      <main className="px-4 sm:px-6 py-8 sm:py-12 max-w-3xl mx-auto pb-safe">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-hyrox-mist hover:text-hyrox-paper transition-colors duration-200 mb-6"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Todas los eventos
        </Link>

        {error && (
          <div className="mb-5">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {evento && (
          <header className="mb-8 animate-fade-up">
            {evento.imagen_url && (
              <PortadaImagen
                src={evento.imagen_url}
                alt={`Portada de ${evento.nombre}`}
                aspecto="aspect-[16/9] sm:aspect-[21/9]"
                eager
                clase="rounded-2xl border border-white/[0.08] mb-5"
              />
            )}
            {estado && <span className={estado.clase}>{estado.texto}</span>}
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-display text-hyrox-paper mt-3">
              {evento.nombre}
            </h1>
            {evento.descripcion && (
              <p className="mt-2 text-sm text-hyrox-mist max-w-xl">{evento.descripcion}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-hyrox-mist">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-hyrox-ghost" aria-hidden="true" />
                {rangoFechas(evento.fecha_inicio, evento.fecha_fin)}
              </span>
              {evento.sede && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-hyrox-ghost" aria-hidden="true" />
                  {evento.sede}
                </span>
              )}
              <span className="badge-blue">
                {ETIQUETA_SCORING[evento.scoring_type ?? 'POINTS_ACCUMULATION']}
              </span>
            </div>
            <Link
              to={`/leaderboard/evento/${evento.id}`}
              className="btn-primary btn-sm mt-4 inline-flex"
            >
              {(evento.scoring_type ?? 'POINTS_ACCUMULATION') === 'POINTS_ACCUMULATION'
                ? 'Ver ranking general'
                : 'Ver ganadores por Competencia'}
            </Link>
          </header>
        )}

        {cargando ? (
          <div className="surface">
            <SkeletonList rows={3} />
          </div>
        ) : competencias.length === 0 ? (
          <div className="surface">
            <EmptyState
              icon={CalendarX}
              title="Este evento no tiene competencias publicadas"
              description="Cuando el organizador active una competencia aparecera aqui automaticamente."
            />
          </div>
        ) : (
          <ul className="space-y-3">
            {competencias.map((competencia, indice) => (
              <li
                key={competencia.id}
                className="animate-fade-up"
                style={{ animationDelay: `${indice * 60}ms` }}
              >
                <Link
                  to={`/leaderboard/${competencia.id}`}
                  className="group flex items-center gap-4 p-4 sm:p-5 surface hover:border-hyrox-primary/35 hover:bg-white/[0.02] transition-all duration-200"
                >
                  <span className="grid place-items-center w-12 h-12 rounded-2xl bg-hyrox-primary/12 text-hyrox-primary shrink-0 group-hover:bg-hyrox-primary group-hover:text-white transition-colors duration-200">
                    <Dumbbell className="w-5 h-5" aria-hidden="true" />
                  </span>

                  <span className="flex-1 min-w-0">
                    <span className="block font-display text-lg font-bold text-hyrox-paper truncate">
                      {competencia.nombre}
                    </span>
                    <span className="flex items-center gap-2 mt-0.5 text-xs text-hyrox-mist">
                      <span>{competencia.wods?.length ?? 0} wods</span>
                      {competencia.estado === 'finalizado' && (
                        <span className="badge-gray">Finalizado</span>
                      )}
                      {competencia.estado === 'activo' && (
                        <span className="badge-green">En curso</span>
                      )}
                    </span>
                    <span className="block mt-1 text-2xs text-hyrox-ghost truncate">
                      Categorias: {formatearCategorias(competencia.divisiones)}
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
      </main>
    </div>
  );
}
