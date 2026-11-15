import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, rutaInicial, debeCambiarPassword } from '../contexts/AuthContext';
import Brand from './layout/Brand';
import type { Rol } from '../types';

/**
 * Guarda de ruta.
 *
 * Diferencia tres situaciones que antes se trataban igual:
 *  - sesion aun sin comprobar -> pantalla de carga (no se expulsa a nadie);
 *  - sin sesion -> al login, recordando a donde queria ir;
 *  - con sesion pero sin permisos -> a su propia pagina de inicio, no al login.
 */
export default function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles?: Rol[];
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-hyrox-void px-4">
        <div className="flex flex-col items-center gap-5 animate-fade-in">
          <Brand size="lg" />
          <div className="w-32 h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full w-1/2 bg-hyrox-primary animate-pulse rounded-full" />
          </div>
          <span className="sr-only">Comprobando la sesion</span>
        </div>
      </div>
    );
  }

  if (!user) {
    // `state.from` permite volver al enlace profundo tras iniciar sesion.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // El cambio de la contrasena temporal es obligatorio: escribir otra URL a
  // mano no debe permitir saltarselo.
  if (debeCambiarPassword(user) && location.pathname !== '/cambiar-password') {
    return <Navigate to="/cambiar-password" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.rol)) {
    return <Navigate to={rutaInicial(user.rol)} replace />;
  }

  return <>{children}</>;
}
