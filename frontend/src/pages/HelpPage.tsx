import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronRight, ChevronDown, LifeBuoy, BookOpen } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { Panel, PanelHeader, EmptyState, cx } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import TutorialDetalle from '../components/help/TutorialDetalle';
import {
  TUTORIALES,
  ETIQUETA_ROL,
  PREGUNTAS_FRECUENTES,
  type RolTutorial,
  type Tutorial,
} from '../data/tutoriales';

type Filtro = RolTutorial | 'todo';

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'todo', etiqueta: 'Todo' },
  { valor: 'admin', etiqueta: 'Administrador' },
  { valor: 'juez', etiqueta: 'Juez' },
  { valor: 'participante', etiqueta: 'Atleta' },
];

/** Texto sobre el que busca el filtro: titulo, resumen y el cuerpo de los pasos. */
function textoBuscable(t: Tutorial): string {
  return [t.titulo, t.resumen, ...t.pasos.flatMap((p) => [p.titulo, p.detalle, p.aviso ?? ''])]
    .join(' ')
    .toLowerCase();
}

/**
 * Seccion de ayuda: los tutoriales paso a paso de la aplicacion.
 *
 * El tutorial abierto viaja en la URL (`/ayuda?t=crear-competencia`) para que se pueda
 * enviar por mensaje a un juez o a un organizador y le abra justo esa guia.
 */
export default function HelpPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const rolPropio = (user?.rol ?? 'participante') as RolTutorial;
  const [filtro, setFiltro] = useState<Filtro>(rolPropio);
  const [busqueda, setBusqueda] = useState('');

  const abierto = TUTORIALES.find((t) => t.slug === params.get('t'));

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return TUTORIALES.filter((t) => filtro === 'todo' || t.rol === filtro).filter(
      (t) => !q || textoBuscable(t).includes(q)
    );
  }, [filtro, busqueda]);

  function abrir(slug: string) {
    setParams({ t: slug });
    window.scrollTo({ top: 0 });
  }

  function cerrar() {
    setParams({});
    window.scrollTo({ top: 0 });
  }

  return (
    <AppShell title="Ayuda" subtitle="Guías paso a paso de la aplicación">
      {abierto ? (
        <TutorialDetalle tutorial={abierto} onVolver={cerrar} />
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* ---------- Presentacion ---------- */}
          <Panel className="p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="grid place-items-center w-12 h-12 rounded-2xl bg-hyrox-primary/12 text-hyrox-primary shrink-0">
                <LifeBuoy className="w-6 h-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-hyrox-paper tracking-display">
                  ¿En qué te ayudamos?
                </h2>
                <p className="text-sm text-hyrox-mist mt-1 max-w-2xl leading-relaxed">
                  Cada tutorial recorre una tarea completa, con la captura de cada paso y una animación
                  del flujo entero. Empiezas por los de tu rol, pero puedes ver los de cualquier otro.
                </p>
              </div>
            </div>
          </Panel>

          {/* ---------- Filtros ---------- */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por rol">
              {FILTROS.map((f) => (
                <button
                  key={f.valor}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f.valor}
                  onClick={() => setFiltro(f.valor)}
                  className={cx(
                    'px-3.5 h-9 rounded-xl text-sm font-medium transition-colors duration-200 cursor-pointer',
                    filtro === f.valor
                      ? 'bg-hyrox-primary/12 text-hyrox-primary'
                      : 'text-hyrox-mist hover:text-hyrox-paper hover:bg-white/[0.05]'
                  )}
                >
                  {f.etiqueta}
                  {f.valor === rolPropio && filtro !== f.valor && (
                    <span className="ml-2 text-2xs text-hyrox-ghost">tu rol</span>
                  )}
                </button>
              ))}
            </div>

            <div className="relative sm:w-72">
              <Search
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-hyrox-ghost pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar en la ayuda..."
                aria-label="Buscar en la ayuda"
                className="input-field pl-10"
              />
            </div>
          </div>

          {/* ---------- Tutoriales ---------- */}
          {visibles.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nada coincide con la búsqueda"
              description="Prueba con otra palabra o quita el filtro de rol."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibles.map((t) => {
                const Icono = t.icono;
                return (
                  <li key={t.slug}>
                    <button
                      type="button"
                      onClick={() => abrir(t.slug)}
                      className="surface h-full w-full text-left p-5 flex flex-col gap-3 hover:border-hyrox-primary/30 hover:bg-white/[0.03] transition-colors duration-200 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid place-items-center w-10 h-10 rounded-xl bg-hyrox-primary/12 text-hyrox-primary shrink-0">
                          <Icono className="w-5 h-5" aria-hidden="true" />
                        </span>
                        <span className="badge badge-gray">{ETIQUETA_ROL[t.rol]}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-hyrox-paper leading-snug">{t.titulo}</h3>
                        <p className="text-sm text-hyrox-mist mt-1.5 leading-relaxed">{t.resumen}</p>
                      </div>

                      <span className="flex items-center gap-1.5 text-sm font-medium text-hyrox-primary">
                        {t.pasos.length} pasos
                        <ChevronRight className="w-4 h-4" aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* ---------- Preguntas frecuentes ---------- */}
          <Panel>
            <PanelHeader
              title="Preguntas frecuentes"
              subtitle="Lo que más se pregunta durante un evento"
              icon={BookOpen}
            />
            <ul className="divide-y divide-white/[0.06]">
              {PREGUNTAS_FRECUENTES.map((f) => (
                <li key={f.pregunta}>
                  <Desplegable pregunta={f.pregunta} respuesta={f.respuesta} />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </AppShell>
  );
}

function Desplegable({ pregunta, respuesta }: { pregunta: string; respuesta: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors duration-200 cursor-pointer"
      >
        <ChevronDown
          className={cx(
            'w-4 h-4 shrink-0 text-hyrox-ghost transition-transform duration-200',
            abierto && 'rotate-180 text-hyrox-primary'
          )}
          aria-hidden="true"
        />
        <span className="text-sm font-semibold text-hyrox-paper">{pregunta}</span>
      </button>
      {abierto && (
        <p className="px-5 pb-4 pl-12 text-sm text-hyrox-mist leading-relaxed animate-fade-in">
          {respuesta}
        </p>
      )}
    </>
  );
}
