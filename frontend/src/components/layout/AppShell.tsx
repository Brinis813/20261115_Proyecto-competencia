import { ReactNode, useState, useEffect } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Dumbbell,
  ClipboardList,
  Flag,
  ListChecks,
  Trophy,
  Timer,
  Tags,
  Building2,
  UserCog,
  Trophy as TrofeoEvento,
  HelpCircle,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getEventoActivaNombre } from '../../api/client';
import { cx } from '../ui';
import Brand from './Brand';
import ConnectionBadge from './ConnectionBadge';

interface ItemNav {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Coincidencia exacta: evita que "/admin" quede activo en "/admin/competencias". */
  end?: boolean;
}

const NAV_ADMIN: ItemNav[] = [
  { to: '/eventos', label: 'Eventos', icon: TrofeoEvento },
  { to: '/admin', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/admin/competencias', label: 'Competencias', icon: Dumbbell },
  { to: '/admin/categorias', label: 'Categorías', icon: Tags },
  { to: '/admin/jueces', label: 'Jueces', icon: UserCheck },
  { to: '/admin/participantes', label: 'Participantes', icon: Users },
  { to: '/admin/asignaciones', label: 'Asignaciones', icon: ClipboardList },
  { to: '/admin/heats', label: 'Heats', icon: Flag },
  { to: '/admin/resultados', label: 'Resultados', icon: ListChecks },
  { to: '/inicio', label: 'Clasificacion', icon: Trophy },
  { to: '/ayuda', label: 'Ayuda', icon: HelpCircle },
];

const NAV_JUEZ: ItemNav[] = [
  { to: '/juez', label: 'Medir', icon: Timer, end: true },
  { to: '/clasificacion', label: 'Clasificacion', icon: Trophy },
  { to: '/ayuda', label: 'Ayuda', icon: HelpCircle },
];

const NAV_PARTICIPANTE: ItemNav[] = [
  { to: '/participante', label: 'Mis resultados', icon: Trophy, end: true },
  { to: '/inicio', label: 'Clasificacion', icon: Trophy },
  { to: '/ayuda', label: 'Ayuda', icon: HelpCircle },
];

/**
 * Boxes y administradores solo los toca el administrador general: son la
 * unidad de permisos, y un administrador de box no puede crearse otros.
 */
const NAV_SUPERADMIN: ItemNav[] = [
  { to: '/admin/boxes', label: 'Boxes', icon: Building2 },
  { to: '/admin/administradores', label: 'Administradores', icon: UserCog },
];

function navPorRol(user?: { rol?: string; es_superadmin?: boolean } | null): ItemNav[] {
  if (user?.rol === 'admin') {
    return user.es_superadmin ? [...NAV_ADMIN, ...NAV_SUPERADMIN] : NAV_ADMIN;
  }
  if (user?.rol === 'juez') return NAV_JUEZ;
  return NAV_PARTICIPANTE;
}

/**
 * Estructura comun de las paginas con sesion: barra lateral en escritorio,
 * cajon deslizante en movil y barra superior siempre visible.
 */
export default function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const location = useLocation();
  const items = navPorRol(user);

  // Navegar cierra el menu movil: si no, tapa la pagina recien abierta.
  useEffect(() => setMenuAbierto(false), [location.pathname]);

  // Bloquea el scroll del fondo mientras el cajon esta abierto.
  useEffect(() => {
    document.body.style.overflow = menuAbierto ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuAbierto]);

  return (
    <div className="min-h-screen bg-hyrox-void">
      {/* Salto directo al contenido para quien navega con teclado. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-2 focus:bg-hyrox-primary focus:text-white focus:rounded-xl"
      >
        Saltar al contenido
      </a>

      {/* ---------- Barra lateral (escritorio) ---------- */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-white/[0.06] bg-hyrox-secondary z-30">
        <div className="h-14 flex items-center px-5 border-b border-white/[0.06]">
          <Brand />
        </div>
        <SidebarNav items={items} />
        <SidebarFooter user={user} onLogout={logout} />
      </aside>

      {/* ---------- Cajon (movil) ---------- */}
      {menuAbierto && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-hyrox-void/85 backdrop-blur-sm animate-fade-in"
            onClick={() => setMenuAbierto(false)}
            aria-hidden="true"
          />
          <nav
            className="relative w-72 max-w-[85vw] h-full bg-hyrox-secondary border-r border-white/[0.06] flex flex-col animate-fade-in"
            aria-label="Menu principal"
          >
            <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06]">
              <Brand />
              <button
                type="button"
                onClick={() => setMenuAbierto(false)}
                className="icon-btn"
                aria-label="Cerrar menu"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <SidebarNav items={items} />
            <SidebarFooter user={user} onLogout={logout} />
          </nav>
        </div>
      )}

      {/* ---------- Contenido ---------- */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 h-14 flex items-center gap-3 px-4 sm:px-6 border-b border-white/[0.06] bg-hyrox-void/85 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setMenuAbierto(true)}
            className="icon-btn lg:hidden -ml-2"
            aria-label="Abrir menu"
            aria-expanded={menuAbierto}
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold text-hyrox-paper truncate leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-hyrox-mist truncate hidden sm:block">{subtitle}</p>
            )}
          </div>

          {/* Un administrador de box puede tener varias eventos: conviene
              que vea sin buscarlo en cual esta trabajando. */}
          <EventoActiva />

          <div className="flex items-center gap-2 shrink-0">
            <ConnectionBadge />
            {actions}
          </div>
        </header>

        <main id="contenido" className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto pb-safe">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Etiqueta del evento sobre la que se esta trabajando. */
