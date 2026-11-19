/**
 * Formato compartido de etiquetas de categoría/división.
 *
 * Antes vivía copiado en 7 páginas (admin/juez/public): misma firma,
 * mismo cuerpo. Fuente única a partir de ahora.
 */

/**
 * Elimina categorías duplicadas para mostrar.
 *
 * La BD permitió duplicados históricos (clave única con evento_id NULL no
 * choca en MySQL + semillas repetidas): misma etiqueta "Nombre Género" con
 * distinto id. Se conserva la primera (id menor) y se descartan las demás,
 * además de colapsar ids repetidos. Ordena por id para estabilidad.
 */
export function dedupCategorias<T extends { id: number; nombre: string; genero: string }>(
  categorias: T[],
): T[] {
  const porId = new Map<number, T>();
  for (const c of categorias) {
    if (!porId.has(c.id)) porId.set(c.id, c);
  }
  const vistos = new Set<string>();
  const unicas: T[] = [];
  const ordenadas = [...porId.values()].sort((a, b) => a.id - b.id);
  for (const c of ordenadas) {
    const clave = `${(c.nombre ?? '').trim().toLowerCase()}|${(c.genero ?? '').trim().toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    unicas.push(c);
  }
  return unicas;
}

/** "Rx Masculino · Scaled Femenino" o "Sin categorias" si no hay nada. */
export function formatearCategorias(divisiones?: unknown[] | null): string {
  const categorias = (divisiones ?? [])
    .map((d) => {
      if (typeof d === 'string') return d.trim();
      if (d && typeof d === 'object') {
        const o = d as Record<string, unknown>;
        const nombre = typeof o.nombre === 'string' ? o.nombre.trim() : '';
        const genero = typeof o.genero === 'string' ? o.genero.trim() : '';
        return `${nombre} ${genero}`.trim();
      }
      return '';
    })
    .filter(Boolean);
  return categorias.length > 0 ? categorias.join(' · ') : 'Sin categorias';
}
