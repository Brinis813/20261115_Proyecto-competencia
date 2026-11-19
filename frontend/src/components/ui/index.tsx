import { ReactNode, forwardRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Loader2,
  X,
  type LucideIcon,
} from 'lucide-react';

/** Une clases condicionales sin depender de librerias externas. */
export function cx(...clases: Array<string | false | null | undefined>): string {
  return clases.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ */
/* Superficies                                                         */
/* ------------------------------------------------------------------ */

export function Panel({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return <Tag className={cx('surface overflow-hidden', className)}>{children}</Tag>;
}

export function PanelHeader({
  title,
  subtitle,
  icon: Icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <header className="panel-header">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-hyrox-primary/12 text-hyrox-primary shrink-0">
            <Icon className="w-4.5 h-4.5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-bold text-hyrox-paper truncate">{title}</h2>
          {subtitle && <p className="text-xs text-hyrox-mist truncate">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Botones                                                             */
/* ------------------------------------------------------------------ */

type Variante = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const VARIANTES: Record<Variante, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  success: 'btn-success',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variante;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: LucideIcon;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading,
    icon: Icon,
    fullWidth,
    children,
    className,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        VARIANTES[variant],
        size === 'sm' && 'btn-sm',
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      // Comunica el estado de carga a los lectores de pantalla.
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />
      )}
      {children}
    </button>
  );
});

export function IconButton({
  icon: Icon,
  label,
  className,
  size = 'md',
  variant = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  size?: 'sm' | 'md';
  variant?: 'default' | 'danger';
}) {
  return (
    // El texto accesible es obligatorio: un boton solo con icono no dice nada
    // a un lector de pantalla.
    <button
      type="button"
      className={cx(
        'icon-btn',
        size === 'sm' && 'w-8 h-8',
        variant === 'danger' && 'hover:text-hyrox-danger hover:bg-hyrox-danger/10',
        className,
      )}
      aria-label={label}
      // Un title propio del llamador (p.ej. explicar por que esta deshabilitado)
      // gana al de por defecto porque {...props} se expande despues.
      title={label}
      {...props}
    >
      <Icon className={cx(size === 'sm' ? 'w-4 h-4' : 'w-4.5 h-4.5')} aria-hidden="true" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Formularios                                                         */
/* ------------------------------------------------------------------ */

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, id, className, ...props },
  ref,
) {
  const inputId = id || `campo-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={className}>
      {/* La etiqueta siempre visible: un placeholder desaparece al escribir. */}
      <label htmlFor={inputId} className="label">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={cx('input-field', error && 'input-error')}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(errorId, hintId) || undefined}
        {...props}
      />
      {/* El error va junto al campo, no agrupado arriba del formulario. */}
      {error && (
        <p id={errorId} className="field-error" role="alert">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
});
/**
 * Campo de contraseña con ojo mostrar/ocultar.
 * Misma API que `Field`; el tipo alterna entre password y text.
 */
export const PasswordField = forwardRef<HTMLInputElement, FieldProps>(function PasswordField(
  { label, error, hint, id, className, autoComplete = 'current-password', ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const inputId = id || `campo-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          className={cx('input-field pr-11', error && 'input-error')}
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(errorId, hintId) || undefined}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-hyrox-mist hover:text-hyrox-paper hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          {visible ? (
            <EyeOff className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Eye className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
});

export function Select({
  label,
  error,
  children,
  id,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  const selectId = id || `select-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className={className}>
      <label htmlFor={selectId} className="label">
        {label}
      </label>
      <select id={selectId} className={cx('input-field', error && 'input-error')} {...props}>
        {children}
      </select>
      {error && (
        <p className="field-error" role="alert">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Avisos                                                              */
/* ------------------------------------------------------------------ */

const ESTILOS_AVISO = {
  error: {
    clase: 'bg-hyrox-danger/10 border-hyrox-danger/25 text-hyrox-danger',
    icono: AlertCircle,
  },
  success: {
    clase: 'bg-hyrox-accent/10 border-hyrox-accent/25 text-hyrox-accent',
    icono: CheckCircle2,
  },
  warning: {
    clase: 'bg-hyrox-warning/10 border-hyrox-warning/25 text-hyrox-warning',
    icono: AlertCircle,
  },
  info: { clase: 'bg-hyrox-info/10 border-hyrox-info/25 text-hyrox-info', icono: Info },
} as const;

export function Alert({
  tone = 'info',
  children,
  onDismiss,
  className,
}: {
  tone?: keyof typeof ESTILOS_AVISO;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const { clase, icono: Icono } = ESTILOS_AVISO[tone];
  return (
    <div
      className={cx(
        'flex items-start gap-3 px-4 py-3 rounded-xl border text-sm animate-fade-in',
        clase,
        className,
      )}
      // Los errores interrumpen; el resto se anuncia sin cortar la lectura.
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icono className="w-4.5 h-4.5 shrink-0 mt-px" aria-hidden="true" />
      <span className="flex-1 min-w-0">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
          aria-label="Cerrar aviso"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Estados vacios y de carga                                           */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center animate-fade-in">
      <span className="grid place-items-center w-14 h-14 mx-auto mb-4 rounded-2xl bg-white/[0.04] text-hyrox-ghost">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </span>
      <p className="font-display text-lg font-bold text-hyrox-paper">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-hyrox-mist max-w-sm mx-auto text-balance">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Reserva el alto final del contenido para que no salte al cargar. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="p-4 space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-14" />
      ))}
    </div>
  );
}

export function Spinner({ label = 'Cargando...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14" role="status">
      <Loader2 className="w-6 h-6 text-hyrox-primary animate-spin" aria-hidden="true" />
      <span className="text-sm text-hyrox-mist">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogo modal                                                       */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (!open) return null;

  const anchos = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-hyrox-void/85 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          // En movil el dialogo sube desde abajo y ocupa el ancho completo;
          // en escritorio queda centrado.
          'relative w-full surface-raised animate-scale-in flex flex-col',
          'rounded-t-3xl sm:rounded-2xl max-h-[92vh] sm:max-h-[85vh]',
          anchos[size],
        )}
      >
        <header className="panel-header">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-hyrox-paper truncate">{title}</h2>
            {description && <p className="text-xs text-hyrox-mist mt-0.5">{description}</p>}
          </div>
          <IconButton icon={X} label="Cerrar" onClick={onClose} />
        </header>

        {children && <div className="p-4 sm:p-5 overflow-y-auto flex-1">{children}</div>}

        {footer && (
          <footer className="px-4 sm:px-5 py-4 border-t border-white/[0.06] flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pb-safe">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/** Dialogo de confirmacion para acciones destructivas. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  tone = 'danger',
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-hyrox-mist leading-relaxed">{message}</p>
    </Modal>
  );
}
