import { env, isProduction } from '../config/env';

/**
 * Registro con niveles.
 *
 * Existe para que la consola sea util al depurar: por defecto solo se ve lo
 * accionable (arranque, avisos y errores). El detalle de cada consulta SQL o
 * de cada conexion de socket se queda en `debug`, que se activa solo cuando
 * hace falta con LOG_LEVEL=debug.
 */

const NIVELES = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Nivel = keyof typeof NIVELES;

const nivelActual = NIVELES[env.LOG_LEVEL as Nivel] ?? NIVELES.info;

// Los codigos de color se omiten cuando la salida no es una terminal
// (Docker, Dokploy, un archivo), donde solo ensuciarian el texto.
const conColor = process.stdout.isTTY;
const pintar = (codigo: string, texto: string) =>
  conColor ? `\x1b[${codigo}m${texto}\x1b[0m` : texto;

const ETIQUETAS: Record<Nivel, string> = {
  error: pintar('31', 'error'),
  warn: pintar('33', 'aviso'),
  info: pintar('36', 'info '),
  debug: pintar('90', 'debug'),
};

function hora(): string {
  return pintar('90', new Date().toTimeString().slice(0, 8));
}

function emitir(nivel: Nivel, mensaje: string, ...extra: unknown[]) {
  if (NIVELES[nivel] > nivelActual) return;
  // En producción: una línea JSON por evento (agregable por Axiom/Datadog/Loki).
  // En desarrollo: formato humano legible con color.
  if (isProduction) {
    const salida = nivel === 'error' ? console.error : console.log;
    salida(
      JSON.stringify({
        nivel,
        mensaje,
        extra: extra.length > 0 ? extra : undefined,
        ts: new Date().toISOString(),
      }),
    );
    return;
  }
  const salida = nivel === 'error' ? console.error : console.log;
  salida(`${hora()} ${ETIQUETAS[nivel]} ${mensaje}`, ...extra);
}

export const log = {
  error: (mensaje: string, ...extra: unknown[]) => emitir('error', mensaje, ...extra),
  warn: (mensaje: string, ...extra: unknown[]) => emitir('warn', mensaje, ...extra),
  info: (mensaje: string, ...extra: unknown[]) => emitir('info', mensaje, ...extra),
  debug: (mensaje: string, ...extra: unknown[]) => emitir('debug', mensaje, ...extra),

  /** Texto sin prefijo, para los recuadros del arranque. */
  raw: (mensaje = '') => console.log(mensaje),
};
