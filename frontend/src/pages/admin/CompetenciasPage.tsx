import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Dumbbell,
  Eye,
  History,
  Pencil,
  Plus,
  Radio,
  Trash2,
  Trophy,
} from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import AppShell from '../../components/layout/AppShell';
import { Alert, Button, ConfirmDialog, EmptyState, IconButton, SkeletonList, cx } from '../../components/ui';
import ArranqueControl from '../../components/admin/ArranqueControl';
import ResumenCompetencia from '../../components/admin/ResumenCompetencia';
import { EstadoCompetencia } from './AdminDashboard';
import { ETIQUETA_MEDICION, type Competencia } from '../../types';
import { formatearCategorias } from '../../utils/formato';

export default function CompetenciasPage() {
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aEliminar, setAEliminar] = useState<Competencia | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [resumenId, setResumenId] = useState<number | null>(null);

  async function cargar() {
    try {
      const res = await api.get<Competencia[]>('/competencias');
      setCompetencias(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron cargar las competencias'));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function eliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await api.delete(`/competencias/${aEliminar.id}`);
      setAEliminar(null);
      await cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo eliminar la competencia'));
    } finally {
      setEliminando(false);
    }
  }

  return (
    <AppShell
      title="Competencias"
      subtitle="Pruebas y wods del evento"
      actions={
        <Link to="/admin/competencias/nuevo">
          <Button size="sm" icon={Plus}>
            <span className="hidden sm:inline">Nuevo WOD</span>
          </Button>
        </Link>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert tone="error" onDismiss={() => setError('')}>
            {error}
          </Alert>
        </div>
      )}

      {cargando ? (
        <div className="surface max-w-4xl">
          <SkeletonList rows={3} />
        </div>
      ) : competencias.length === 0 ? (
        <div className="surface max-w-4xl">
          <EmptyState
            icon={Dumbbell}
            title="Aun no hay Competencias"
            description="Una competencia agrupa los WODs que van a medirse y como se puntuan."
            action={
              <Link to="/admin/competencias/nuevo">
                <Button icon={Plus}>Crear el primer Competencia</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <GruposCompetencias
          competencias={competencias}
          onResumen={(id) => setResumenId(id)}
          onEliminar={(c) => setAEliminar(c)}
        />
      )}

      <ResumenCompetencia competenciaId={resumenId} onClose={() => setResumenId(null)} />

      <ConfirmDialog
        open={aEliminar !== null}
        title="Eliminar Competencia"
        message={`Se eliminara "${aEliminar?.nombre ?? ''}" con todos sus wods, asignaciones y resultados registrados. Esta accion no se puede deshacer.`}
        confirmLabel="Eliminar Competencia"
        loading={eliminando}
        onConfirm={eliminar}
        onCancel={() => setAEliminar(null)}
      />
    </AppShell>
  );
}

/**
 * Competencias repartidas por estado, como los eventos: en curso,
 * programadas (borrador) y finalizadas (plegadas, para no empujar hacia
 * abajo lo que se usa a diario).
 */
