import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CalendarClock,
  CalendarX,
  ClipboardList,
  Download,
  FileText,
  Flag,
  Layers,
  LayoutDashboard,
  LogIn,
  Medal,
  Radio,
  Timer,
  Trophy,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { PublicHeader } from '../../components/layout/AppShell';
import { Alert, EmptyState, SkeletonList } from '../../components/ui';
import GruposEventos from '../../components/eventos/GruposEventos';
import type { Evento } from '../../types';

const FOTOS = [
  { src: '/portada/kettlebells.webp', titulo: 'Fuerza', alt: 'Atleta preparando dos kettlebells' },
  { src: '/portada/barra.webp', titulo: 'Tecnica', alt: 'Atleta agarrando una barra olimpica' },
  { src: '/portada/remo.webp', titulo: 'Resistencia', alt: 'Atleta en un remo Concept2' },
];

const FASE_ANTES = [
  {
    icono: ClipboardList,
    titulo: 'Competencias y ejercicios',
    texto: 'Crea la prueba en 3 niveles: datos, ejercicios y movimientos por categoria. 6 mediciones: tiempo, repeticiones, peso, distancia, calorias y splits HYROX.',
    etiqueta: '6 MEDICIONES',
  },
  {
    icono: Users,
    titulo: 'Atletas y categorias',
    texto: 'Da de alta atletas uno a uno o importa cientos desde CSV con plantilla descargable. Cada uno compite en su categoria.',
    etiqueta: 'CSV MASIVO',
  },
  {
    icono: UserCheck,
    titulo: 'Jueces y asignaciones',
    texto: 'Cada juez recibe sus atletas con contraseña temporal de un solo uso. Vinculo 1:1 por competencia, opcionalmente por ejercicio.',
    etiqueta: '1:1 JUEZ-ATLETA',
  },
  {
    icono: CalendarClock,
    titulo: 'Heats y arranque',
    texto: 'Series por categoria con carril fijo y cronograma automatico. Arranque sincronizado para todos los jueces: directo, cuenta regresiva o programado.',
    etiqueta: 'SALIDA UNICA',
  },
];

const FASE_DURANTE = [
  {
    icono: Timer,
    titulo: 'Medicion del juez',
    texto: 'Cronometro que no se detiene ni con la pantalla apagada, scorecard guiado ejercicio por ejercicio y modo sin conexion que sincroniza solo.',
    etiqueta: 'DESDE EL MOVIL',
  },
  {
    icono: Radio,
    titulo: 'Clasificacion en vivo',
    texto: 'Cada medicion recalcula y se emite por WebSocket a la pantalla del evento. Sin recargar: las flechas muestran quien sube y quien baja.',
    etiqueta: 'WEBSOCKET',
  },
  {
    icono: Flag,
    titulo: 'Pausa y time cap',
    texto: 'Ante cualquier novedad, pausa global que congela todo sin perder lo anotado. Al vencer el tope, el registro pasa a reps automaticamente.',
    etiqueta: 'CONTROL TOTAL',
  },
  {
    icono: Zap,
    titulo: 'Correccion al instante',
    texto: 'Un error se resetea desde Resultados y el juez vuelve a medir. La clasificacion se recalcula y queda rastro en el historial.',
    etiqueta: 'SIN PAPELES',
  },
];

const FASE_DESPUES = [
  {
    icono: FileText,
    titulo: 'Informe final',
    texto: 'General por evento, detalle por competencia con marca y juez, y lista de atletas y jueces. Vista de impresion lista para PDF.',
    etiqueta: 'PDF + CSV',
  },
  {
    icono: Download,
    titulo: 'Exportacion a Excel',
    texto: 'Un CSV por secciones con BOM para Excel, o un CSV por competencia desde Resultados. Tus datos salen cuando quieras.',
    etiqueta: 'TUS DATOS',
  },
  {
    icono: Medal,
    titulo: 'Historial auditable',
    texto: 'Cada guardado y cada reseteo deja fila en el historial. El desempate aplicado se muestra en pantalla: nada queda en discusion.',
    etiqueta: 'TRAZABILIDAD',
  },
];

const FORMATOS = ['AMRAP', 'EMOM', 'For Time', 'Chipper', 'HYROX Splits', 'Max Load'];

/**
 * Portada publica: el escaparate de los eventos, con las funcionalidades
 * ordenadas por fase (antes / durante / despues), como en las plataformas
 * de referencia del sector.
 */
