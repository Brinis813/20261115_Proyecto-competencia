import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ClipboardX, Dumbbell, Trophy } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import AppShell from '../../components/layout/AppShell';
import { Alert, EmptyState, SkeletonList } from '../../components/ui';
import type { Competencia } from '../../types';
import { formatearCategorias } from '../../utils/formato';

/** Paso 1 del flujo del juez: elegir la competencia que va a medir. */
export default function JuezCompetenciasPage() {
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
    <AppShell title="Medir" subtitle="Elige la competencia que vas a cronometrar">
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <section className="surface overflow-hidden max-w-2xl">
        <header className="panel-header">
          <h2 className="eyebrow">Competencias asignados</h2>
        </header>

        {cargando ? (
          <SkeletonList rows={3} />
        ) : competencias.length === 0 ? (
          <EmptyState
            icon={ClipboardX}
            title="No tienes Competencias asignados"
            description="Pide al administrador que te asigne a una competencia para poder registrar mediciones."
          />
        ) : (
          <ul className="divide-hairline">
            {competencias.map((competencia) => (
              <li
                key={competencia.id}
                className="group flex items-center gap-3 px-4 sm:px-5 py-4 hover:bg-white/[0.03] transition-colors duration-200"
              >
                <Link
                  to={`/juez/${competencia.id}`}
                  className="flex items-center gap-4 flex-1 min-w-0"
                >
                  <span className="grid place-items-center w-11 h-11 rounded-xl bg-hyrox-primary/12 text-hyrox-primary shrink-0">
                    <Dumbbell className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-hyrox-paper truncate">
                      {competencia.nombre}
                    </span>
                    <span className="block text-xs text-hyrox-mist">
                      {competencia.wods?.length ?? 0} wods
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
                <Link
                  to={`/leaderboard/${competencia.id}`}
                  title={`Clasificacion en vivo de ${competencia.nombre}`}
                  aria-label={`Clasificacion en vivo de ${competencia.nombre}`}
                  className="grid place-items-center w-10 h-10 rounded-xl border border-white/10 bg-white/[0.03] text-hyrox-mist hover:text-hyrox-primary hover:border-hyrox-primary/40 transition-colors shrink-0"
                >
                  <Trophy className="w-4 h-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
