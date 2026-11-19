import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import api, { mensajeDeError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import Brand from '../../components/layout/Brand';
import { Alert, Button, Field } from '../../components/ui';
import type { Usuario } from '../../types';

interface RespuestaVerificar {
  user: Usuario;
  evento: { id: number; nombre: string };
}

/**
 * Pantalla a la que apunta el enlace del correo.
 *
 * Verifica en cuanto carga y, si sale bien, deja la sesion iniciada: el
 * usuario no tiene que volver a escribir la contrasena que acaba de elegir.
 */
export default function VerificarPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { aplicarSesion } = useAuth();
  const token = params.get('token') ?? '';

  const [estado, setEstado] = useState<'verificando' | 'ok' | 'error'>(
    token ? 'verificando' : 'error',
  );
  const [error, setError] = useState(
    token ? '' : 'El enlace no trae ningun codigo de verificacion.',
  );
  const [evento, setEvento] = useState<string>('');

  // React 18 monta dos veces en desarrollo; el token es de un solo uso, asi que
  // sin esta guarda el segundo intento fallaria y se veria un error falso.
  const yaIntentado = useRef(false);

  useEffect(() => {
    if (!token || yaIntentado.current) return;
    yaIntentado.current = true;

    api
      .post<RespuestaVerificar>('/auth/verificar', { token })
      .then(({ data }) => {
        aplicarSesion(data.user);
        setEvento(data.evento.nombre);
        setEstado('ok');
      })
      .catch((err) => {
        setError(mensajeDeError(err, 'No se pudo verificar el enlace'));
        setEstado('error');
      });
  }, [token, aplicarSesion]);

  return (
    <div className="min-h-screen bg-hyrox-void px-4 py-10 grid place-items-center">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Brand size="lg" />
        </div>

        <div className="surface p-6 sm:p-7 text-center">
          {estado === 'verificando' && (
            <>
              <Loader2
                className="w-8 h-8 mx-auto text-hyrox-primary animate-spin"
                aria-hidden="true"
              />
              <p className="text-sm text-hyrox-mist mt-4">Confirmando tu correo...</p>
            </>
          )}

          {estado === 'ok' && (
            <div className="animate-fade-in">
              <span className="grid place-items-center w-14 h-14 mx-auto mb-4 rounded-2xl bg-hyrox-accent/12 text-hyrox-accent">
                <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
              </span>
              <h1 className="font-display text-2xl font-bold text-hyrox-paper">Cuenta activada</h1>
              <p className="text-sm text-hyrox-mist mt-2">
                Te preparamos <span className="text-hyrox-paper font-semibold">{evento}</span> con
                categorías, una competencia, atletas y un juez de ejemplo. Cambia lo que quieras.
              </p>
              <Button className="mt-6" fullWidth onClick={() => navigate('/eventos')}>
                Ir a mis eventos
              </Button>
            </div>
          )}

          {estado === 'error' && <PanelError mensaje={error} />}
        </div>
      </div>
    </div>
  );
}

/** Si el enlace caduco, desde aqui mismo se puede pedir otro. */
function PanelError({ mensaje }: { mensaje: string }) {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');

  async function reenviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const { data } = await api.post<{ message: string }>('/auth/reenviar-verificacion', {
        email,
      });
      setAviso(data.message);
    } catch {
      setAviso('No se pudo pedir el enlace. Intentalo de nuevo en un momento.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <span className="grid place-items-center w-14 h-14 mx-auto mb-4 rounded-2xl bg-hyrox-danger/12 text-hyrox-danger">
        <XCircle className="w-7 h-7" aria-hidden="true" />
      </span>
      <h1 className="font-display text-2xl font-bold text-hyrox-paper">No pudimos activarla</h1>
      <p className="text-sm text-hyrox-mist mt-2">{mensaje}</p>

      {aviso ? (
        <Alert tone="success" className="mt-5 text-left">
          {aviso}
        </Alert>
      ) : (
        <form onSubmit={reenviar} className="mt-6 space-y-3 text-left">
          <Field
            label="Tu correo"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
          />
          <Button
            type="submit"
            variant="secondary"
            fullWidth
            loading={enviando}
            disabled={!email.trim()}
          >
            Enviarme otro enlace
          </Button>
        </form>
      )}

      <Link
        to="/login"
        className="mt-6 inline-block text-sm font-semibold text-hyrox-primary hover:text-hyrox-ember"
      >
        Volver al acceso
      </Link>
    </div>
  );
}
