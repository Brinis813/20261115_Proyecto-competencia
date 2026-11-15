import axios, { AxiosError } from 'axios';

const CLAVE_EVENTO = 'evento_activo';
const CLAVE_EVENTO_NOMBRE = 'evento_activo_nombre';

/**
 * Cliente HTTP.
 *
 * CRIT-1: La sesion viaja exclusivamente en cookie HttpOnly (no en localStorage).
 * El navegador la envia sola con withCredentials: true. Esto previene que
 * JavaScript pueda leer el token, eliminando el vector de ataque XSS → robo de JWT.
 */
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

/**
 * Evento en la que se esta trabajando.
 *
 * Un administrador de box puede tener varias, asi que hay que decirle al
 * servidor en cual esta. Viaja en una cabecera y no en la URL para no rehacer
 * todas las rutas de administracion; el servidor la valida siempre contra el
 * conjunto que ese usuario tiene permitido, asi que es una preferencia, nunca
 * un permiso.
 */
let eventoActiva: number | null = (() => {
  const stored = localStorage.getItem(CLAVE_EVENTO);
  return stored && !isNaN(Number(stored)) ? Number(stored) : null;
})();

export function getEventoActiva(): number | null {
  return eventoActiva;
}

/** Nombre del evento activa, solo para mostrarlo en la cabecera. */
export function getEventoActivaNombre(): string | null {
  return localStorage.getItem(CLAVE_EVENTO_NOMBRE);
}

export function setEventoActiva(id: number | null, nombre?: string) {
  eventoActiva = id;
  if (id) {
    localStorage.setItem(CLAVE_EVENTO, String(id));
    if (nombre) localStorage.setItem(CLAVE_EVENTO_NOMBRE, nombre);
  } else {
    localStorage.removeItem(CLAVE_EVENTO);
    localStorage.removeItem(CLAVE_EVENTO_NOMBRE);
  }
  // La cabecera del panel escucha esto para refrescar su etiqueta.
  window.dispatchEvent(new Event('evento-activa'));
}

/** Se dispara cuando el servidor responde 401 con sesion expirada. */
let alExpirarSesion: (() => void) | null = null;

export function onSessionExpired(callback: () => void) {
  alExpirarSesion = callback;
}

api.interceptors.request.use((config) => {
  // CRIT-1: No enviar Authorization header — la cookie HttpOnly viaja sola.
  if (eventoActiva) config.headers['X-Evento-Id'] = String(eventoActiva);
  return config;
});

api.interceptors.response.use(
  (response) => {
    // CRIT-1: No leer token del body — la cookie es la única fuente de auth.
    return response;
  },
  (error: AxiosError<{ message?: string; errors?: Record<string, string[]> }>) => {
    const url = error.config?.url ?? '';

    // H5: Solo limpiar sesión en 401 de endpoints protegidos que indican
    // token expirado. NO en 401 de /auth/login, /auth/me, ni /api/participant
    // (que puede responder 401 legítimo si el usuario no está registrado).
    const esRutaExcluida =
      url.includes('/auth/login') ||
      url.includes('/auth/me') ||
      url.includes('/participant');

    if (error.response?.status === 401 && !esRutaExcluida) {
      clearToken();
      alExpirarSesion?.();
    }

    return Promise.reject(error);
  }
);

/** Limpia la sesión local. Solo llamar en logout explícito o token expirado. */
export function clearToken() {
  // CRIT-1: No hay token en localStorage que limpiar — la cookie la maneja el backend.
  setEventoActiva(null);
}

// CRIT-3: Eliminar setToken/getToken — el token ya no se almacena en el frontend.
// El backend setea la cookie HttpOnly en el login y el navegador la envía sola.

/**
 * Convierte cualquier fallo de red o del servidor en un mensaje mostrable.
 * Sin esto la interfaz acaba enseñando "Request failed with status code 500".
 */
export function mensajeDeError(error: unknown, porDefecto = 'No se pudo completar la operacion'): string {  const err = error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;

  if (err?.code === 'ECONNABORTED') return 'El servidor tardo demasiado en responder';
  if (!err?.response) return 'Sin conexion con el servidor. Revisa tu red.';

  const datos = err.response.data;

  // Errores de validacion de Zod: se muestra el primero, que es el accionable.
  if (datos?.errors) {
    const primero = Object.values(datos.errors).flat()[0];
    if (primero) return primero;
  }

  if (datos?.message) return datos.message;

  if (err.response.status === 429) return 'Demasiados intentos. Espera un momento e intentalo de nuevo.';
  if (err.response.status >= 500) return 'Error del servidor. Intentalo de nuevo en unos segundos.';

  return porDefecto;
}

/** Error normalizado para monitoreo: endpoint, estado, competitionId, mensaje. */
export interface ApiErrorNormalizado {
  endpoint: string;
  estado: number | null;
  competitionId: number | null;
  mensaje: string;
}

export function normalizarErrorApi(error: unknown): ApiErrorNormalizado {
  const err = error as AxiosError<{ message?: string }>;
  return {
    endpoint: `${err?.config?.method ?? ''} ${err?.config?.url ?? ''}`.trim(),
    estado: err?.response?.status ?? null,
    competitionId: Number(err?.config?.headers?.['X-Evento-Id']) || null,
    mensaje: mensajeDeError(error),
  };
}

/** Envía el error al backend para monitoreo (máx. 1/min, fire-and-forget). */
let ultimoReporte = 0;

export function reportarErrorFrontend(error: unknown, extra: Record<string, unknown> = {}): void {
  try {
    const ahora = Date.now();
    // Throttle: ni cascadas de errores ni bucles pueden spamear al servidor.
    if (ahora - ultimoReporte < 60 * 1000) return;
    const normalizado = normalizarErrorApi(error);
    // Solo interesa lo accionable: fallos de red o 5xx.
    if (normalizado.estado !== null && normalizado.estado < 500) return;
    ultimoReporte = ahora;
    // fetch directo (no `api`): evita interceptores y recursión si falla el POST.
    void fetch('/api/errores', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...normalizado, ...extra }),
    }).catch(() => {
      // El monitoreo nunca puede romper la app.
    });
  } catch {
    // noop
  }
}

export default api;
