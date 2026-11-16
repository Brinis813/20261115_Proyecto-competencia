import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, KeyRound, X } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import { useAuth, rutaInicial } from '../../contexts/AuthContext';
import Brand from '../../components/layout/Brand';
import { Alert, Button, PasswordField, cx } from '../../components/ui';

/** Mismas reglas que valida el backend, para avisar antes de enviar. */
const REGLAS = [
  { texto: 'Al menos 8 caracteres', cumple: (v: string) => v.length >= 8 },
  { texto: 'Una letra mayuscula', cumple: (v: string) => /[A-Z]/.test(v) },
  { texto: 'Una letra minuscula', cumple: (v: string) => /[a-z]/.test(v) },
  { texto: 'Un numero', cumple: (v: string) => /[0-9]/.test(v) },
  { texto: 'Un caracter especial', cumple: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, refrescar } = useAuth();

  // Si nunca cambio la contrasena, viene del primer ingreso y no se le pide
  // la actual (todavia es la temporal que le entrego el administrador).
  const esPrimerIngreso = user ? !user.password_cambiado : false;

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const reglasOk = REGLAS.every((r) => r.cumple(nueva));
  const coinciden = nueva.length > 0 && nueva === repetida;
  const puedeEnviar = reglasOk && coinciden && (esPrimerIngreso || actual.length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!coinciden) {
      setError('Las contrasenas no coinciden');
      return;
    }

    setEnviando(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: esPrimerIngreso ? undefined : actual,
        newPassword: nueva,
      });
      await refrescar();
      navigate(rutaInicial(user!.rol), { replace: true });
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar la contrasena'));
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-hyrox-void">
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[30rem] h-[30rem] bg-hyrox-primary/[0.08] rounded-full blur-3xl" />
      </div>

      <main className="relative flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-fade-up">
          <div className="flex justify-center mb-8">
            <Brand />
          </div>

          <div className="surface-raised p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-hyrox-primary/12 text-hyrox-primary shrink-0">
                <KeyRound className="w-5 h-5" aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-lg font-bold text-hyrox-paper">
                  {esPrimerIngreso ? 'Define tu contrasena' : 'Cambiar contrasena'}
                </h1>
                <p className="text-xs text-hyrox-mist">
                  {esPrimerIngreso
                    ? 'Es tu primer ingreso: sustituye la contrasena temporal.'
                    : 'Necesitas tu contrasena actual para cambiarla.'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {!esPrimerIngreso && (
                <PasswordField
                  label="Contrasena actual"
                  autoComplete="current-password"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  required
                />
              )}

              <PasswordField
                label="Nueva contrasena"
                autoComplete="new-password"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                required
                autoFocus={esPrimerIngreso}
              />

              {/* Los requisitos se validan mientras se escribe, no al enviar. */}
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 py-1">
                {REGLAS.map((regla) => {
                  const ok = regla.cumple(nueva);
                  return (
                    <li
                      key={regla.texto}
                      className={cx(
                        'flex items-center gap-1.5 text-xs transition-colors duration-200',
                        ok ? 'text-hyrox-accent' : 'text-hyrox-ghost',
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

              <PasswordField
                label="Repite la nueva contrasena"
                autoComplete="new-password"
                value={repetida}
                onChange={(e) => setRepetida(e.target.value)}
                error={
                  repetida.length > 0 && !coinciden ? 'Las contrasenas no coinciden' : undefined
                }
                required
              />

              {error && <Alert tone="error">{error}</Alert>}

              <Button type="submit" loading={enviando} disabled={!puedeEnviar} fullWidth>
                Guardar contrasena
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
