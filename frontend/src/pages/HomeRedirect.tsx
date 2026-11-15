import { Navigate } from 'react-router-dom';
import { useAuth, rutaInicial } from '../contexts/AuthContext';
import Brand from '../components/layout/Brand';

/**
 * La raiz no tiene contenido propio: lleva a cada rol a su pagina de inicio y
 * a quien no tiene sesion, a la clasificacion publica (que es lo que se
 * proyecta en el evento y no exige credenciales).
 */
export default function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-hyrox-void px-4">
        <Brand size="lg" />
      </div>
    );
  }

  return <Navigate to={user ? rutaInicial(user.rol) : '/inicio'} replace />;
}
