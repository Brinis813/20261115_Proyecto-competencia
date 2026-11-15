import { useState, useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ChevronRight, Trophy, ShieldCheck, User } from 'lucide-react';
import { useAuth, destinoTrasLogin } from '../../contexts/AuthContext';
import { mensajeDeError } from '../../api/client';
import Brand from '../../components/layout/Brand';
import { Alert, Button, Field, PasswordField, cx } from '../../components/ui';

type Modo = 'staff' | 'atleta';

export default function LoginPage() {
  const { user, loading, login, loginParticipante } = useAuth();
  const location = useLocation();

  const [modo, setModo] = useState<Modo>('staff');
  const [cedula, setCedula] = useState('');
  const [password, setPassword] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Cambiar de pestana limpia el error: pertenece al formulario anterior.
  useEffect(() => setError(''), [modo]);

  // Quien ya tiene sesion no deberia ver el login. El destino se calcula con
  // el mismo criterio que usa `login()`, para que ambos coincidan siempre.
  if (!loading && user) {
    const destinoPorDefecto = destinoTrasLogin(user);
    // Solo se respeta el enlace profundo que trajo al usuario aqui si no tiene
    // pendiente cambiar la contrasena temporal.
    const destino =
      destinoPorDefecto === '/cambiar-password'
        ? destinoPorDefecto
        : ((location.state as { from?: string })?.from ?? destinoPorDefecto);
    return <Navigate to={destino} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      if (modo === 'staff') {
        await login(cedula.trim(), password);
      } else {
        await loginParticipante(cedula.trim(), fechaNacimiento);
      }
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo iniciar sesion'));
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-hyrox-void">
      {/* Luces ambientales: dan profundidad sin competir con el formulario. */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-48 -right-32 w-[28rem] h-[28rem] bg-hyrox-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-48 -left-32 w-[28rem] h-[28rem] bg-hyrox-accent/[0.06] rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-grid-faint bg-grid opacity-40" />
      </div>

      <main className="relative flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-fade-up">
          <div className="flex flex-col items-center text-center mb-10">
            <Brand size="lg" />
          </div>

          {/* Selector de tipo de acceso */}
          <div
            className="flex gap-1 p-1 mb-6 rounded-2xl bg-white/[0.04] border border-white/[0.06]"
            role="tablist"
            aria-label="Tipo de acceso"
          >
            <BotonModo activo={modo === 'staff'} onClick={() => setModo('staff')} icon={ShieldCheck}>
              Admin / Juez
            </BotonModo>
            <BotonModo activo={modo === 'atleta'} onClick={() => setModo('atleta')} icon={User}>
              Atleta
            </BotonModo>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field
              label="Cedula"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              placeholder="Numero de documento"
              required
              autoFocus
            />

            {modo === 'staff' ? (
              <PasswordField
                label="Contrasena"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contrasena"
                required
              />
            ) : (
              <Field
                label="Fecha de nacimiento"
                type="text"
                inputMode="numeric"
                autoComplete="bday"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                placeholder="AAAA/MM/DD"
                hint="Los atletas entran con su cedula y su fecha de nacimiento."
                maxLength={10}
                required
              />
            )}

            {error && <Alert tone="error">{error}</Alert>}

            <Button type="submit" loading={enviando} fullWidth className="mt-2">
              {enviando ? 'Entrando...' : 'Entrar'}
              {!enviando && <ChevronRight className="w-4 h-4" aria-hidden="true" />}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
            <p className="text-sm text-hyrox-mist mb-3">
              ¿Organizas un evento?{' '}
              <Link to="/registro" className="font-semibold text-hyrox-primary hover:text-hyrox-ember">
                Crea tu cuenta
              </Link>
            </p>
            <p className="text-xs text-hyrox-mist mb-3">No necesitas cuenta para ver la clasificacion</p>
            <Link
              to="/inicio"
              className="inline-flex items-center gap-2 text-sm font-semibold text-hyrox-primary hover:text-hyrox-ember transition-colors"
            >
              <Trophy className="w-4 h-4" aria-hidden="true" />
              Ver clasificacion en vivo
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function BotonModo({
  activo,
  onClick,
  icon: Icon,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  icon: typeof ShieldCheck;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activo}
      onClick={onClick}
      className={cx(
        'flex-1 flex items-center justify-center gap-2 min-h-[2.75rem] px-3 rounded-xl',
        'text-sm font-semibold cursor-pointer transition-all duration-200',
        activo ? 'bg-hyrox-primary text-white shadow-glow-primary' : 'text-hyrox-mist hover:text-hyrox-paper'
      )}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      {children}
    </button>
  );
}