function GruposCompetencias({
  competencias,
  onResumen,
  onEliminar,
}: {
  competencias: Competencia[];
  onResumen: (id: number) => void;
  onEliminar: (c: Competencia) => void;
}) {
  const [verFinalizadas, setVerFinalizadas] = useState(false);

  const enCurso = competencias.filter((c) => c.estado === 'activo');
  const programadas = competencias.filter((c) => c.estado === 'borrador');
  const finalizadas = competencias.filter((c) => c.estado === 'finalizado');

  return (
    <div className="space-y-8 max-w-6xl">
      <GrupoCompetencias
        titulo="En curso"
        descripcion="Se estan disputando"
        icono={Radio}
        acento="text-hyrox-accent"
        competencias={enCurso}
        onResumen={onResumen}
        onEliminar={onEliminar}
        vacio="Ninguna competencia en marcha."
        vivo
      />

      <GrupoCompetencias
        titulo="Programadas"
        descripcion="Borradores todavia sin arrancar"
        icono={CalendarDays}
        acento="text-hyrox-primary"
        competencias={programadas}
        onResumen={onResumen}
        onEliminar={onEliminar}
        vacio="No hay programadas."
      />

      {finalizadas.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setVerFinalizadas((v) => !v)}
            aria-expanded={verFinalizadas}
            className="flex items-center gap-2.5 text-hyrox-mist hover:text-hyrox-paper transition-colors duration-200 cursor-pointer"
          >
            <History className="w-4.5 h-4.5" aria-hidden="true" />
            <span className="font-display text-lg font-bold">Finalizadas</span>
            <span className="badge badge-gray">{finalizadas.length}</span>
            <ChevronDown
              className={cx('w-4 h-4 transition-transform duration-200', verFinalizadas && 'rotate-180')}
              aria-hidden="true"
            />
          </button>

          {verFinalizadas && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mt-4 animate-fade-in">
              {finalizadas.map((competencia) => (
                <TarjetaCompetencia
                  key={competencia.id}
                  competencia={competencia}
                  onResumen={onResumen}
                  onEliminar={onEliminar}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function GrupoCompetencias({
  titulo,
  descripcion,
  icono: Icono,
  acento,
  competencias,
  onResumen,
  onEliminar,
  vacio,
  vivo,
}: {
  titulo: string;
  descripcion: string;
  icono: typeof Radio;
  acento: string;
  competencias: Competencia[];
  onResumen: (id: number) => void;
  onEliminar: (c: Competencia) => void;
  vacio: string;
  vivo?: boolean;
}) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-4">
        <Icono className={cx('w-4.5 h-4.5', acento)} aria-hidden="true" />
        <h2 className="font-display text-lg font-bold text-hyrox-paper">{titulo}</h2>
        {vivo && competencias.length > 0 && (
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-hyrox-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-hyrox-accent" />
          </span>
        )}
        <span className="badge badge-gray">{competencias.length}</span>
        <span className="text-xs text-hyrox-ghost hidden sm:inline">{descripcion}</span>
      </div>

      {competencias.length === 0 ? (
        <p className="text-sm text-hyrox-ghost">{vacio}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {competencias.map((competencia) => (
            <TarjetaCompetencia
              key={competencia.id}
              competencia={competencia}
              onResumen={onResumen}
              onEliminar={onEliminar}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TarjetaCompetencia({
  competencia,
  onResumen,
  onEliminar,
}: {
  competencia: Competencia;
  onResumen: (id: number) => void;
  onEliminar: (c: Competencia) => void;
}) {
  return (
    <article className="surface overflow-hidden flex flex-col">
      {competencia.imagen_url && (
        <img
          src={competencia.imagen_url}
          alt={`Portada de ${competencia.nombre}`}
          loading="lazy"
          decoding="async"
          className="h-36 w-full object-cover"
        />
      )}
      <div className="p-5 flex flex-col flex-1">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold text-hyrox-paper truncate">{competencia.nombre}</h2>
          {competencia.descripcion && (
            <p className="mt-1 text-xs text-hyrox-mist line-clamp-2">{competencia.descripcion}</p>
          )}
          <p className="mt-1 text-2xs text-hyrox-ghost truncate">Categorias: {formatearCategorias(competencia.divisiones)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="badge-gray">{competencia.tipo_participacion ?? 'Individual'}</span>
            {/* Solo se anuncia el tope si la competencia tiene uno definido. */}
            {(competencia.duracion_minutos ?? 0) > 0 && (
              <span className="badge-gray">Cap {competencia.duracion_minutos} min</span>
            )}
          </div>
        </div>
        <EstadoCompetencia estado={competencia.estado} />
      </div>

      <ul className="space-y-1.5 mb-4 flex-1">
        {(competencia.wods ?? []).slice(0, 4).map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-xs">
            <span className="grid place-items-center w-5 h-5 rounded bg-white/[0.06] font-mono text-2xs font-bold text-hyrox-mist shrink-0">
              {c.orden}
            </span>
            <span className="text-hyrox-paper/90 truncate flex-1">{c.nombre_ejercicio}</span>
            <span className="text-hyrox-ghost shrink-0">{ETIQUETA_MEDICION[c.tipo_medicion]}</span>
          </li>
        ))}
        {(competencia.wods?.length ?? 0) > 4 && (
          <li className="text-2xs text-hyrox-ghost pl-7">
            y {(competencia.wods?.length ?? 0) - 4} wods mas
          </li>
        )}
        {(competencia.wods?.length ?? 0) === 0 && (
          <li className="text-xs text-hyrox-warning">Sin wods definidos</li>
        )}
      </ul>

      <div className="mb-3">
        <ArranqueControl competenciaId={competencia.id} competenciaNombre={competencia.nombre} />
      </div>

      <div className="flex items-center gap-1 pt-3 border-t border-white/[0.06]">
        <Link to={`/admin/competencias/${competencia.id}`} className="flex-1">
          <Button variant="secondary" size="sm" icon={Pencil} fullWidth>
            Editar
          </Button>
        </Link>
        <IconButton
          icon={Eye}
          label={`Resumen de ${competencia.nombre}`}
          onClick={() => onResumen(competencia.id)}
        />
        <Link to={`/admin/asignaciones/${competencia.id}`}>
          <IconButton icon={ClipboardList} label={`Asignaciones de ${competencia.nombre}`} />
        </Link>
        <Link to={`/leaderboard/${competencia.id}`}>
          <IconButton icon={Trophy} label={`Clasificacion de ${competencia.nombre}`} />
        </Link>
        <IconButton
          icon={Trash2}
          label={`Eliminar ${competencia.nombre}`}
          onClick={() => onEliminar(competencia)}
          className="hover:text-hyrox-danger hover:bg-hyrox-danger/10"
        />
      </div>
      </div>
    </article>
  );
}
