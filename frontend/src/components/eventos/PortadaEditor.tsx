import { ImagePlus, Trash2 } from 'lucide-react';
import api, { getEventoActiva } from '../../api/client';
import { Alert, Button } from '../ui';
import PortadaImagen from './PortadaImagen';
import { MAX_MB_IMAGEN, subirArchivoImagen, useSubidaImagen } from '../../hooks/useSubidaImagen';
import type { Evento } from '../../types';

/**
 * Portada del evento (como el escaparate de FaceWOD).
 *
 * La ve y la cambia quien administral evento activa: su admin o el
 * superadmin (el backend lo valida). La imagen se muestra en las tarjetas,
 * en la página pública del evento y en el informe final.
 */
export default function PortadaEditor() {
  const compId = getEventoActiva();
  const u = useSubidaImagen({
    cargar: async () => {
      if (!compId) return { url: null, titulo: '' };
      const res = await api.get<Evento>(`/eventos/publicas/${compId}`);
      return { url: res.data.imagen_url ?? null, titulo: res.data.nombre };
    },
    guardar: (archivo) => subirArchivoImagen(`/eventos/${compId}/imagen`, archivo, 'put'),
    quitar: async () => {
      await api.delete(`/eventos/${compId}/imagen`);
    },
  });

  if (!compId || u.cargando) return null;

  const visible = u.vistaPrevia ?? u.imagenUrl;

  return (
    <section className="surface overflow-hidden mb-6">
      <header className="panel-header">
        <div>
          <h2 className="eyebrow">Portada del evento</h2>
          <p className="text-2xs text-hyrox-ghost mt-0.5">
            {u.titulo ? `${u.titulo} · ` : ''}Se ve en las tarjetas y en la página pública del evento
          </p>
        </div>
      </header>

      <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:items-center">
        {visible ? (
          <PortadaImagen
            src={visible}
            alt={u.vistaPrevia ? 'Vista previa de la portada' : `Portada de ${u.titulo}`}
            clase="w-full sm:w-64 rounded-xl border border-white/[0.08] shrink-0"
          />
        ) : (
          <div
            aria-hidden="true"
            className="w-full sm:w-64 aspect-video rounded-xl border border-dashed border-white/15 bg-white/[0.02] grid place-items-center text-2xs text-hyrox-ghost shrink-0"
          >
            Sin portada
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-3">
          {u.error && <Alert tone="error" onDismiss={() => u.setError('')}>{u.error}</Alert>}
          {u.exito && <Alert tone="success" onDismiss={() => u.setExito('')}>{u.exito}</Alert>}

          <input
            ref={u.inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={u.onElegir}
            className="block w-full text-sm text-hyrox-mist file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-hyrox-primary/15 file:text-hyrox-primary hover:file:bg-hyrox-primary/25 file:cursor-pointer"
          />
          <p className="field-hint">JPG, PNG o WebP de hasta {MAX_MB_IMAGEN} MB. Se recomienda apaisada (16:9).</p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={ImagePlus} onClick={u.guardar} loading={u.guardando} disabled={!u.seleccion}>
              {u.imagenUrl ? 'Reemplazar portada' : 'Subir portada'}
            </Button>
            {u.imagenUrl && (
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                onClick={u.quitar}
                loading={u.eliminando}
                className="hover:text-hyrox-danger"
              >
                Quitar
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