export default function PortadaPage() {
  const { user } = useAuth();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Evento[]>('/eventos/publicas')
      .then((res) => setEventos(Array.isArray(res.data) ? res.data : []))
      .catch((err) => setError(mensajeDeError(err, 'No se pudieron cargar los eventos')))
      .finally(() => setCargando(false));
  }, []);

  const enCurso = eventos.filter((e) => e.estado === 'en_curso').length;

  return (
    <div className="min-h-screen bg-hyrox-void">
      <PublicHeader
        actions={
          user ? (
            <Link to="/eventos" className="btn-secondary btn-sm">
              <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Mi panel</span>
            </Link>
          ) : (
            <Link to="/login" className="btn-secondary btn-sm">
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Iniciar sesion</span>
            </Link>
          )
        }
      />

      {/* ================= HERO ================= */}
      <section className="relative isolate overflow-hidden border-b border-white/5">
        <img
          src="/portada/cuerdas.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[70%_center]"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-hyrox-void via-hyrox-void/75 to-hyrox-void/40" />
        <div className="px-4 sm:px-6 pt-16 pb-14 sm:pt-28 sm:pb-24 max-w-6xl mx-auto text-center animate-fade-up">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-hyrox-primary/20 backdrop-blur-sm text-hyrox-primary text-2xs font-bold uppercase tracking-eyebrow mb-4">
            <Trophy className="w-3 h-3" aria-hidden="true" />
            Para organizadores de CrossFit y HYROX
          </span>
          <h1 className="font-display text-5xl sm:text-7xl font-extrabold tracking-display text-hyrox-paper text-balance drop-shadow-lg">
            DIRIGE TU EVENTO.
            <br />
            <span className="text-hyrox-primary">NOSOTROS LLEVAMOS EL TIEMPO.</span>
          </h1>
          <p className="mt-4 text-sm sm:text-lg text-hyrox-paper/85 text-balance max-w-xl mx-auto">
            Competencias, jueces y atletas organizados antes de la primera manga. Cronometraje
            desde el movil y clasificacion en vivo durante. Informe final despues.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href="#eventos" className="btn-primary">
              <Radio className="w-4 h-4" aria-hidden="true" />
              Ver eventos en vivo
            </a>
            {!user && (
              <Link to="/registro" className="btn-secondary">
                Organiza tu evento
              </Link>
            )}
          </div>
        </div>
      </section>

      <main className="px-4 sm:px-6 py-10 sm:py-14 max-w-6xl mx-auto pb-safe space-y-20">
        {/* ================= CIFRAS ================= */}
        <section aria-label="Cifras" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { valor: String(eventos.length), etiqueta: 'Eventos publicados' },
            { valor: enCurso > 0 ? String(enCurso) : '—', etiqueta: 'En curso ahora' },
            { valor: '6', etiqueta: 'Tipos de medicion' },
            { valor: 'En vivo', etiqueta: 'Clasificacion WebSocket' },
          ].map((c) => (
            <div key={c.etiqueta} className="surface p-4 text-center">
              <p className="font-display text-3xl font-extrabold text-hyrox-primary">{c.valor}</p>
              <p className="mt-1 text-2xs uppercase tracking-eyebrow text-hyrox-mist">{c.etiqueta}</p>
            </div>
          ))}
        </section>

        {/* ================= EVENTOS ================= */}
        <section id="eventos" aria-label="Eventos" className="scroll-mt-20">
          <p className="eyebrow text-hyrox-primary mb-1">Eventos</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-hyrox-paper text-balance">
            Elige un evento y sigue la clasificacion.
          </h2>
          <p className="mt-2 text-sm text-hyrox-mist max-w-2xl">
            Se actualiza sola cada vez que un juez registra una medicion. Dejala fija en la
            pantalla del box.
          </p>

          <div className="mt-6">
            {error && (
              <div className="mb-5">
                <Alert tone="error">{error}</Alert>
              </div>
            )}

            {cargando ? (
              <div className="surface">
                <SkeletonList rows={3} />
              </div>
            ) : eventos.length === 0 ? (
              <div className="surface">
                <EmptyState
                  icon={CalendarX}
                  title="Todavia no hay eventos"
                  description="Cuando alguien cree uno aparecera aqui automaticamente."
                  action={
                    !user && (
                      <Link to="/registro" className="btn-primary">
                        Crear el primero
                      </Link>
                    )
                  }
                />
              </div>
            ) : (
              <GruposEventos eventos={eventos} destino={(c) => `/eventos/${c.id}`} />
            )}
          </div>
        </section>

        {/* ================= FASE 01: ANTES ================= */}
        <section aria-label="Antes de la competicion">
          <p className="eyebrow text-hyrox-primary mb-1">Fase 01 — Antes de la competicion</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-hyrox-paper text-balance">
            Todo listo antes de que lleguen los atletas.
          </h2>
          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            {FASE_ANTES.map((f, i) => (
              <article key={f.titulo} className="surface p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-hyrox-primary/12 text-hyrox-primary">
                    <f.icono className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-2xs font-bold text-hyrox-ghost">0{i + 1}</span>
                </div>
                <h3 className="text-base font-bold text-hyrox-paper">{f.titulo}</h3>
                <p className="mt-1.5 text-sm text-hyrox-mist">{f.texto}</p>
                <p className="mt-3 inline-block px-2 py-0.5 rounded-md bg-white/[0.04] font-mono text-2xs font-bold text-hyrox-accent">
                  {f.etiqueta}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* ================= FASE 02: DURANTE ================= */}
        <section aria-label="Durante la competicion">
          <p className="eyebrow text-hyrox-primary mb-1">Fase 02 — Durante la competicion</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-hyrox-paper text-balance">
            Cuando arranca el crono, todo funciona en vivo.
          </h2>
          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            {FASE_DURANTE.map((f, i) => (
              <article key={f.titulo} className="surface p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-hyrox-accent/12 text-hyrox-accent">
                    <f.icono className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-2xs font-bold text-hyrox-ghost">0{i + 1}</span>
                </div>
                <h3 className="text-base font-bold text-hyrox-paper">{f.titulo}</h3>
                <p className="mt-1.5 text-sm text-hyrox-mist">{f.texto}</p>
                <p className="mt-3 inline-block px-2 py-0.5 rounded-md bg-white/[0.04] font-mono text-2xs font-bold text-hyrox-accent">
                  {f.etiqueta}
                </p>
              </article>
            ))}
          </div>

          <div className="surface-raised mt-4 p-5 sm:p-7 text-center overflow-hidden relative">
            <Layers className="mx-auto w-8 h-8 text-hyrox-primary" aria-hidden="true" />
            <p className="mt-3 font-display text-2xl sm:text-3xl font-extrabold text-hyrox-paper">
              EL MARCADOR NO ESPERA.
            </p>
            <p className="mt-2 text-sm text-hyrox-mist max-w-xl mx-auto">
              Un juez guarda una medicion y la tabla se mueve en segundos en todos los
              dispositivos. Sin refrescar. Sin hojas de calculo.
            </p>
            <a href="#eventos" className="btn-primary mt-5 inline-flex">
              <Bell className="w-4 h-4" aria-hidden="true" />
              Abrir un evento en vivo
            </a>
          </div>
        </section>

        {/* ================= FORMATOS + GALERIA ================= */}
        <section aria-label="Formatos">
          <p className="eyebrow text-hyrox-primary mb-1">Cada tipo de pista</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-hyrox-paper text-balance">
            Cada formato, juzgado de la misma manera.
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {FORMATOS.map((f) => (
              <span
                key={f}
                className="px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-2xs font-bold uppercase tracking-eyebrow text-hyrox-paper"
              >
                {f}
              </span>
            ))}
          </div>

          <div aria-label="Galeria" className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {FOTOS.map((foto, i) => (
              <figure
                key={foto.src}
                className={`relative overflow-hidden rounded-2xl bg-hyrox-carbon ${
                  i === 0 ? 'row-span-2 aspect-[2/3] sm:aspect-auto' : 'aspect-[4/3] sm:col-span-2 sm:aspect-[16/7]'
                }`}
              >
                <img
                  src={foto.src}
                  alt={foto.alt}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10 font-display text-lg font-bold uppercase tracking-wide text-hyrox-paper">
                  {foto.titulo}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ================= FASE 03: DESPUES ================= */}
        <section aria-label="Despues de la competicion">
          <p className="eyebrow text-hyrox-primary mb-1">Fase 03 — Despues de la competicion</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-hyrox-paper text-balance">
            El evento termina. El registro queda.
          </h2>
          <div className="mt-6 grid sm:grid-cols-3 gap-3">
            {FASE_DESPUES.map((f, i) => (
              <article key={f.titulo} className="surface p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-hyrox-info/12 text-hyrox-info">
                    <f.icono className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-2xs font-bold text-hyrox-ghost">0{i + 1}</span>
                </div>
                <h3 className="text-base font-bold text-hyrox-paper">{f.titulo}</h3>
                <p className="mt-1.5 text-sm text-hyrox-mist">{f.texto}</p>
                <p className="mt-3 inline-block px-2 py-0.5 rounded-md bg-white/[0.04] font-mono text-2xs font-bold text-hyrox-accent">
                  {f.etiqueta}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* ================= CTA FINAL ================= */}
        <section aria-label="Empieza tu evento" className="surface p-6 sm:p-10 text-center">
          <Trophy className="mx-auto w-8 h-8 text-hyrox-primary" aria-hidden="true" />
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold text-hyrox-paper text-balance">
            TU PROXIMO EVENTO EMPIEZA AQUI.
          </h2>
          <p className="mt-2 text-sm text-hyrox-mist max-w-xl mx-auto">
            Crea tu cuenta, monta tu primer evento y deja la clasificacion fija en la pantalla
            del box. Sin instalar nada.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {!user ? (
              <>
                <Link to="/registro" className="btn-primary">
                  Crea tu cuenta gratis
                </Link>
                <Link to="/login" className="btn-secondary">
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  Entrar
                </Link>
              </>
            ) : (
              <Link to="/eventos" className="btn-primary">
                <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
                Ir a mis eventos
              </Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
