import mysql from 'mysql2/promise';
import { log } from '../../utils/logger';

/**
 * Auto-detecta categorias a partir de los participantes y Competencias existentes,
 * las inserta en la tabla `categorias` si no existen y sincroniza `categoria_id`.
 */
export async function autoPopulateCategories(conn: mysql.Connection): Promise<void> {
  try {
    const [partRows] = await conn.query<any[]>(
      `SELECT DISTINCT categoria FROM participantes WHERE categoria IS NOT NULL AND TRIM(categoria) != ''`,
    );

    for (const row of partRows) {
      const rawCat = (row.categoria || '').trim();
      if (!rawCat) continue;

      let genero: 'Masculino' | 'Femenino' = 'Masculino';
      let nombre = rawCat;

      const lower = rawCat.toLowerCase();
      if (
        lower.includes('femenino') ||
        lower.includes('mujeres') ||
        lower.includes('female') ||
        lower.includes('women')
      ) {
        genero = 'Femenino';
        nombre = rawCat.replace(/femenino|mujeres|female|women/gi, '').trim() || rawCat;
      } else if (
        lower.includes('masculino') ||
        lower.includes('hombres') ||
        lower.includes('male') ||
        lower.includes('men')
      ) {
        genero = 'Masculino';
        nombre = rawCat.replace(/masculino|hombres|male|men/gi, '').trim() || rawCat;
      }

      // No vale INSERT IGNORE: la clave unica incluye evento_id y los NULL
      // no chocan entre si, asi que cada arranque crearia un duplicado.
      await conn.query(
        `INSERT INTO categorias (nombre, genero)
         SELECT ?, ? FROM DUAL
         WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE nombre = ? AND genero = ?)`,
        [nombre, genero, nombre, genero],
      );

      const [catRows] = await conn.query<any[]>(
        `SELECT id FROM categorias WHERE nombre = ? AND genero = ? LIMIT 1`,
        [nombre, genero],
      );

      if (catRows[0]?.id) {
        await conn.query(
          `UPDATE participantes SET categoria_id = ? WHERE categoria = ? AND (categoria_id IS NULL OR categoria_id = 0)`,
          [catRows[0].id, rawCat],
        );
      }
    }
  } catch (err: any) {
    log.warn(`aviso en auto-poblacion de categorias: ${err?.message}`);
  }
}

/**
 * Elimina categorías duplicadas (misma etiqueta con distinto id).
 *
 * La clave única (evento_id, nombre, género) permite duplicados cuando
 * evento_id es NULL (MySQL no choca NULLs) y las semillas se repitieron:
 * la UI mostraba "Junior's Masculino" decenas de veces. Se conserva el id
 * menor de cada grupo y se reasignan sus referencias (participantes,
 * competencia_categorias, heats) antes de borrar. Idempotente.
 */
export async function eliminarCategoriasDuplicadas(conn: mysql.Connection): Promise<void> {
  try {
    const [grupos] = await conn.query<any[]>(
      `SELECT COALESCE(evento_id, -1) AS ev, nombre, genero,
              MIN(id) AS canon_id, COUNT(*) AS total,
              GROUP_CONCAT(id ORDER BY id ASC) AS ids
       FROM categorias
       GROUP BY COALESCE(evento_id, -1), nombre, genero
       HAVING COUNT(*) > 1`,
    );
    if (!grupos || grupos.length === 0) return;

    for (const g of grupos) {
      const canonId = Number(g.canon_id);
      const ids: number[] = String(g.ids ?? '')
        .split(',')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0 && n !== canonId);
      if (ids.length === 0) continue;
      const lista = ids.join(',');

      // Atletas apuntando a los duplicados -> canónica.
      await conn.query(
        `UPDATE participantes SET categoria_id = ? WHERE categoria_id IN (${lista})`,
        [canonId],
      );
      // Competencias vinculadas: se migran y luego se borran los enlaces viejos
      // (INSERT IGNORE evita chocar con la PK si ya estaba vinculada).
      await conn.query(
        `INSERT IGNORE INTO competencia_categorias (competencia_id, categoria_id)
         SELECT competencia_id, ? FROM competencia_categorias WHERE categoria_id IN (${lista})`,
        [canonId],
      );
      await conn.query(`DELETE FROM competencia_categorias WHERE categoria_id IN (${lista})`);
      // Heats: se reasignan; si el número choca con la unique
      // (categoria_id, numero), se desplaza al siguiente libre.
      const [heats] = await conn.query<any[]>(
        `SELECT id, numero FROM heats WHERE categoria_id IN (${lista}) ORDER BY id ASC`,
      );
      for (const h of heats ?? []) {
        try {
          await conn.query(`UPDATE heats SET categoria_id = ? WHERE id = ?`, [canonId, h.id]);
        } catch {
          const [mx] = await conn.query<any[]>(
            `SELECT COALESCE(MAX(numero), 0) AS mx FROM heats WHERE categoria_id = ?`,
            [canonId],
          );
          const libre = Number(mx[0]?.mx ?? 0) + 1;
          await conn.query(`UPDATE heats SET categoria_id = ?, numero = ? WHERE id = ?`, [
            canonId,
            libre,
            h.id,
          ]);
        }
      }
      await conn.query(`DELETE FROM categorias WHERE id IN (${lista})`);
      log.info(
        `categoría duplicada fusionada: "${g.nombre} ${g.genero}" -> id ${canonId} (${ids.length} borradas)`,
      );
    }
  } catch (err: any) {
    log.warn(`no se pudieron fusionar categorías duplicadas: ${err?.message}`);
  }
}

