import { Check, X } from 'lucide-react';
import { cx } from '../ui';

/**
 * Las mismas reglas que valida el backend, para poder avisar mientras se
 * escribe en vez de al enviar. Viven aqui, y no en cada pantalla, porque las
 * usan tanto el alta como el cambio de contrasena.
 */
export const REQUISITOS_PASSWORD = [
  { texto: 'Al menos 8 caracteres', cumple: (v: string) => v.length >= 8 },
  { texto: 'Una letra mayuscula', cumple: (v: string) => /[A-Z]/.test(v) },
  { texto: 'Una letra minuscula', cumple: (v: string) => /[a-z]/.test(v) },
  { texto: 'Un numero', cumple: (v: string) => /[0-9]/.test(v) },
  { texto: 'Un caracter especial', cumple: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

export function ListaRequisitos({ password, className }: { password: string; className?: string }) {
  return (
    <ul className={cx('grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5', className)}>
      {REQUISITOS_PASSWORD.map((regla) => {
        const ok = regla.cumple(password);
        return (
          <li
            key={regla.texto}
            className={cx(
              'flex items-center gap-1.5 text-xs transition-colors duration-200',
              ok ? 'text-hyrox-accent' : 'text-hyrox-ghost'
            )}
          >
            {ok ? (
              <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            {regla.texto}
          </li>
        );
      })}
    </ul>
  );
}
