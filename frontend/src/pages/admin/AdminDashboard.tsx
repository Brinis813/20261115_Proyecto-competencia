import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  Dumbbell,
  FileText,
  Flag,
  ListChecks,
  Plus,
  Trophy,
  Upload,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import api, { getEventoActiva } from '../../api/client';
import AppShell from '../../components/layout/AppShell';
import PortadaEditor from '../../components/eventos/PortadaEditor';
import { Button, cx } from '../../components/ui';
import type { Evento, EventoScoringType, EventoTieBreakPolicy, Juez, Participante, Competencia } from '../../types';
import { ETIQUETA_SCORING, ETIQUETA_TIEBREAK_GLOBAL } from '../../types';
import { formatearCategorias } from '../../utils/formato';

interface Resumen {
  competencias: number;
  competenciasActivos: number;
  jueces: number;
  participantes: number;
}

export default function AdminDashboard() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [ultimosCompetencias, setUltimosCompetencias] = useState<Competencia[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<Competencia[]>('/competencias'),
      api.get<Juez[]>('/users/jueces'),
      api.get<Participante[]>('/users/participantes'),
    ])
      .then(([competencias, jueces, participantes]) => {
        const listaCompetencias = Array.isArray(competencias.data) ? competencias.data : [];
        setResumen({
          competencias: listaCompetencias.length,
          competenciasActivos: listaCompetencias.filter((w) => w.estado === 'activo').length,
          jueces: Array.isArray(jueces.data) ? jueces.data.length : 0,
          participantes: Array.isArray(participantes.data) ? participantes.data.length : 0,
        });
        setUltimosCompetencias(listaCompetencias.slice(0, 4));
      })
      .catch(() => setResumen({ competencias: 0, competenciasActivos: 0, jueces: 0, participantes: 0 }));
  }, []);  return (
    <AppShell
      title="Resumen"
      subtitle="Estado general del evento"
      actions={
        <Link to="/admin/competencias/nuevo">
          <Button size="sm" icon={Plus}>
            <span className="hidden sm:inline">Nueva competencia</span>
          </Button>
        </Link>
      }
    >
      {/* --------------------------- Metricas --------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Metrica
          etiqueta="Competencias"
          valor={resumen?.competencias}
          detalle={resumen ? `${resumen.competenciasActivos} en curso` : undefined}
          icon={Dumbbell}
          tono="primary"
        />
        <Metrica etiqueta="Jueces" valor={resumen?.jueces} icon={UserCheck} tono="info" />
        <Metrica etiqueta="Atletas" valor={resumen?.participantes} icon={Users} tono="accent" />
        <Metrica
          etiqueta="En vivo"
          valor={resumen?.competenciasActivos}
          detalle="clasificaciones activas"
          icon={Trophy}
          tono="warning"
        />
      </div>

      {/* --------------------- Criterio global de ganador --------------------- */}
      <ScoringPolicyCard />

      {/* ------------------------- Portada del evento ------------------------- */}
      <PortadaEditor />

      {/* items-start evita que el panel corto se estire al alto del otro. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
        {/* ------------------------- Ultimos Competencias ------------------------- */}
        <section className="surface overflow-hidden">
          <header className="panel-header">
            <h2 className="eyebrow">Competencias recientes</h2>
            <Link to="/admin/competencias" className="text-2xs font-semibold text-hyrox-primary hover:text-hyrox-ember">
              Ver todos
            </Link>
          </header>

          {ultimosCompetencias.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-hyrox-mist mb-4">Todavia no has creado ninguna competencia.</p>
              <Link to="/admin/competencias/nuevo" className="inline-block">
                <Button size="sm" icon={Plus}>
                  Crear el primero
                </Button>
              </Link>
            </div>
          ) : (
            <ul className="divide-hairline">
              {ultimosCompetencias.map((competencia) => (
                <li key={competencia.id}>
                  <Link
                    to={`/admin/competencias/${competencia.id}`}
                    className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="grid place-items-center w-9 h-9 rounded-xl bg-hyrox-primary/12 text-hyrox-primary shrink-0">
                      <Dumbbell className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-hyrox-paper truncate">{competencia.nombre}</span>
                      <span className="block text-2xs text-hyrox-mist">{competencia.wods?.length ?? 0} wods</span>
                      <span className="block text-2xs text-hyrox-ghost truncate">
                        Categorias: {formatearCategorias(competencia.divisiones)}
                      </span>
                    </span>
                    <EstadoCompetencia estado={competencia.estado} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ------------------------ Accesos rapidos ----------------------- */}
        <section className="surface overflow-hidden">
          <header className="panel-header">
            <h2 className="eyebrow">Accesos rapidos</h2>
          </header>
          <ul className="divide-hairline">
            <AccesoRapido to="/admin/competencias" icon={Plus} titulo="Crear WOD" descripcion="Agregar wods a una competencia" />
            <AccesoRapido to="/admin/jueces" icon={UserCheck} titulo="Jueces" descripcion="Alta y contrasenas temporales" />
            <AccesoRapido to="/admin/participantes" icon={Users} titulo="Atletas" descripcion="Inscribir participantes" />
            <AccesoRapido to="/admin/carga-masiva" icon={Upload} titulo="Carga masiva" descripcion="Importar atletas y jueces desde CSV" />
            <AccesoRapido
              to="/admin/asignaciones"
              icon={ClipboardList}
              titulo="Asignaciones"
              descripcion="Vincular jueces y atletas"
            />
            <AccesoRapido
              to="/admin/heats"
              icon={Flag}
              titulo="Heats"
              descripcion="Series por categoría y horarios"
            />
            <AccesoRapido
              to="/admin/resultados"
              icon={ListChecks}
              titulo="Resultados"
              descripcion="Revisar y corregir mediciones"
            />
            <AccesoRapido
              to="/admin/informe"
              icon={FileText}
              titulo="Informe final"
              descripcion="Exportar CSV y PDF del evento"
            />
            <AccesoRapido to="/inicio" icon={Trophy} titulo="Clasificacion" descripcion="Pantalla del evento" />
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

const TONOS = {
  primary: 'bg-hyrox-primary/12 text-hyrox-primary',
  accent: 'bg-hyrox-accent/12 text-hyrox-accent',
  info: 'bg-hyrox-info/12 text-hyrox-info',
  warning: 'bg-hyrox-warning/12 text-hyrox-warning',
} as const;

function Metrica({
  etiqueta,
  valor,
  detalle,
  icon: Icon,
  tono,
}: {
  etiqueta: string;
  valor?: number;
  detalle?: string;
  icon: LucideIcon;
  tono: keyof typeof TONOS;
}) {
  return (
    <div className="surface p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="eyebrow">{etiqueta}</span>
        <span className={cx('grid place-items-center w-8 h-8 rounded-lg shrink-0', TONOS[tono])}>
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
      </div>
      {/* Se reserva el alto del numero para que la tarjeta no salte al cargar. */}
      {valor === undefined ? (
        <div className="skeleton h-9 w-16" />
      ) : (
        <p className="font-display text-3xl sm:text-4xl font-extrabold text-hyrox-paper leading-none tabular-nums">
          {valor}
        </p>
      )}
      {detalle && <p className="mt-1.5 text-2xs text-hyrox-mist">{detalle}</p>}
    </div>
  );
}

function AccesoRapido({
  to,
  icon: Icon,
  titulo,
  descripcion,
}: {
  to: string;
  icon: LucideIcon;
  titulo: string;
  descripcion: string;
}) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-white/[0.03] transition-colors group">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-white/[0.05] text-hyrox-mist group-hover:text-hyrox-primary group-hover:bg-hyrox-primary/12 transition-colors shrink-0">
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-hyrox-paper">{titulo}</span>
          <span className="block text-2xs text-hyrox-mist truncate">{descripcion}</span>
        </span>
      </Link>
    </li>
  );
}

export function EstadoCompetencia({ estado }: { estado: Competencia['estado'] }) {
  if (estado === 'activo') return <span className="badge-green">En curso</span>;
  if (estado === 'finalizado') return <span className="badge-gray">Finalizado</span>;
  return <span className="badge-amber">Borrador</span>;
}

/** Selector del criterio global de ganador + desempate del evento activa. */
function ScoringPolicyCard() {
  const eventoId = getEventoActiva();
  const [scoring, setScoring] = useState<EventoScoringType | null>(null);
  const [tiebreak, setTiebreak] = useState<EventoTieBreakPolicy | null>(null);
  const [tiebreakCompetenciaId, setTiebreakCompetenciaId] = useState<number | null>(null);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    if (!eventoId) return;
    api
      .get<Evento>(`/eventos/publicas/${eventoId}`)
      .then((res) => {
        setScoring(res.data.scoring_type ?? 'POINTS_ACCUMULATION');
        setTiebreak(res.data.tiebreak_policy ?? 'BEST_INDIVIDUAL_RANK');
        setTiebreakCompetenciaId(res.data.tiebreak_competencia_id ?? null);
      })
      .catch(() => {
        setScoring(null);
        setTiebreak(null);
      });
    api
      .get<Competencia[]>(`/competencias/public?evento=${eventoId}`)
      .then((res) => setCompetencias(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCompetencias([]));
  }, [eventoId]);

  if (!eventoId) return null;

  async function guardarPoliticas(parcial: {
    scoringType?: EventoScoringType;
    tiebreakPolicy?: EventoTieBreakPolicy;
    tiebreakCompetenciaId?: number | null;
  }) {
    setGuardando(true);
    setMensaje('');
    try {
      await api.put(`/eventos/${eventoId}/scoring`, parcial);
      setMensaje('Criterio guardado');
    } catch {
      setMensaje('No se pudo guardar el criterio');
    } finally {
      setGuardando(false);
    }
  }

  async function cambiar(valor: EventoScoringType) {
    setScoring(valor);
    await guardarPoliticas({ scoringType: valor });
  }

  async function cambiarTiebreak(valor: EventoTieBreakPolicy) {
    setTiebreak(valor);
    // Al salir de Competencia designada se limpia el designado para no aplicar un
    // criterio obsoleto (el servidor también lo limpia).
    const designado = valor === 'DESIGNATED_TIEBREAK_COMPETENCIA' ? tiebreakCompetenciaId : null;
    if (valor !== 'DESIGNATED_TIEBREAK_COMPETENCIA') setTiebreakCompetenciaId(null);
    await guardarPoliticas({ tiebreakPolicy: valor, tiebreakCompetenciaId: designado });
  }

  async function cambiarCompetenciaDesignado(valor: number | null) {
    setTiebreakCompetenciaId(valor);
    await guardarPoliticas({ tiebreakCompetenciaId: valor });
  }

  return (
    <section className="surface p-4 sm:p-5 mb-6">
      <h2 className="eyebrow mb-1">Criterio de ganador del evento</h2>
      <p className="text-2xs text-hyrox-ghost mb-3">
        Acumulado suma todos las competencias en un ranking general. Por Competencia premia un ganador
        independiente en cada etapa, sin total global.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        {(Object.keys(ETIQUETA_SCORING) as EventoScoringType[]).map((tipo) => (
          <button
            key={tipo}
            type="button"
            disabled={guardando || scoring === null}
            onClick={() => cambiar(tipo)}
            aria-pressed={scoring === tipo}
            className={cx(
              'flex-1 text-left rounded-xl border p-3 transition-colors cursor-pointer disabled:opacity-50',
              scoring === tipo
                ? 'border-hyrox-primary bg-hyrox-primary/10'
                : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]'
            )}
          >
            <span className="block text-sm font-semibold text-hyrox-paper">{ETIQUETA_SCORING[tipo]}</span>
            <span className="block text-2xs text-hyrox-ghost mt-0.5">
              {tipo === 'POINTS_ACCUMULATION'
                ? 'Un campeón global por categoría con la suma de puntos'
                : 'Un ganador por cada competencia, sin campeón global'}
            </span>
          </button>
        ))}
      </div>

      <h3 className="eyebrow mt-5 mb-1">Desempate del acumulado</h3>
      <p className="text-2xs text-hyrox-ghost mb-3">
        Cómo se resuelven los empates en puntos. "Sin desempate" comparte puesto y puntos.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <select
          value={tiebreak ?? ''}
          disabled={guardando || tiebreak === null}
          onChange={(e) => cambiarTiebreak(e.target.value as EventoTieBreakPolicy)}
          className="input-field"
          aria-label="Criterio de desempate global"
        >
          {(Object.keys(ETIQUETA_TIEBREAK_GLOBAL) as EventoTieBreakPolicy[]).map((p) => (
            <option key={p} value={p}>
              {ETIQUETA_TIEBREAK_GLOBAL[p]}
            </option>
          ))}
        </select>
        {tiebreak === 'DESIGNATED_TIEBREAK_COMPETENCIA' && (
          <select
            value={tiebreakCompetenciaId === null ? '' : String(tiebreakCompetenciaId)}
            disabled={guardando}
            onChange={(e) =>
              cambiarCompetenciaDesignado(e.target.value === '' ? null : Number(e.target.value))
            }
            className="input-field"
            aria-label="Competencia designada como desempate"
          >
            <option value="">Elige la competencia de desempate</option>
            {competencias.map((w) => (
              <option key={w.id} value={String(w.id)}>
                {w.nombre}
              </option>
            ))}
          </select>
        )}
      </div>
      {mensaje && <p className="mt-2 text-2xs text-hyrox-mist">{guardando ? 'Guardando…' : mensaje}</p>}
    </section>
  );
}
