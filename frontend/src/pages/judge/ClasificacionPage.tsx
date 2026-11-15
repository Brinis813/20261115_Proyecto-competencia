import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ClipboardX, Trophy } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import AppShell from '../../components/layout/AppShell';
import { Alert, EmptyState, SkeletonList } from '../../components/ui';
import type { Competencia } from '../../types';
import { formatearCategorias } from '../../utils/formato';

/**
 * Clasificación para el juez: sus competencias asignadas, cada una con
 * enlace directo a su leaderboard en vivo (`/leaderboard/:id`, página
 * pública que se actualiza sola con cada medición registrada).
 */
export default function ClasificacionPage() {
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Competencia[]>('/competencias/judge')
      .then((res) => setCompetencias(Array.isArray(res.data) ? res.data : []))
      .catch((err) => setError(mensajeDeError(err, 'No se pudieron cargar las competencias')))
      .finally(() => setCargando(false));
  }, []);

  return (
    <AppShell title="Clasificacion" subtitle="Leaderboard en vivo de tus competencias">
      {error && (
        <div className="mb-4 max-w-2xl">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <section className="surface overflow-hidden max-w-2xl">
        <header className="panel-header">
          <h2 className="eyebrow">Competencias asignadas</h2>
        </header>

        {cargando ? (
          <SkeletonList rows={3} />
        ) : competencias.length === 0 ? (
          <EmptyState
            icon={ClipboardX}
            title="No tienes competencias asignadas"
            description="Pide al administrador que te asigne a una competencia para ver su clasificacion."
          />
        ) : (
          <ul className="divide-hairline">
            {competencias.map((competencia) => (
              <li key={competencia.id}>
                <Link
                  to={`/leaderboard/${competencia.id}`}
                  className="group flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-white/[0.03] transition-colors duration-200"
                >
                  <span className="grid place-items-center w-11 h-11 rounded-xl bg-hyrox-primary/12 text-hyrox-primary shrink-0">
                    <Trophy className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-hyrox-paper truncate">{competencia.nombre}</span>
                    <span className="block text-xs text-hyrox-mist">{competencia.wods?.length ?? 0} wods</span>
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
      </section>
    </AppShell>
  );
}