/**
 * Poda las divisiones obsoletas de los esquemas ya guardados.
 *
 * Cuando una categoría se elimina o renombra, los `wods.esquema` que la
 * referenciaban (`movimientos_por_division`, mapas legacy `reps`/`peso`,
 * `distancia_meta` por división) quedan con claves fantasma: el editor las
 * cargaba como estado invisible y el guardado reventaba con 400
 * ("La división X no está entre las categorías..."). Solo actúa en
 * competencias CON categorías (las claves que ya no existen se podan,
 * remapeando caja); sin categorías no se toca nada para no cambiar lo que ve
 * el juez. Idempotente y con log de filas tocadas.
 */
export async function sanearEsquemasCompetencias(conn: mysql.Connection): Promise<void> {
  try {
    const [links] = await conn.query<any[]>(
      `SELECT cc.competencia_id, c.nombre, c.genero
       FROM competencia_categorias cc JOIN categorias c ON c.id = cc.categoria_id`,
    );
    const etiquetasPorCompetencia = new Map<number, string[]>();
    for (const l of links ?? []) {
      const et = `${String(l.nombre ?? '').trim()} ${String(l.genero ?? '').trim()}`.trim();
      if (!et) continue;
      const id = Number(l.competencia_id);
      const arr = etiquetasPorCompetencia.get(id) ?? [];
      if (!arr.some((e) => e.toLowerCase() === et.toLowerCase())) arr.push(et);
      etiquetasPorCompetencia.set(id, arr);
    }

    const podarMapa = (
      mapa: Record<string, number> | undefined,
      validas: Map<string, string>,
    ): { mapa: Record<string, number> | undefined; cambio: boolean } => {
      if (!mapa || typeof mapa !== 'object') return { mapa, cambio: false };
      const saneado: Record<string, number> = {};
      for (const [clave, valor] of Object.entries(mapa)) {
        const c = validas.get(clave.trim().toLowerCase());
        if (!c) continue;
        const n = Number(valor) || 0;
        if (saneado[c] === undefined || n > saneado[c]) saneado[c] = n;
      }
      const cambio =
        Object.keys(saneado).length !== Object.keys(mapa).length ||
        Object.keys(saneado).some((k) => !(k in mapa));
      return { mapa: saneado, cambio };
    };

    const [wods] = await conn.query<any[]>(
      `SELECT id, competencia_id, esquema FROM wods WHERE esquema IS NOT NULL`,
    );
    let saneados = 0;
    for (const w of wods ?? []) {
      const divisiones = etiquetasPorCompetencia.get(Number(w.competencia_id)) ?? [];
      // Sin categorías vinculadas no se toca: el juez podría estar leyendo
      // esas claves y el guardado ya las colapsa a General por sí solo.
      if (divisiones.length === 0) continue;
      let esquema: any;
      try {
        esquema = typeof w.esquema === 'string' ? JSON.parse(w.esquema) : w.esquema;
      } catch {
        continue;
      }
      if (!esquema || typeof esquema !== 'object') continue;
      const validas = new Map(divisiones.map((d) => [d.trim().toLowerCase(), d.trim()]));
      let cambio = false;

      if (
        esquema.movimientos_por_division &&
        typeof esquema.movimientos_por_division === 'object'
      ) {
        const podadas: Record<string, any[]> = {};
        for (const [clave, lista] of Object.entries<any>(esquema.movimientos_por_division)) {
          const c = validas.get(clave.trim().toLowerCase());
          if (!c) {
            cambio = true;
            continue;
          }
          const normalizada = (Array.isArray(lista) ? lista : []).map((m: any) => {
            const copia = { ...m };
            for (const campo of ['reps', 'peso'] as const) {
              const r = podarMapa(copia[campo], validas);
              if (r.cambio) {
                cambio = true;
                copia[campo] = r.mapa;
              }
            }
            return copia;
          });
          if (c !== clave) cambio = true;
          if (podadas[c] === undefined) podadas[c] = normalizada;
          else podadas[c].push(...normalizada);
        }
        if (JSON.stringify(podadas) !== JSON.stringify(esquema.movimientos_por_division))
          cambio = true;
        esquema = { ...esquema, movimientos_por_division: podadas };
      }
      if (Array.isArray(esquema.movimientos)) {
        const normalizados = esquema.movimientos.map((m: any) => {
          const copia = { ...m };
          for (const campo of ['reps', 'peso'] as const) {
            const r = podarMapa(copia[campo], validas);
            if (r.cambio) {
              cambio = true;
              copia[campo] = r.mapa;
            }
          }
          return copia;
        });
        if (JSON.stringify(normalizados) !== JSON.stringify(esquema.movimientos)) cambio = true;
        esquema = { ...esquema, movimientos: normalizados };
      }
      if (esquema.distancia_meta && typeof esquema.distancia_meta === 'object') {
        const r = podarMapa(esquema.distancia_meta, validas);
        if (r.cambio) {
          cambio = true;
          esquema = { ...esquema, distancia_meta: r.mapa };
        }
      }

      if (cambio) {
        await conn.query(`UPDATE wods SET esquema = ? WHERE id = ?`, [
          JSON.stringify(esquema),
          w.id,
        ]);
        saneados++;
      }
    }
    if (saneados > 0) log.info(`esquemas saneados: ${saneados} WOD(s) sin divisiones obsoletas`);
  } catch (err: any) {
    log.warn(`no se pudieron sanear los esquemas: ${err?.message}`);
  }
}