function EventoActiva() {
  const [nombre, setNombre] = useState(getEventoActivaNombre());

  useEffect(() => {
    const refrescar = () => setNombre(getEventoActivaNombre());
    window.addEventListener('evento-activa', refrescar);
    return () => window.removeEventListener('evento-activa', refrescar);
  }, []);

  if (!nombre) return null;

  return (
    <Link
      to="/eventos"
      title={`Trabajando en ${nombre}. Toca para cambiar.`}
      className="hidden md:flex items-center gap-2 max-w-[16rem] px-3 h-8 rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs text-hyrox-mist hover:text-hyrox-paper hover:border-white/20 transition-colors duration-200 shrink-0"
    >
      <Trophy className="w-3.5 h-3.5 shrink-0 text-hyrox-primary" aria-hidden="true" />
      <span className="truncate">{nombre}</span>
    </Link>
  );
}

function SidebarNav({ items }: { items: ItemNav[] }) {
  return (
    <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Secciones">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cx(
              'flex items-center gap-3 min-h-[2.75rem] px-3 rounded-xl text-sm font-medium transition-colors duration-200',
              isActive
                ? 'bg-hyrox-primary/12 text-hyrox-primary'
                : 'text-hyrox-mist hover:text-hyrox-paper hover:bg-white/[0.05]',
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon className="w-4.5 h-4.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
              {isActive && (
                <span
                  className="ml-auto w-1 h-4 rounded-full bg-hyrox-primary"
                  aria-hidden="true"
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarFooter({
  user,
  onLogout,
}: {
  user: { nombre: string; apellidos: string; rol: string } | null;
  onLogout: () => void;
}) {
  const etiquetaRol =
    { admin: 'Administrador', juez: 'Juez', participante: 'Atleta' }[user?.rol ?? ''] ?? '';

  return (
    <div className="p-3 border-t border-white/[0.06]">
      <div className="flex items-center gap-3 px-2 py-2">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-hyrox-primary/12 text-hyrox-primary text-xs font-bold shrink-0">
          {(user?.nombre?.[0] ?? '') + (user?.apellidos?.[0] ?? '')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-hyrox-paper truncate">
            {user?.nombre} {user?.apellidos}
          </p>
          <p className="text-2xs text-hyrox-mist uppercase tracking-wide">{etiquetaRol}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="w-full flex items-center gap-3 min-h-[2.75rem] px-3 rounded-xl text-sm font-medium text-hyrox-mist hover:text-hyrox-danger hover:bg-hyrox-danger/10 transition-colors duration-200 cursor-pointer"
      >
        <LogOut className="w-4.5 h-4.5 shrink-0" aria-hidden="true" />
        Cerrar sesion
      </button>
    </div>
  );
}

/** Cabecera compacta para las vistas publicas, que no llevan barra lateral. */
export function PublicHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 h-14 flex items-center justify-between gap-3 px-4 sm:px-6 border-b border-white/[0.06] bg-hyrox-void/85 backdrop-blur-xl">
      <Link to="/inicio" className="min-w-0">
        <Brand />
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <ConnectionBadge />
        {actions}
      </div>
    </header>
  );
}
