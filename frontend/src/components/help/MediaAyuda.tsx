import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cx } from '../ui';

/**
 * Imagen o GIF de un tutorial.
 *
 * Las capturas se generan aparte y pueden faltar (un flujo todavia sin grabar,
 * una pantalla que cambio de nombre). En vez de dejar el icono roto del
 * navegador, se muestra un hueco explicito para que se note que falta el
 * archivo, no que la ayuda este incompleta.
 */
export default function MediaAyuda({
  src,
  alt,
  className,
  proporcion = 'aspect-[1366/633]',
}: {
  src?: string;
  alt: string;
  className?: string;
  proporcion?: string;
}) {
  const [fallo, setFallo] = useState(false);

  if (!src || fallo) {
    return (
      <div
        className={cx(
          'grid place-items-center rounded-xl border border-dashed border-white/10 bg-hyrox-carbon/60 text-hyrox-ghost',
          proporcion,
          className
        )}
      >
        <div className="flex flex-col items-center gap-2 px-4 text-center">
          <ImageOff className="w-6 h-6" aria-hidden="true" />
          <span className="text-2xs uppercase tracking-eyebrow">Captura pendiente</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFallo(true)}
      className={cx(
        'w-full rounded-xl border border-white/[0.08] bg-hyrox-carbon object-contain',
        proporcion,
        className
      )}
    />
  );
}
