import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { clearToken, onSessionExpired } from '../api/client';
import type { Usuario, Rol } from '../types';

interface AuthContextType {
  user: Usuario | null;
  loading: boolean;
  login: (cedula: string, password: string) => Promise<void>;
  loginParticipante: (cedula: string, fechaNacimiento: string) => Promise<void>;
  logout: () => Promise<void>;
  refrescar: () => Promise<void>;
  /** Deja la sesion iniciada con una respuesta que ya trae usuario. */
  aplicarSesion: (usuario: Usuario, token?: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Pagina de inicio de cada rol; se usa en la ruta raiz y al perder permisos. */
export function rutaInicial(rol: Rol): string {
  // Un administrador entra por sus eventos: puede tener mas de una, y
  // desde ahi elige en cual trabaja.
  if (rol === 'admin') return '/eventos';
  if (rol === 'juez') return '/juez';
  return '/participante';
}

/** Un miembro del staff que aun no cambio su contrasena temporal debe hacerlo. */
export function debeCambiarPassword(user: Usuario): boolean {
  return user.rol !== 'participante' && !user.password_cambiado;
}

/**
 * Unico criterio de "a donde va este usuario".
 *
 * Es importante que sea uno solo: tras iniciar sesion, tanto `login()` como el
 * guardia de LoginPage reaccionan al mismo cambio de estado. Si cada uno
 * calculara su destino por su cuenta, la ultima navegacion en aplicarse
 * ganaria y el usuario acabaria en la pagina equivocada.
 */
export function destinoTrasLogin(user: Usuario): string {
  return debeCambiarPassword(user) ? '/cambiar-password' : rutaInicial(user.rol);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const yaComprobado = useRef(false);

  const refrescar = useCallback(async () => {
    // CRIT-1: No hay token en localStorage. La cookie HttpOnly viaja sola
    // con withCredentials. Si no hay cookie, /auth/me responderá 401.
    try {
      const res = await api.get<{ user: Usuario }>('/auth/me');
      setUser(res.data.user);
    } catch (err: any) {
      // Solo un 401 significa "no hay sesion". Si el backend esta caido o la
      // red falla, se conserva la sesion para reintentar mas adelante en vez
      // de expulsar al usuario en mitad de un evento.
      if (err?.response?.status === 401) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (yaComprobado.current) return;
    yaComprobado.current = true;
    refrescar();
  }, [refrescar]);

  // Si el token caduca durante la sesion, se vuelve al login sin recargar.
  useEffect(() => {
    onSessionExpired(() => {
      setUser(null);
      navigate('/login', { replace: true });
    });
  }, [navigate]);

  // Auto-refresh: extiende la cookie cada 3 horas para mantener la sesion viva.
  useEffect(() => {
    if (!user) return;
    const INTERVALO_MS = 3 * 60 * 60 * 1000; // 3 horas
    const id = setInterval(() => {
      api.post('/auth/refresh').catch(() => {});
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, [user]);

  function aplicarSesion(usuario: Usuario, _token?: string) {
    // CRIT-1: El token ya se estableció como HttpOnly cookie en el response
    // del backend. No hay nada que guardar en el frontend.
    setUser(usuario);
  }

  async function login(cedula: string, password: string) {
    const res = await api.post('/auth/login', { cedula, password });
    const { user: perfil } = res.data;

    setUser(perfil);
    navigate(destinoTrasLogin(perfil), { replace: true });
  }

  async function loginParticipante(cedula: string, fechaNacimiento: string) {
    const res = await api.post('/auth/login-participante', {
      cedula,
      fecha_nacimiento: fechaNacimiento,
    });

    setUser(res.data.user);
    navigate('/participante', { replace: true });
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // Aunque falle la peticion, la sesion local se cierra igualmente.
    }
    clearToken();
    setUser(null);
    navigate('/login', { replace: true });
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginParticipante, logout, refrescar, aplicarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return contexto;
}
