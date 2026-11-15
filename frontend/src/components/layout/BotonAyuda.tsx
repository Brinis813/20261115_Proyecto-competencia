import { Link, useLocation } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Boton flotante de ayuda, presente en toda la aplicacion con sesion iniciada.
 *
 * Se esconde donde estorbaria mas de lo que ayuda: en la propia ayuda, en las
 * pantallas de acceso (donde todavia no hay sesion) y en el leaderboard de un
 * Competencia, que es lo que se proyecta en el evento y no debe llevar botones encima.
 */
const RUTAS_SIN_BOTON = [/^\/ayuda$/, /^\/login$/, /^\/cambiar-password$/, /^\/leaderboard\/.+/];

export default function BotonAyuda() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (!user) return null;
  if (RUTAS_SIN_BOTON.some((r) => r.test(pathname))) return null;

  return (
    <Link
      to="/ayuda"
      // z-40: por debajo del cajon del menu movil y del aviso de sin conexion.
      className="fixed z-40 bottom-4 right-4 pb-safe flex items-center gap-2 h-12 pl-4 pr-4 sm:pr-5 rounded-2xl bg-hyrox-primary text-white font-semibold text-sm shadow-glow-primary hover:bg-hyrox-ember transition-colors duration-200"
      aria-label="Abrir la ayuda"
      title="Ayuda"
    >
      <HelpCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">Ayuda</span>
    </Link>
  );
}