/**
 * Repara `competencias.divisiones` que guardaron objetos en vez de etiquetas.
 *
 * Versiones antiguas persistieron la categoría completa
 * (`[{nombre:"Rx", genero:"Masculino", peso:0, ...}]`) en lugar de la etiqueta
 * (`["Rx Masculino"]`). Se convierten a etiquetas y se reescriben; las filas
 * ya sanas no se tocan, así que es seguro repetirlo en cada arranque.
 */
export async function sanearDivisionesCompetencias(conn: mysql.Connection): Promise<void> {
  try {
    const [rows] = await conn.query<any[]>(
      `SELECT id, divisiones FROM competencias WHERE divisiones IS NOT NULL`,
    );

    for (const row of rows) {
      let arr: unknown;
      try {
        arr = typeof row.divisiones === 'string' ? JSON.parse(row.divisiones) : row.divisiones;
      } catch {
        continue;
      }
      if (!Array.isArray(arr)) continue;
      if (!arr.some((d) => typeof d !== 'string')) continue;

      const limpias = [
        ...new Set(
          arr
            .map((d): string => {
              if (typeof d === 'string') return d.trim();
              if (d && typeof d === 'object') {
                const o = d as Record<string, unknown>;
                const nombre = typeof o.nombre === 'string' ? o.nombre.trim() : '';
                const genero = typeof o.genero === 'string' ? o.genero.trim() : '';
                return `${nombre} ${genero}`.trim();
              }
              return '';
            })
            .filter(Boolean),
        ),
      ];

      await conn.query(`UPDATE competencias SET divisiones = ? WHERE id = ?`, [
        JSON.stringify(limpias),
        row.id,
      ]);
      log.info(
        `divisiones saneadas de la competencia ${row.id}: ${limpias.join(' · ') || '(vacías)'}`,
      );
    }
  } catch (err: any) {
    log.warn(`no se pudieron sanear las divisiones: ${(err as Error).message}`);
  }
}
