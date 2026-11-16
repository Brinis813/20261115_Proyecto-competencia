import { GripVertical, Trash2 } from 'lucide-react';
import { IconButton, cx } from '../ui';
import type { TipoMedicion, UnidadDistancia } from '../../types';
import { seleccionarAlEnfocar, type MovimientoUI } from '../../utils/competenciaFormMapper';

const MEDICIONES: Array<{ valor: TipoMedicion; etiqueta: string }> = [
  { valor: 'tiempo', etiqueta: 'Tiempo (cronómetro)' },
  { valor: 'repeticiones', etiqueta: 'Repeticiones (conteo)' },
  { valor: 'peso', etiqueta: 'Peso (máximo)' },
  { valor: 'distancia', etiqueta: 'Distancia' },
  { valor: 'calorías', etiqueta: 'Calorías' },
];

/**
 * Una fila de movimiento dentro de la banda de su categoría.
 * Presentacional: todo el estado vive en CompetenciaForm; aquí solo
 * llegan el movimiento y callbacks ya acotados a su WOD/categoría.
 */
export default function MovimientoRow({
  conPeso,
  movimiento: m,
  indice,
  totalFilas,
  arrastrando,
  error,
  onCambiar,
  onQuitar,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  conPeso: boolean;
  movimiento: MovimientoUI;
  indice: number;
  totalFilas: number;
  arrastrando: boolean;
  error?: string;
  onCambiar: (cambios: Partial<MovimientoUI>) => void;
  onQuitar: () => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
}) {
  const esDistancia = m.tipo_medicion === 'distancia';
  const esCalorias = m.tipo_medicion === 'calorías';
  const tieneDosSubcampos = esDistancia || esCalorias;

  return (
    <div
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, indice)}
      className={`mt-1.5 grid items-center gap-2 transition-opacity ${conPeso ? 'grid-cols-[20px_1fr_140px_minmax(0,1fr)_minmax(0,1fr)_110px_80px_40px]' : 'grid-cols-[20px_1fr_140px_minmax(0,1fr)_minmax(0,1fr)_80px_40px]'} ${arrastrando ? 'opacity-50' : ''}`}
    >
      {/* Grip sobre la línea verde: misma altura que la caja del nombre.
          Único punto de arrastre: la fila ya no es draggable para no
          interferir con la edición de los campos. */}
      <div className="flex flex-col">
        <span className="text-2xs text-hyrox-ghost mb-0.5 invisible select-none" aria-hidden="true">
          ·
        </span>
        <span
          draggable
          onDragStart={(e) => onDragStart(e, indice)}
          onDragEnd={onDragEnd}
          className="flex min-h-[2.75rem] items-center justify-center cursor-grab active:cursor-grabbing rounded border-l-4 border-emerald-500 hover:bg-white/10 touch-none select-none"
          title="Arrastra para reordenar"
          aria-label="Arrastra para reordenar el movimiento"
        >
          <GripVertical className="w-4 h-4 text-emerald-400/80 pointer-events-none" />
        </span>
      </div>
      {/* Movimiento */}
      <div className="flex flex-col">
        <span className="text-2xs text-hyrox-ghost mb-0.5">Movimiento</span>
        <input
          id={`mov-${m.clave}`}
          className={cx('input-field', error && 'input-error')}
          value={m.nombre}
          onChange={(e) => onCambiar({ nombre: e.target.value })}
          maxLength={100}
          placeholder="Wall Balls"
          aria-label="Nombre del movimiento"
          title={error ?? undefined}
        />
      </div>
      {/* Medición */}
      <div className="flex flex-col">
        <span className="text-2xs text-hyrox-ghost mb-0.5">Medición</span>
        <select
          className="input-field"
          value={m.tipo_medicion}
          onChange={(e) => onCambiar({ tipo_medicion: e.target.value as TipoMedicion })}
          aria-label="Tipo de medición"
        >
          {MEDICIONES.map((med) => (
            <option key={med.valor} value={med.valor}>
              {med.etiqueta}
            </option>
          ))}
        </select>
      </div>
      {/* Sub-campo 1 */}
      <div className="flex flex-col">
        <span className="text-2xs text-hyrox-ghost mb-0.5">
          {m.tipo_medicion === 'tiempo' && 'Duración del Ejercicio'}
          {m.tipo_medicion === 'repeticiones' && 'Repeticiones'}
          {m.tipo_medicion === 'peso' && 'Intentos'}
          {esDistancia && 'Medida'}
          {esCalorias && 'Medida'}
        </span>
        {m.tipo_medicion === 'tiempo' && (
          <div className="flex items-center gap-1 w-full">
            <input
              className="input-field text-center flex-1 min-w-0"
              type="number"
              min={0}
              max={999}
              value={Math.floor(m.duracionSeg / 60)}
              onFocus={seleccionarAlEnfocar}
              onChange={(e) => {
                const segs = m.duracionSeg % 60;
                const mins = Number(e.target.value) || 0;
                onCambiar({ duracionSeg: mins * 60 + segs });
              }}
              aria-label="Minutos"
            />
            <span className="text-hyrox-ghost font-bold text-lg">:</span>
            <input
              className="input-field text-center flex-1 min-w-0"
              type="number"
              min={0}
              max={59}
              value={m.duracionSeg % 60}
              onFocus={seleccionarAlEnfocar}
              onChange={(e) => {
                const mins = Math.floor(m.duracionSeg / 60);
                const segs = Number(e.target.value) || 0;
                onCambiar({ duracionSeg: mins * 60 + Math.min(59, segs) });
              }}
              aria-label="Segundos"
            />
          </div>
        )}
        {m.tipo_medicion === 'repeticiones' && (
          <input
            className="input-field text-center"
            type="number"
            min={0}
            max={100000}
            value={m.repeticiones}
            onFocus={seleccionarAlEnfocar}
            onChange={(e) => onCambiar({ repeticiones: Number(e.target.value) })}
            aria-label="Repeticiones"
          />
        )}
        {m.tipo_medicion === 'peso' && (
          <input
            className="input-field text-center"
            type="number"
            min={1}
            max={20}
            value={m.intentos}
            onFocus={seleccionarAlEnfocar}
            onChange={(e) => onCambiar({ intentos: Number(e.target.value) })}
            aria-label="Intentos"
          />
        )}
        {esDistancia && (
          <select
            className="input-field"
            value={m.unidad_distancia}
            onChange={(e) => onCambiar({ unidad_distancia: e.target.value as UnidadDistancia })}
            aria-label="Unidad"
          >
            <option value="m">m</option>
            <option value="km">km</option>
            <option value="mi">mi</option>
          </select>
        )}
        {esCalorias && (
          <select
            className="input-field"
            value={m.unidad_energia}
            onChange={(e) => onCambiar({ unidad_energia: e.target.value as 'kcal' | 'cal' })}
            aria-label="Unidad"
          >
            <option value="kcal">Kcal</option>
            <option value="cal">cal</option>
          </select>
        )}
      </div>
      {/* Sub-campo 2 (solo para distancia y calorías) */}
      <div className="flex flex-col">
        {tieneDosSubcampos && (
          <span className="text-2xs text-hyrox-ghost mb-0.5">
            {esDistancia && 'Distancia'}
            {esCalorias && 'Repeticiones'}
          </span>
        )}
        {esDistancia && (
          <input
            className="input-field text-center"
            type="number"
            min={0}
            max={100000}
            value={m.distancia}
            onFocus={seleccionarAlEnfocar}
            onChange={(e) => onCambiar({ distancia: Number(e.target.value) })}
            aria-label="Distancia"
          />
        )}
        {esCalorias && (
          <input
            className="input-field text-center"
            type="number"
            min={0}
            max={10000}
            value={m.calorias}
            onFocus={seleccionarAlEnfocar}
            onChange={(e) => onCambiar({ calorias: Number(e.target.value) })}
            aria-label="Calorías"
          />
        )}
      </div>
      {/* Peso (solo con carga; propio de la categoría) */}
      {conPeso && (
        <div className="flex flex-col">
          <span className="text-2xs text-hyrox-ghost mb-0.5">Peso</span>
          <div className="flex items-center gap-1">
            <input
              className="input-field text-center flex-1 min-w-0"
              type="number"
              min={0}
              max={5000}
              value={m.peso}
              onFocus={seleccionarAlEnfocar}
              onChange={(e) => onCambiar({ peso: Number(e.target.value) })}
              aria-label="Peso"
            />
            <select
              className="input-field w-[4.2rem] shrink-0"
              value={m.unidad_peso}
              onChange={(e) =>
                onCambiar({ unidad_peso: e.target.value as MovimientoUI['unidad_peso'] })
              }
              aria-label="Unidad de peso"
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </div>
        </div>
      )}
      {/* Puntaje */}
      <div className="flex flex-col">
        <span className="text-2xs text-hyrox-ghost mb-0.5">Puntaje</span>
        <input
          className="input-field text-center"
          type="number"
          min={0}
          max={10000}
          value={m.puntaje}
          onFocus={seleccionarAlEnfocar}
          onChange={(e) => onCambiar({ puntaje: Number(e.target.value) })}
          aria-label="Puntaje"
        />
      </div>
      <IconButton
        icon={Trash2}
        label="Quitar movimiento"
        onClick={onQuitar}
        disabled={totalFilas <= 1}
      />
    </div>
  );
}
