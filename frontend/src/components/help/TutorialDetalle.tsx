import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, AlertTriangle, Play, X } from 'lucide-react';
import { Panel, Button, cx } from '../ui';
import MediaAyuda from './MediaAyuda';
import { ETIQUETA_ROL, type PasoTutorial, type Tutorial } from '../../data/tutoriales';

type Foco = NonNullable<PasoTutorial['foco']>;

/**
 * Circulo naranja sobre el punto donde hay que hacer clic.
 *
 * Va en porcentaje, no en pixeles: la captura se escala segun el ancho de la
 * pantalla y el circulo tiene que seguir cayendo en el mismo boton.
 */
function SenalDeClic({ foco, className }: { foco?: Foco; className?: string }) {
  if (!foco) return null;

  return (
    <span
      className={cx(
        'pointer-events-none absolute w-[4.4%] aspect-square -translate-x-1/2 -translate-y-1/2',
        className,
      )}
      style={{ left: `${foco.x}%`, top: `${foco.y}%` }}
      aria-hidden="true"
    >
      {/* El aro blanco es lo que hace que se distinga tambien encima de un
          boton naranja o rojo de la propia aplicacion. */}
      <span className="absolute inset-0 rounded-full bg-hyrox-primary/50 animate-ping" />
      <span className="absolute -inset-[18%] rounded-full border-2 border-hyrox-primary/80" />
      <span className="absolute inset-0 rounded-full border-2 border-white bg-hyrox-primary/25 shadow-glow-primary" />
    </span>
  );
}

/**
 * Ficha completa de un tutorial: la animacion del flujo entero arriba y
 * debajo el paso a paso con su captura.
 *
 * El GIF va detras de un boton en vez de reproducirse solo: pesa bastante mas
 * que las capturas y en el movil de un juez, a mitad de evento, no
 * conviene descargarlo sin que lo pida.
 */
export default function TutorialDetalle({
  tutorial,
  onVolver,
}: {
  tutorial: Tutorial;
  onVolver: () => void;
}) {
  const [verGif, setVerGif] = useState(false);
  const [ampliada, setAmpliada] = useState<{ src: string; alt: string; foco?: Foco } | null>(null);
  const Icono = tutorial.icono;

  return (
    <div className="space-y-5 animate-fade-in">
      <button
        type="button"
        onClick={onVolver}
        className="inline-flex items-center gap-2 text-sm font-medium text-hyrox-mist hover:text-hyrox-paper transition-colors duration-200 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Todos los tutoriales
      </button>

      {/* ---------- Cabecera ---------- */}
      <Panel className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid place-items-center w-12 h-12 rounded-2xl bg-hyrox-primary/12 text-hyrox-primary shrink-0">
            <Icono className="w-6 h-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="badge badge-orange">{ETIQUETA_ROL[tutorial.rol]}</span>
              <span className="text-2xs uppercase tracking-eyebrow text-hyrox-ghost">
                {tutorial.pasos.length} pasos
              </span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-hyrox-paper tracking-display">
              {tutorial.titulo}
            </h2>
            <p className="text-sm text-hyrox-mist mt-1">{tutorial.resumen}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tutorial.gif && (
              <Button
                variant="secondary"
                size="sm"
                icon={Play}
                onClick={() => setVerGif((v) => !v)}
              >
                {verGif ? 'Ocultar animación' : 'Ver animación'}
              </Button>
            )}
            {tutorial.ruta && (
              <Link
                to={tutorial.ruta}
                className="btn-primary btn-sm inline-flex items-center gap-2"
              >
                Ir a la pantalla
                <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        {verGif && tutorial.gif && (
          <div className="mt-5">
            <MediaAyuda
              src={tutorial.gif}
              alt={`Animación del flujo: ${tutorial.titulo}`}
              proporcion="aspect-[1366/633]"
              className="object-contain"
            />
            <p className="text-2xs text-hyrox-ghost mt-2">
              El flujo completo en bucle. Debajo está el mismo recorrido, paso a paso.
            </p>
          </div>
        )}
      </Panel>

      {/* ---------- Pasos ---------- */}
      <ol className="space-y-4">
        {tutorial.pasos.map((paso, i) => (
          <li key={paso.titulo}>
            <Panel className="p-5 sm:p-6">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-3xl font-bold text-hyrox-primary/70 tabular-nums leading-none">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-base font-bold text-hyrox-paper leading-snug">
                      {paso.titulo}
                    </h3>
                  </div>
                  <p className="text-sm text-hyrox-mist leading-relaxed mt-3">{paso.detalle}</p>

                  {paso.aviso && (
                    <p className="mt-4 flex gap-2.5 rounded-xl border border-hyrox-warning/25 bg-hyrox-warning/10 px-3.5 py-3 text-sm text-hyrox-paper/90">
                      <AlertTriangle
                        className="w-4.5 h-4.5 shrink-0 text-hyrox-warning mt-0.5"
                        aria-hidden="true"
                      />
                      <span>{paso.aviso}</span>
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    paso.imagen &&
                    setAmpliada({ src: paso.imagen, alt: paso.titulo, foco: paso.foco })
                  }
                  className={cx(
                    'relative block w-full text-left rounded-xl transition-transform duration-200',
                    paso.imagen && 'hover:scale-[1.01] cursor-zoom-in',
                  )}
                  aria-label={`Ampliar la captura del paso ${i + 1}`}
                >
                  <MediaAyuda src={paso.imagen} alt={`Paso ${i + 1}: ${paso.titulo}`} />
                  <SenalDeClic foco={paso.foco} />
                </button>
              </div>
            </Panel>
          </li>
        ))}
      </ol>

      {/* ---------- Captura ampliada ---------- */}
      {ampliada && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-hyrox-void/92 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setAmpliada(null)}
          role="dialog"
          aria-modal="true"
          aria-label={ampliada.alt}
        >
          <button
            type="button"
            onClick={() => setAmpliada(null)}
            className="icon-btn absolute top-4 right-4"
            aria-label="Cerrar la captura"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
          <span className="relative inline-block" onClick={(e) => e.stopPropagation()}>
            <img
              src={ampliada.src}
              alt={ampliada.alt}
              className="max-h-[88vh] max-w-full rounded-xl border border-white/10 shadow-elevated"
            />
            <SenalDeClic foco={ampliada.foco} />
          </span>
        </div>
      )}
    </div>
  );
}
