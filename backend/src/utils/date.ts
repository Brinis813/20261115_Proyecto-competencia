/**
 * Utilidades de fecha compartidas en todo el backend.
 */

/**
 * Convierte una Fecha a formato ISO (YYYY-MM-DD).
 * Útil para comparaciones de fechas sin componentes de hora.
 * También normaliza formatos como YYYY/MM/DD a YYYY-MM-DD.
 */
export function aFechaISO(fecha: Date | string): string {
  if (typeof fecha === 'string') {
    // Normalizar YYYY/MM/DD a YYYY-MM-DD
    return fecha.slice(0, 10).replace(/\//g, '-');
  }
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
