import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { mensajeDeError } from '../../api/client';
import { Alert, Button } from '../ui';
import { MAX_MB_IMAGEN, subirArchivoImagen, validarArchivoImagen } from '../../hooks/useSubidaImagen';

/**
 * Foto de un WOD dentro del formulario de la competencia.
 *
 * La subida va desacoplada (el WOD nuevo aún no tiene id): aquí se sube a
 * POST /competencias/wod-imagen y se devuelve la URL, que el padre guarda
 * como `imagen_url` al crear o editar la competencia. Se ve en el panel
 * del juez y en el leaderboard.
 */
export default function ImagenWod({
  value,
  onChange,
  etiqueta,
}: {
  /** URL actual (`/api/uploads/wods/...`). null = sin imagen. */
  value: string | null;
  onChange: (url: string | null) => void;
  /** Nombre del WOD, para los textos de ayuda. */
  etiqueta: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  async function onElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0] ?? null;
    setError('');
    if (!archivo) return;
    const fallo = validarArchivoImagen(archivo);
    if (fallo) {
      setError(fallo);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setSubiendo(true);
    try {
      onChange(await subirArchivoImagen('/competencias/wod-imagen', archivo, 'post'));
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo subir la imagen'));
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img
          src={value}
          alt={`Foto de ${etiqueta}`}
          className="w-20 h-20 rounded-xl border border-white/[0.08] object-cover shrink-0"
        />
      ) : (
        <div
          aria-hidden="true"
          className="w-20 h-20 rounded-xl border border-dashed border-white/15 bg-white/[0.02] grid place-items-center text-2xs text-hyrox-ghost shrink-0"
        >
          Sin foto
        </div>
      )}

      <div className="flex-1 min-w-0 space-y-2">
        <p className="label">Foto del WOD</p>
        {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => void onElegir(e)}
          disabled={subiendo}
          aria-label={`Foto de ${etiqueta}`}
          className="block w-full text-sm text-hyrox-mist file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-hyrox-primary/15 file:text-hyrox-primary hover:file:bg-hyrox-primary/25 file:cursor-pointer disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center gap-2">
          {subiendo && <span className="text-2xs text-hyrox-mist">Subiendo...</span>}
          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={() => onChange(null)}
              className="hover:text-hyrox-danger"
            >
              Quitar
            </Button>
          )}
          {!value && !subiendo && (
            <span className="inline-flex items-center gap-1.5 text-2xs text-hyrox-ghost">
              <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
              JPG, PNG o WebP de hasta {MAX_MB_IMAGEN} MB
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
