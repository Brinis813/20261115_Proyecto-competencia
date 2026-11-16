import { Plus, Trash2 } from 'lucide-react';
import { Button, Field, IconButton, Select } from '../ui';
import { SegmentoEsquema } from '../../types';

interface Props {
  segmentos: SegmentoEsquema[];
  onChange: (segmentos: SegmentoEsquema[]) => void;
}

export default function SegmentosEditor({ segmentos, onChange }: Props) {
  function addSegmento() {
    onChange([
      ...segmentos,
      { numero: segmentos.length + 1, nombre: '', tipo: 'carrera', duracion_estimada_ms: 0 },
    ]);
  }

  function updateSegmento(index: number, cambios: Partial<SegmentoEsquema>) {
    onChange(segmentos.map((s, i) => (i === index ? { ...s, ...cambios } : s)));
  }

  return (
    <div className="space-y-3 mt-4 border-t border-white/[0.08] pt-4">
      <h3 className="font-semibold text-hyrox-paper text-sm">Segmentos HYROX</h3>
      {segmentos.map((s, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Field
            label="Nombre"
            value={s.nombre}
            onChange={(e) => updateSegmento(i, { nombre: e.target.value })}
            className="flex-1"
          />
          <Select
            label="Tipo"
            value={s.tipo}
            onChange={(e) => updateSegmento(i, { tipo: e.target.value as any })}
          >
            <option value="carrera">Carrera</option>
            <option value="ejercicio">Ejercicio</option>
            <option value="transicion">Transicion</option>
          </Select>
          <Field
            label="Duración (min)"
            type="number"
            value={(s.duracion_estimada_ms / 60000).toFixed(1)}
            onChange={(e) =>
              updateSegmento(i, {
                duracion_estimada_ms: Math.round(Number(e.target.value) * 60000),
              })
            }
            className="w-24"
          />
          <IconButton
            icon={Trash2}
            label={`Quitar segmento ${i + 1}`}
            onClick={() => onChange(segmentos.filter((_, idx) => idx !== i))}
            className="mt-6"
          />
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={addSegmento}>
        Añadir segmento
      </Button>
    </div>
  );
}
