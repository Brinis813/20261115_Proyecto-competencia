/** Marca de la aplicacion: se repite en la barra lateral, el login y las vistas publicas. */
export default function Brand({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const grande = size === 'lg';

  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <span
        className={
          grande
            ? 'grid place-items-center w-12 h-12 rounded-2xl bg-hyrox-primary shadow-glow-primary shrink-0'
            : 'grid place-items-center w-8 h-8 rounded-xl bg-hyrox-primary shrink-0'
        }
        aria-hidden="true"
      >
        {/* Marca tipografica: la barra diagonal evoca el cronometro en marcha. */}
        <svg
          viewBox="0 0 24 24"
          className={grande ? 'w-6 h-6' : 'w-4 h-4'}
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M4 18 L10 6 M14 18 L20 6" />
          <path d="M7 12 L17 12" />
        </svg>
      </span>
      <span className="min-w-0">
        <span
          className={
            grande
              ? 'block font-display font-extrabold text-2xl tracking-display text-hyrox-paper leading-none'
              : 'block font-display font-bold text-base tracking-display text-hyrox-paper leading-none truncate'
          }
        >
          COMPETITION<span className="text-hyrox-primary"> MANAGER</span>
        </span>
        {grande && (
          <span className="block text-xs text-hyrox-mist mt-1.5">
            Cronometraje y clasificacion en vivo
          </span>
        )}
      </span>
    </span>
  );
}
