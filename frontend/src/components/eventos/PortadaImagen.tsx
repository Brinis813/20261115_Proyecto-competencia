/**
 * Portada de evento con encuadre garantizado (como Boxpodium/Wodreps).
 *
 * Las portadas subidas vienen en cualquier proporcion (logos cuadrados,
 * fotos verticales...). En vez de `object-cover` pelado —que recorta la
 * imagen y decapita logos—, el marco es 16:9 fijo, la imagen se muestra
 * ENTERA (`object-contain`) y el fondo lo rellena la misma foto
 * difuminada, sin bandas negras ni recortes.
 */
export default function PortadaImagen({
  src,
  alt,
  aspecto = 'aspect-video',
  tono = 'oscuro',
  clase = '',
  eager = false,
}: {
  src: string;
  alt: string;
  /** Proporcion del marco, ej. 'aspect-video' o 'aspect-[21/9]'. */
  aspecto?: string;
  /** 'oscuro' = relleno difuminado (pantalla); 'claro' = fondo blanco (impresion). */
  tono?: 'oscuro' | 'claro';
  clase?: string;
  eager?: boolean;
}) {
  const fondo =
    tono === 'oscuro' ? 'bg-black' : 'bg-white';
  return (
    <div className={`relative overflow-hidden ${fondo} ${aspecto} ${clase}`}>
      {tono === 'oscuro' && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
        />
      )}
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="absolute inset-0 h-full w-full object-contain"
      />
    </div>
  );
}
