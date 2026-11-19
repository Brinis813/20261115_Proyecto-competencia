import { useEffect, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import { Modal, Alert, Spinner } from '../ui';
import {
  ETIQUETA_MEDICION,
  ETIQUETA_TIEBREAK_COMPETENCIA,
  unidadDeWod,
  type Competencia,
  type MovimientoEsquema,
  type Wod,
} from '../../types';
import { formatearCategorias } from '../../utils/formato';
import { formatoTope } from '../../utils/juezMedicion';

/** Segundos a etiqueta legible (MM:SS). */
function etiquetaDuracion(seg: number): string {
  if (!seg || seg <= 0) return '—';
  return formatoTope(seg);
}

function etiquetaFlujo(tipo: Competencia['tipo_flujo']): string {
  return tipo === 'en_serie' ? 'En serie (un ejercicio a la vez)' : 'Estaciones simultáneas';
}

/** Texto corto del objetivo de un movimiento según su medición. */
function objetivoMovimiento(m: MovimientoEsquema, division: string): string {
  const reps = m.reps?.[division] ?? 0;
  switch (m.tipo_medicion) {
    case 'calorías':
      return `${m.calorias ?? reps} ${m.unidad_energia ?? 'kcal'}`;
    case 'distancia':
      return `${m.distancia ?? reps} ${m.unidad_distancia ?? 'm'}`;
    case 'tiempo':
      return `${etiquetaDuracion(m.duracion_seg ?? reps)} min`;
    case 'peso':
      return `${m.intentos ?? reps} intentos`;
    default:
      return `${m.repeticiones ?? reps} reps`;
  }
}

function BloqueMovimientos({ wod }: { wod: Wod }) {
  const esquema = wod.esquema;
  if (!esquema) return null;
  const porDivision = esquema.movimientos_por_division ?? {};
  const claves = Object.keys(porDivision).filter((k) => (porDivision[k]?.length ?? 0) > 0);
  if (claves.length === 0 && (esquema.movimientos?.length ?? 0) === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {esquema.distancia_meta !== undefined && (
        <p className="text-2xs text-hyrox-mist">
          Meta:{' '}
          {typeof esquema.distancia_meta === 'number'
            ? `${esquema.distancia_meta} ${wod.unidad_distancia ?? 'm'}`
            : Object.entries(esquema.distancia_meta)
                .map(([k, v]) => `${k}: ${v} ${wod.unidad_distancia ?? 'm'}`)
                .join(' · ')}
        </p>
      )}
      {typeof esquema.intentos === 'number' && (
        <p className="text-2xs text-hyrox-mist">Intentos: {esquema.intentos}</p>
      )}
      {claves.length > 0
        ? claves.map((division) => (
            <div key={division}>
              <p className="text-2xs font-bold text-hyrox-primary uppercase tracking-wide">
                {division}
              </p>
              <ul className="mt-1 space-y-1">
                {(porDivision[division] ?? []).map((m, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-hyrox-paper/90 truncate">
                      {m.nombre}
                      {m.peso?.[division] ? (
                        <span className="ml-2 font-mono text-2xs text-hyrox-primary">
                          {m.peso[division]} {m.unidad_peso ?? 'kg'}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-hyrox-ghost shrink-0 font-mono text-2xs">
                      {objetivoMovimiento(m, division)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        : (esquema.movimientos ?? []).map((m, i) => (
            <p key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-hyrox-paper/90 truncate">{m.nombre}</span>
              <span className="text-hyrox-ghost shrink-0 font-mono text-2xs">
                {m.tipo_medicion ? ETIQUETA_MEDICION[m.tipo_medicion] : ''}
              </span>
            </p>
          ))}
    </div>
  );
}

/**
 * Resumen de solo lectura de una competencia: datos, categorías y WODs con
 * sus movimientos, sin pasar por el formulario de edición.
 */
export default function ResumenCompetencia({
  competenciaId,
  onClose,
}: {
  /** null = cerrado. */
  competenciaId: number | null;
  onClose: () => void;
}) {
  const [detalle, setDetalle] = useState<Competencia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (competenciaId === null) {
      setDetalle(null);
      setError('');
      return;
    }
    setCargando(true);
    setError('');
    api
      .get<Competencia>(`/competencias/${competenciaId}`)
      .then((res) => setDetalle(res.data))
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar el resumen')))
      .finally(() => setCargando(false));
  }, [competenciaId]);

  const wods = [...(detalle?.wods ?? [])].sort((a, b) => a.orden - b.orden);

  return (
    <Modal
      open={competenciaId !== null}
      onClose={onClose}
      title={detalle?.nombre ?? 'Resumen de la competencia'}
      description={detalle ? 'Vista de solo lectura: para cambiar algo usa Editar.' : undefined}
      size="lg"
    >
      {error && <Alert tone="error">{error}</Alert>}
      {cargando || (competenciaId !== null && !detalle && !error) ? (
        <Spinner label="Cargando resumen..." />
      ) : detalle ? (
        <div className="space-y-5">
          {detalle.imagen_url && (
            <img
              src={detalle.imagen_url}
              alt={`Portada de ${detalle.nombre}`}
              loading="lazy"
              decoding="async"
              className="w-full aspect-video rounded-xl border border-white/[0.08] object-cover"
            />
          )}
          {detalle.descripcion && <p className="text-sm text-hyrox-mist">{detalle.descripcion}</p>}

          <section aria-label="Datos generales">
            <div className="flex flex-wrap gap-1.5">
              <span className="badge-gray">{detalle.tipo_participacion}</span>
              {(detalle.duracion_minutos ?? 0) > 0 && (
                <span className="badge-gray">Cap {detalle.duracion_minutos} min</span>
              )}
              {(detalle.rondas ?? 0) > 1 && (
                <span className="badge-gray">{detalle.rondas} rondas</span>
              )}
              <span className="badge-gray">{detalle.estado}</span>
            </div>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-hyrox-ghost">Flujo</dt>
                <dd className="text-hyrox-paper text-right">{etiquetaFlujo(detalle.tipo_flujo)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-hyrox-ghost">Publicación</dt>
                <dd className="text-hyrox-paper text-right">
                  {detalle.tipo_publicacion === 'tiempo_real' ? 'Tiempo real' : 'Al finalizar'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-hyrox-ghost">Desempate</dt>
                <dd className="text-hyrox-paper text-right">
                  {detalle.tiebreak_policy
                    ? ETIQUETA_TIEBREAK_COMPETENCIA[detalle.tiebreak_policy]
                    : (detalle.metodo_desempate ?? '—')}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-hyrox-ghost">Categorías</dt>
                <dd className="text-hyrox-paper text-right">
                  {formatearCategorias(detalle.divisiones)}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-label="WODs">
            <p className="eyebrow mb-2">WODs ({wods.length})</p>
            {wods.length === 0 ? (
              <p className="text-xs text-hyrox-warning">Sin wods definidos</p>
            ) : (
              <ul className="space-y-3">
                {wods.map((w) => (
                  <li
                    key={w.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
                  >
                    <p className="flex items-center gap-2 text-sm">
                      {w.imagen_url ? (
                        <img
                          src={w.imagen_url}
                          alt=""
                          className="w-10 h-10 rounded-lg border border-white/[0.08] object-cover shrink-0"
                        />
                      ) : (
                        <span className="grid place-items-center w-6 h-6 rounded bg-white/[0.06] font-mono text-2xs font-bold text-hyrox-mist shrink-0">
                          {w.orden}
                        </span>
                      )}
                      <span className="font-semibold text-hyrox-paper truncate flex-1">
                        {w.nombre_ejercicio}
                      </span>
                      <span className="text-hyrox-ghost shrink-0 text-xs">
                        {ETIQUETA_MEDICION[w.tipo_medicion]}
                      </span>
                    </p>
                    <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-hyrox-mist font-mono">
                      <span>Max {w.puntaje_maximo} pts</span>
                      {w.tiempo_cap > 0 && <span>Tope {etiquetaDuracion(w.tiempo_cap)}</span>}
                      {w.tiempo_estimado_duracion > 0 && (
                        <span>Duración ~{etiquetaDuracion(w.tiempo_estimado_duracion)}</span>
                      )}
                      {w.tipo_medicion === 'distancia' && <span>Unidad {unidadDeWod(w)}</span>}
                      {w.esquema && <span className="uppercase">{w.esquema.modalidad}</span>}
                    </p>
                    <BloqueMovimientos wod={w} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(detalle.categorias?.length ?? 0) > 0 && (
            <section aria-label="Categorías">
              <p className="eyebrow mb-2">Categorías ({detalle.categorias?.length})</p>
              <ul className="flex flex-wrap gap-1.5">
                {(detalle.categorias ?? []).map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg bg-white/[0.04] border border-white/[0.08] px-2 py-1 text-xs text-hyrox-paper"
                  >
                    {c.nombre} {c.genero}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {wods.length === 0 && (
            <p className="flex items-center gap-2 text-2xs text-hyrox-ghost">
              <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" />
              Completa la competencia desde Editar para agregar sus WODs.
            </p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
