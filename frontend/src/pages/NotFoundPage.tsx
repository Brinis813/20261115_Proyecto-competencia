import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import { useAuth, rutaInicial } from '../contexts/AuthContext';
import Brand from '../components/layout/Brand';
import { Button } from '../components/ui';

export default function NotFoundPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const destino = user ? rutaInicial(user.rol) : '/inicio';

  return (
    <div className="min-h-screen grid place-items-center bg-hyrox-void px-4 bg-grid-faint bg-grid">
      <div className="text-center max-w-md animate-fade-up">
        <div className="flex justify-center mb-8">
          <Brand size="lg" />
        </div>

        <p className="font-display text-7xl sm:text-8xl font-extrabold text-hyrox-primary leading-none">
          404
        </p>
        <h1 className="mt-3 text-2xl font-bold text-hyrox-paper">Esta pagina no existe</h1>
        <p className="mt-2 text-sm text-hyrox-mist text-balance">
          Puede que el enlace este mal escrito o que la competencia que buscas ya se haya eliminado.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-2 justify-center">
          <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(-1)}>
            Volver
          </Button>
          <Link to={destino}>
            <Button icon={Compass} fullWidth>
              Ir al inicio
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
