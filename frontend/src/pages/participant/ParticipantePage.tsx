import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, ClipboardX, Medal, Trophy } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import AppShell from '../../components/layout/AppShell';
import { Alert, EmptyState, SkeletonList, cx } from '../../components/ui';
import { formatearValor, unidadDeWod, type PosicionParticipante, type Resultado, type TipoMedicion } from '../../types';

interface RespuestaResultados {
  participant: { id: number; nombre: string; apellidos: string; cedula: string; box: string; categoria: string | null };
  resultsByCompetencia: Record<string, { competencia_nombre: string; resultados: Resultado[] }>;
  positions: PosicionParticipante[];
}

/** Ficha del atleta: su posicion en cada competencia y el detalle de sus mediciones. */
export default function ParticipantePage() {
  const { user } = useAuth();
  const [datos, setDatos] = useState<RespuestaResultados | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;

    // El backend admite consultar por cedula; el propio atleta solo puede
    // pedir su ficha, asi que la fecha va vacia y se ignora.
    api
      .post<RespuestaResultados>('/participant/results', {
        cedula: user.cedula,
        fecha_nacimiento: '1900-01-01',
      })
      .then((res) => setDatos(res.data))
      .catch((err) => setError(mensajeDeError(err, 'No se pudieron cargar tus resultados')))
      .finally(() => setCargando(false));
  }, [user]);

  const posiciones = datos?.positions ?? [];
  const porCompetencia = Object.entries(datos?.resultsByCompetencia ?? {});

  return (
    <AppShell title="Mis resultados" subtitle={user ? `${user.nombre} ${user.apellidos}` : undefined}>
      <div className="max-w-4xl space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        {cargando ? (
          <div className="surface">
            <SkeletonList rows={4} />
          </div>
        ) : posiciones.length === 0 && porCompetencia.length === 0 ? (
          <div className="surface">
            <EmptyState
              icon={ClipboardX}
              title="Todavia no estas inscrito en ninguna competencia"
              description="En cuanto el administrador te asigne a una prueba veras aqui tu posicion y tus tiempos."
            />
          </div>
        ) : (
          <>
            {/* ---------------------- Posiciones ---------------------- */}
            {posiciones.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {posiciones.map((posicion) => (
                  <Link
                    key={posicion.competencia_id}
                    to={`/leaderboard/${posicion.competencia_id}`}
                    className="surface p-5 hover:border-hyrox-primary/35 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <span className="eyebrow truncate">{posicion.competencia_nombre}</span>
                      <Trophy
                        className="w-4 h-4 text-hyrox-ghost group-hover:text-hyrox-primary transition-colors shrink-0"
                        aria-hidden="true"
                      />
                    </div>

                    <div className="flex items-end gap-3">
                      <span
                        className={cx(
                          'font-display text-5xl font-extrabold leading-none tabular-nums',
                          posicion.posicion === 1
                            ? 'text-hyrox-gold'
                            : posicion.posicion === 2
                              ? 'text-hyrox-silver'
                              : posicion.posicion === 3
                                ? 'text-hyrox-bronze'
                                : 'text-hyrox-paper'
                        )}
                      >
                        {posicion.posicion ?? '–'}
                      </span>
                      <span className="text-xs text-hyrox-mist pb-1.5">de {posicion.total_participantes}</span>
                    </div>

                    <p className="mt-3 text-sm">
                      <span className="font-mono font-bold text-hyrox-primary">{posicion.puntos_total}</span>
                      <span className="text-hyrox-mist"> puntos acumulados</span>
                    </p>
                  </Link>
                ))}
              </div>
            )}

            {/* ---------------------- Detalle ---------------------- */}
            {porCompetencia.map(([competenciaId, grupo]) => (
              <section key={competenciaId} className="surface overflow-hidden">
                <header className="panel-header">
                  <h2 className="eyebrow">{grupo.competencia_nombre}</h2>
                  <Link
                    to={`/leaderboard/${competenciaId}`}
                    className="text-2xs font-semibold text-hyrox-primary hover:text-hyrox-ember"
                  >
                    Ver clasificacion
                  </Link>
                </header>

                <ul className="divide-hairline">
                  {[...grupo.resultados]
                    .sort((a, b) => (a.Wod?.orden ?? 0) - (b.Wod?.orden ?? 0))
                    .map((resultado) => (
                      <li key={resultado.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                        <span className="grid place-items-center w-8 h-8 rounded-lg bg-white/[0.05] font-mono text-2xs font-bold text-hyrox-mist shrink-0">
                          {resultado.Wod?.orden ?? '–'}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-hyrox-paper truncate">
                            {resultado.Wod?.nombre_ejercicio ?? 'WOD'}
                          </span>
                          {resultado.abandono && <span className="badge-red mt-0.5">Abandono</span>}
                          {resultado.capado && !resultado.abandono && (
                            <span className="badge-gray mt-0.5">No terminado (tope)</span>
                          )}
                        </span>
                        <span className="text-right shrink-0">
                          <span
                            className={cx(
                              'block font-mono font-bold',
                              resultado.abandono ? 'text-hyrox-danger' : 'text-hyrox-paper'
                            )}
                          >
                            {formatearValor(
                              resultado.valor_bruto,
                              (resultado.Wod?.tipo_medicion ?? 'repeticiones') as TipoMedicion,
                              resultado.abandono,
                              resultado.capado,
                              unidadDeWod(resultado.Wod ?? null)
                            )}
                          </span>
                          <span className="flex items-center justify-end gap-1 text-2xs text-hyrox-primary font-mono">
                            <Award className="w-3 h-3" aria-hidden="true" />
                            {resultado.puntos_calculados} pts
                          </span>
                        </span>
                      </li>
                    ))}

                  {grupo.resultados.length === 0 && (
                    <li className="px-5 py-6 text-center text-sm text-hyrox-mist">
                      <Medal className="w-5 h-5 mx-auto mb-2 text-hyrox-ghost" aria-hidden="true" />
                      Aun no tienes mediciones en esta competencia.
                    </li>
                  )}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </AppShell>
  );
}
