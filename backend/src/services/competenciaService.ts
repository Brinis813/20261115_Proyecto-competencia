import { Op } from 'sequelize';
import { Competencia, Wod, Asignacion, Usuario, Participante, Resultado, Categoria, CompetenciaCategoria, EventoUsuario } from '../models';
import { borrarArchivoSubido } from '../utils/archivos';
import type { TipoParticipacion, CompetenciaTieBreakPolicy } from '../models/Competencia';
import { COMPETENCIA_TIEBREAK_POLICIES } from '../models/Competencia';
import { sequelize } from '../config/database';
import { broadcastLeaderboard } from '../sockets/handlers';
import type { EsquemaWod } from '../types/medicion';

export interface WodInput {
  id?: number;
  orden: number;
  nombre_ejercicio: string;
  /**
   * Los 6 tipos del formulario. `time_trial_splits` se normaliza al enum
   * físico (`tiempo` + `esquema.modalidad = 'time_trial_splits'`), porque la
   * columna no admite el sexto valor pero el scorecard sí.
   */
  tipo_medicion: 'tiempo' | 'repeticiones' | 'peso' | 'distancia' | 'calorías' | 'time_trial_splits';
  /** Unidad de la marca cuando tipo_medicion=distancia. m = metros, km = kilómetros, mi = millas. */
  unidad_distancia?: 'm' | 'km' | 'mi' | null;
  /** Foto del WOD (URL de /api/uploads/wods). null = sin imagen. */
  imagen_url?: string | null;
  tiempo_estimado_duracion: number;
  /** Tope opcional del ejercicio en segundos. Ausente / 0 / null = sin tope. */
  tiempo_cap?: number | null;
  esquema?: EsquemaWod | null;
  puntaje_maximo: number;
}

export interface CompetenciaInput {
  nombre: string;
  descripcion?: string;
  metodo_desempate?: string;
  tipo_flujo: 'en_serie' | 'estaciones_simultaneas';
  tipo_publicacion: 'tiempo_real' | 'al_finalizar_circuito';
  estado?: 'borrador' | 'activo' | 'finalizado';
  tipo_participacion?: TipoParticipacion;
  /** Duracion / time cap de la competencia en minutos. null o 0 = sin tope. */
  duracion_minutos?: number | null;
  /** Numero de rondas que se repite cada ejercicio de la competencia (1-100, default 1). */
  rondas?: number | null;
  desempate_nombre?: string | null;
  desempate_tipo_medicion?: string | null;
  /** Política de desempate de la competencia (default: estándar por WOD designado). */
  tiebreak_policy?: CompetenciaTieBreakPolicy;
  /** WOD designado como desempate (debe pertenecer a la competencia; se fija por update). */
  wod_desempate_id?: number | null;
  divisiones?: string[] | null;
  /** Categorias que compiten esta competencia. Manda sobre `divisiones`. */
  categoria_ids?: number[] | null;
  /** Evento a la que pertenece. La pone el controlador, no el cliente. */
  evento_id?: number | null;
  wods: WodInput[];
}

/**
 * Etiqueta de una categoria tal y como se guarda en `participantes.categoria`.
 * Es la clave por la que agrupan la clasificacion y las reps del scorecard, asi
 * que tiene que salir exactamente igual desde los dos lados.
 */
export function etiquetaCategoria(categoria: { nombre: string; genero: string }): string {
  return `${categoria.nombre} ${categoria.genero}`.trim();
}

/**
 * Deja `competencia_categorias` con exactamente las categorias enviadas y devuelve sus
 * etiquetas, que es lo que se guarda en `competencias.divisiones` como copia derivada.
 */
async function sincronizarCategorias(competenciaId: number, ids: number[], t: any): Promise<string[]> {
  const unicos = [...new Set(ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))];

  await CompetenciaCategoria.destroy({ where: { competencia_id: competenciaId }, transaction: t });
  if (unicos.length === 0) return [];

  const categorias = await Categoria.findAll({ where: { id: unicos }, transaction: t });
  if (categorias.length !== unicos.length) {
    throw new Error('Alguna de las categorias seleccionadas ya no existe');
  }

  await CompetenciaCategoria.bulkCreate(
    categorias.map((c) => ({ competencia_id: competenciaId, categoria_id: c.id })),
    { transaction: t }
  );

  return categorias.map(etiquetaCategoria);
}

/** Limpia la lista de divisiones: recorta, quita vacios y duplicados; null si queda vacia. */
function normalizarDivisiones(divisiones?: string[] | null): string[] | null {
  if (!Array.isArray(divisiones)) return null;
  const limpias = [...new Set(divisiones.map((d) => String(d).trim()).filter(Boolean))];
  return limpias.length > 0 ? limpias : null;
}

/**
 * Sanea `divisiones` en SALIDA.
 *
 * Filas antiguas guardaron objetos de categoría completos en vez de etiquetas
 * (`[{nombre:"Rx", genero:"Masculino", ...}]`), y eso reventaba al frontend
 * con `d.trim is not a function`. Acepta strings, objetos {nombre, genero} o
 * mixtos y devuelve etiquetas limpias.
 */
export function sanearDivisionesSalida(divisiones: unknown): string[] | null {
  if (!Array.isArray(divisiones)) return null;
  const limpias = [
    ...new Set(
      divisiones
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
        .filter(Boolean)
    ),
  ];
  return limpias.length > 0 ? limpias : null;
}

/** Un tope de 0 o vacio significa "sin tope", y se guarda como NULL. */
function normalizarDuracion(minutos?: number | null): number | null {
  const n = Number(minutos);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Rondas de la competencia: entero 1-100, default 1. */
function normalizarRondas(rondas?: number | null): number {
  const n = Number(rondas);
  if (!Number.isFinite(n)) return 1;
  return Math.min(100, Math.max(1, Math.round(n)));
}

/**
 * Rondas efectivas de una competencia leido de la base: usa `competencias.rondas` y, en filas
 * anteriores a la columna, el `esquema.rondas` del primer WOD guiado.
 */
function rondasEfectivas(competencia: { rondas?: unknown; wods?: Array<{ esquema?: { rondas?: unknown } | null }> }): number {
  const directa = Number((competencia as Record<string, unknown>).rondas);
  if (Number.isFinite(directa) && directa >= 1) return Math.min(100, Math.round(directa));
  for (const c of competencia.wods ?? []) {
    const r = Number(c.esquema?.rondas);
    if (Number.isFinite(r) && r >= 1) return Math.min(100, Math.round(r));
  }
  return 1;
}

/**
 * Fija las rondas de la competencia en cada esquema for_time/amrap para que el calculo
 * del juez (que multiplica reps x rondas) siga cuadrando aunque lea el
 * esquema. Los esquemas max_load/splits no llevan rondas.
 */
function esquemaConRondas(esquema: EsquemaWod | null | undefined, rondas: number): EsquemaWod | null {
  if (!esquema) return null;
  if (esquema.modalidad !== 'for_time' && esquema.modalidad !== 'amrap') return esquema;
  // Esquema puramente informativo (meta de distancia sin movimientos): no se
  // le inyectan rondas para no ensuciar el JSON.
  if (!esquema.movimientos && !esquema.movimientos_por_division && !esquema.intentos && !esquema.segmentos) return esquema;
  return { ...esquema, rondas };
}

/**
 * Auto-repara el esquema entrante contra las divisiones vigentes.
 *
 * Las claves de división se quedan obsoletas cuando una categoría se elimina
 * o renombra (o el payload viene de un cliente cacheado / una importación
 * legacy): antes eso reventaba el guardado con 400
 * ("La división X no está entre las categorías...") y el usuario no podía
 * guardar ni siquiera la corrección. Ahora se reconcilian solas:
 *  - Con divisiones vigentes: se conservan (remapeando caja) solo las claves
 *    que existen; las obsoletas se podan.
 *  - Sin divisiones vigentes: todo colapsa a "General" para no perder el
 *    trabajo ya cargado.
 * Se aplica a `movimientos_por_division`, a los mapas legacy `reps`/`peso` y
 * a `distancia_meta` por división. Devuelve el esquema saneado (nuevo objeto).
 */
export function podarEsquemaADivisiones(
  esquema: EsquemaWod | null | undefined,
  divisiones: string[] | null
): EsquemaWod | null | undefined {
  if (!esquema) return esquema;
  const canonicas = (divisiones ?? []).map((d) => d.trim()).filter(Boolean);
  const porMinuscula = new Map(canonicas.map((d) => [d.toLowerCase(), d]));
  const aCanon = (clave: string): string | null => {
    const k = clave.trim().toLowerCase();
    if (porMinuscula.size === 0) return 'General';
    return porMinuscula.get(k) ?? null;
  };
  const podarMapa = <T>(mapa: Record<string, T> | undefined): Record<string, T> | undefined => {
    if (!mapa) return mapa;
    const saneado: Record<string, T> = {};
    for (const [clave, valor] of Object.entries(mapa)) {
      const c = aCanon(clave);
      if (c === null) continue;
      // Si dos claves colapsan a la misma canónica, gana el mayor valor.
      if (saneado[c] === undefined || Number(valor) > Number(saneado[c])) saneado[c] = valor;
    }
    return saneado;
  };

  const copiado: EsquemaWod = { ...esquema };
  if (copiado.movimientos_por_division) {
    const podadas: Record<string, NonNullable<EsquemaWod['movimientos_por_division']>[string]> = {};
    for (const [clave, lista] of Object.entries(copiado.movimientos_por_division)) {
      const c = aCanon(clave);
      if (c === null) continue;
      const normalizada = (lista ?? []).map((m) => ({
        ...m,
        reps: podarMapa(m.reps) ?? m.reps,
        ...(m.peso ? { peso: podarMapa(m.peso) } : {}),
      }));
      if (podadas[c] === undefined) podadas[c] = normalizada;
      else podadas[c].push(...normalizada);
    }
    copiado.movimientos_por_division = podadas;
  }
  if (copiado.movimientos) {
    copiado.movimientos = copiado.movimientos.map((m) => ({
      ...m,
      reps: podarMapa(m.reps) ?? m.reps,
      ...(m.peso ? { peso: podarMapa(m.peso) } : {}),
    }));
  }
  if (copiado.distancia_meta && typeof copiado.distancia_meta === 'object') {
    copiado.distancia_meta = podarMapa(copiado.distancia_meta as Record<string, number>) as
      | number
      | Record<string, number>;
  }
  return copiado;
}

/**
 * Opción B: las claves de `reps`/`peso` del esquema deben corresponder a las
 * divisiones vigentes de la competencia (etiquetas de sus categorías). Si la competencia no tiene
 * divisiones, solo se admite la clave general. Devuelve el primer problema
 * encontrado, o null si todo cuadra.
 *
 * Nota: el servicio poda primero con `podarEsquemaADivisiones`, así que esto
 * queda como red de seguridad (no debería dispararse con payloads saneados).
 */
function validarEsquemaContraDivisiones(
  wods: Array<{ nombre_ejercicio: string; esquema?: EsquemaWod | null }>,
  divisiones: string[] | null
): string | null {
  const validas = new Set((divisiones ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean));
  const revisarClaves = (movNombre: string, fuente: Record<string, number> | undefined): string | null => {
    if (!fuente) return null;
    for (const clave of Object.keys(fuente)) {
      const k = clave.trim().toLowerCase();
      if (validas.size === 0) {
        if (k !== 'general') {
          return `El movimiento "${movNombre}" usa la división "${clave}", pero la competencia no tiene categorías asignadas (solo se admite "General")`;
        }
      } else if (!validas.has(k)) {
        return `El movimiento "${movNombre}" usa la división "${clave}", que no está entre las categorías de la competencia (${(divisiones ?? []).join(', ')})`;
      }
    }
    return null;
  };
  for (const c of wods) {
    if (!c.esquema || !('movimientos' in c.esquema)) continue;
    const esquema = c.esquema;
    // Las claves de división de movimientos_por_division deben existir.
    for (const clave of Object.keys(esquema.movimientos_por_division ?? {})) {
      const k = clave.trim().toLowerCase();
      if (validas.size === 0) {
        if (k !== 'general') {
          return `La división "${clave}" no está entre las categorías de la competencia (solo se admite "General")`;
        }
      } else if (!validas.has(k)) {
        return `La división "${clave}" no está entre las categorías de la competencia (${(divisiones ?? []).join(', ')})`;
      }
    }
    const movs = esquema.movimientos ?? [];
    for (const m of movs) {
      for (const fuente of [m.reps, m.peso] as Array<Record<string, number> | undefined>) {
        const fallo = revisarClaves(m.nombre, fuente);
        if (fallo) return fallo;
      }
    }
    for (const lista of Object.values(esquema.movimientos_por_division ?? {})) {
      for (const m of lista ?? []) {
        for (const fuente of [m.reps, m.peso] as Array<Record<string, number> | undefined>) {
          const fallo = revisarClaves(m.nombre, fuente);
          if (fallo) return fallo;
        }
      }
    }
  }
  return null;
}

/** Tope opcional del ejercicio, en segundos. Sin valor util -> 0 (sin tope). */
function normalizarTiempoCap(cap?: number | null): number {
  const n = Number(cap);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Unidad de distancia: solo admite m/km/mi; cualquier otra cosa cae a 'm'. */
function normalizarUnidadDistancia(unidad?: string | null): 'm' | 'km' | 'mi' {
  return unidad === 'km' || unidad === 'mi' || unidad === 'm' ? unidad : 'm';
}

/**
 * Normaliza la medición del formulario al enum físico de `wods.tipo_medicion`.
 *
 * `time_trial_splits` viaja como `tiempo` en la columna y conserva su
 * modalidad en `esquema.modalidad`, que es lo que leen el scorecard del juez
 * y el motor de puntuación (menor tiempo gana, sin capados).
 */
function normalizarTipoMedicion(
  wod: Pick<WodInput, 'tipo_medicion' | 'esquema'>
): { tipo_medicion: 'tiempo' | 'repeticiones' | 'peso' | 'distancia' | 'calorías'; esquema: EsquemaWod | null } {
  const esquema = (wod.esquema ?? null) as EsquemaWod | null;
  if (wod.tipo_medicion === 'time_trial_splits') {
    const segmentos = esquema && 'segmentos' in esquema && Array.isArray(esquema.segmentos) ? esquema.segmentos : [];
    return {
      tipo_medicion: 'tiempo',
      esquema: { modalidad: 'time_trial_splits', segmentos },
    };
  }
  return { tipo_medicion: wod.tipo_medicion, esquema };
}

/** Foto del WOD: URL de /api/uploads/wods o null (sin imagen). */
function normalizarImagenWod(imagen?: string | null): string | null {
  const url = String(imagen ?? '').trim();
  if (!url) return null;
  if (url.startsWith('/api/uploads/wods/') && url.length <= 500) return url;
  return null;
}

/** Borra del disco la foto anterior de un WOD, si vive dentro de uploads/wods. */
function borrarImagenWodAnterior(imagenUrl: string | null): void {
  borrarArchivoSubido(imagenUrl, '/api/uploads/wods/');
}

/** Borra del disco la portada anterior de una competencia, si vive dentro de uploads/competencias. */
function borrarPortadaCompetenciaAnterior(imagenUrl: string | null): void {
  borrarArchivoSubido(imagenUrl, '/api/uploads/competencias/');
}

/**
 * Cambia la portada de la competencia. `imagenUrl` en null la quita.
 * La URL debe venir de POST /competencias/:id/imagen (o null).
 */
export async function actualizarImagenCompetencia(
  id: number,
  imagenUrl: string | null
): Promise<{ id: number; imagen_url: string | null }> {
  const url = imagenUrl ? String(imagenUrl).trim() : '';
  if (url && (!url.startsWith('/api/uploads/competencias/') || url.length > 500)) {
    throw new Error('URL de imagen invalida');
  }
  // Lectura + escritura en una transacción: dos PUT concurrentes ya no
  // pueden pisarse (el borrado del archivo anterior queda fuera, porque
  // el disco no es transaccional, y solo borra la URL desplazada).
  const { anterior, final } = await sequelize.transaction(async (t) => {
    const competencia = await Competencia.findByPk(id, { transaction: t });
    if (!competencia) throw new Error('Competencia no encontrado');
    const previa = competencia.imagen_url ?? null;
    await competencia.update({ imagen_url: url || null }, { transaction: t });
    return { anterior: previa, final: url || null };
  });
  if (anterior && anterior !== final) borrarPortadaCompetenciaAnterior(anterior);
  return { id, imagen_url: final };
}

export async function createCompetencia(data: CompetenciaInput) {
  return sequelize.transaction(async (t) => {
    // Las categorias mandan sobre el texto libre: se resuelven primero para
    // poder validar el esquema contra las divisiones efectivas (Opción B).
    let etiquetas: string[] | null = normalizarDivisiones(data.divisiones);
    if (data.categoria_ids !== undefined && data.categoria_ids !== null) {
      const unicos = [...new Set(data.categoria_ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))];
      if (unicos.length > 0) {
        const categorias = await Categoria.findAll({ where: { id: unicos }, transaction: t });
        if (categorias.length !== unicos.length) {
          throw new Error('Alguna de las categorias seleccionadas ya no existe');
        }
        etiquetas = categorias.map(etiquetaCategoria);
      } else {
        etiquetas = [];
      }
    }
    // Las divisiones obsoletas del esquema (categoría eliminada/renombrada,
    // cliente cacheado) se podan solas en vez de reventar con 400: si no, el
    // usuario no podría guardar ni la corrección.
    data.wods = data.wods.map((w) => ({ ...w, esquema: podarEsquemaADivisiones(w.esquema, etiquetas) }));
    const errorEsquema = validarEsquemaContraDivisiones(data.wods, etiquetas);
    if (errorEsquema) throw new Error(errorEsquema);

    // Las rondas viven en la competencia. Si el cliente aun manda rondas por esquema
    // (datos viejos), la de la competencia manda; si no manda rondas, se hereda la del
    // primer WOD guiado para no perder el valor configurado.
    let rondas = data.rondas !== undefined && data.rondas !== null
      ? normalizarRondas(data.rondas)
      : rondasEfectivas({ rondas: undefined, wods: data.wods });

    const competencia = await Competencia.create(
      {
        evento_id: data.evento_id ?? null,
        nombre: data.nombre,
        descripcion: data.descripcion ?? null,
        metodo_desempate: data.metodo_desempate ?? null,
        tipo_flujo: data.tipo_flujo,
        tipo_publicacion: data.tipo_publicacion,
        estado: data.estado ?? 'activo',
        tipo_participacion: data.tipo_participacion ?? 'Individual',
        duracion_minutos: normalizarDuracion(data.duracion_minutos),
        rondas,
        desempate_nombre: data.desempate_nombre || null,
        desempate_tipo_medicion: (data.desempate_tipo_medicion as 'tiempo' | 'repeticiones' | 'peso' | 'distancia' | null) || null,
        tiebreak_policy: data.tiebreak_policy && (COMPETENCIA_TIEBREAK_POLICIES as string[]).includes(data.tiebreak_policy)
          ? data.tiebreak_policy
          : 'DESIGNATED_CIRCUIT_SPLIT',
        divisiones: etiquetas && etiquetas.length > 0 ? etiquetas : normalizarDivisiones(data.divisiones),
      },
      { transaction: t }
    );

    // Las categorias mandan sobre el texto libre: si vienen, `divisiones` se
    // reescribe con sus etiquetas (ya calculadas arriba para validar el esquema).
    if (data.categoria_ids !== undefined && data.categoria_ids !== null) {
      await sincronizarCategorias(competencia.id, data.categoria_ids, t);
      await competencia.update({ divisiones: etiquetas && etiquetas.length > 0 ? etiquetas : null }, { transaction: t });
    }

    await Wod.bulkCreate(
      data.wods.map((c, i) => {
        const normalizado = normalizarTipoMedicion(c);
        return {
          competencia_id: competencia.id,
          orden: c.orden ?? i + 1,
          nombre_ejercicio: c.nombre_ejercicio,
          tipo_medicion: normalizado.tipo_medicion,
          unidad_distancia: normalizarUnidadDistancia(c.unidad_distancia),
          imagen_url: normalizarImagenWod(c.imagen_url),
          tiempo_estimado_duracion: c.tiempo_estimado_duracion,
          tiempo_cap: normalizado.tipo_medicion === 'tiempo' ? normalizarTiempoCap(c.tiempo_cap) : 0,
          esquema: esquemaConRondas(normalizado.esquema, rondas),
          puntaje_maximo: c.puntaje_maximo,
        };
      }),
      { transaction: t }
    );

    return Competencia.findByPk(competencia.id, { include: ['wods', 'categorias'], transaction: t });
  });
}

export async function getAllCompetencias(filtro: Record<string, any> = {}) {
  const competencias = await Competencia.findAll({
    where: filtro,
    include: ['wods', 'categorias'],
    order: [
      ['id', 'ASC'],
      [{ model: Wod, as: 'wods' }, 'orden', 'ASC'],
    ],
  });
  // Sanea divisiones corruptas (objetos legacy) antes de enviar al cliente.
  return competencias.map((w) => {
    const json = w.toJSON() as Record<string, unknown>;
    json.divisiones = sanearDivisionesSalida(json.divisiones);
    json.rondas = rondasEfectivas(json as { rondas?: unknown; wods?: Array<{ esquema?: { rondas?: unknown } | null }> });
    return json;
  });
}

export async function getCompetenciaById(id: number) {
  const competencia = await Competencia.findByPk(id, {
    include: ['wods', 'categorias'],
    order: [[{ model: Wod, as: 'wods' }, 'orden', 'ASC']],
  });
  if (!competencia) return null;
  const json = competencia.toJSON() as Record<string, unknown>;
  json.divisiones = sanearDivisionesSalida(json.divisiones);
  json.rondas = rondasEfectivas(json as { rondas?: unknown; wods?: Array<{ esquema?: { rondas?: unknown } | null }> });
  return json;
}

/**
 * Actualiza la competencia y, si se envian wods, sincroniza la lista:
 * actualiza los existentes, crea los nuevos y borra los que ya no aparecen.
 * Un WOD solo se borra si no tiene resultados registrados, para no
 * perder mediciones ya tomadas.
 */
export async function updateCompetencia(id: number, data: Partial<CompetenciaInput>) {
  const competencia = await Competencia.findByPk(id);
  if (!competencia) throw new Error('Competencia no encontrado');

  return sequelize.transaction(async (t) => {
    const campos: Record<string, any> = {};
    for (const campo of [
      'nombre',
      'descripcion',
      'metodo_desempate',
      'tipo_flujo',
      'tipo_publicacion',
      'estado',
      'tipo_participacion',
      'desempate_nombre',
      'desempate_tipo_medicion',
      'tiebreak_policy',
    ] as const) {
      if (data[campo] !== undefined) campos[campo] = data[campo];
    }
    if (data.tiebreak_policy !== undefined && !(COMPETENCIA_TIEBREAK_POLICIES as string[]).includes(data.tiebreak_policy)) {
      throw new Error('tiebreak_policy inválida: usa NONE, TIEBREAK_MARK o DESIGNATED_CIRCUIT_SPLIT');
    }
    if (data.duracion_minutos !== undefined) campos.duracion_minutos = normalizarDuracion(data.duracion_minutos);
    if (data.rondas !== undefined && data.rondas !== null) campos.rondas = normalizarRondas(data.rondas);
    if (data.divisiones !== undefined) campos.divisiones = normalizarDivisiones(data.divisiones);

    if (data.categoria_ids !== undefined && data.categoria_ids !== null) {
      const etiquetas = await sincronizarCategorias(id, data.categoria_ids, t);
      campos.divisiones = etiquetas.length > 0 ? etiquetas : null;
    }

    // Opción B: validar el esquema entrante contra las divisiones efectivas
    // (las recién sincronizadas, o las que ya tenía la competencia). Las
    // claves obsoletas se podan solas (categoría eliminada/renombrada o
    // cliente cacheado) en vez de reventar con 400.
    if (data.wods) {
      const divisionesEfectivas: string[] | null =
        campos.divisiones !== undefined
          ? campos.divisiones
          : Array.isArray(competencia.divisiones)
            ? competencia.divisiones
            : null;
      data.wods = data.wods.map((w) => ({
        ...w,
        esquema: podarEsquemaADivisiones(w.esquema, divisionesEfectivas),
      }));
      const errorEsquema = validarEsquemaContraDivisiones(data.wods, divisionesEfectivas);
      if (errorEsquema) throw new Error(errorEsquema);
    }

    // El WOD designado como desempate debe pertenecer a la competencia (o null).
    if (data.wod_desempate_id !== undefined) {
      if (data.wod_desempate_id === null) {
        campos.wod_desempate_id = null;
      } else {
        const designado = await Wod.findOne({
          where: { id: data.wod_desempate_id, competencia_id: id },
          transaction: t,
        });
        if (!designado) throw new Error('El WOD de desempate no pertenece a esta competencia');
        campos.wod_desempate_id = designado.id;
      }
    }

    await competencia.update(campos, { transaction: t });

    // Rondas efectivas tras el update: las recién enviadas, o las que ya
    // tenía la competencia (con fallback al primer esquema en filas antiguas).
    const rondasEfectivasTx = campos.rondas !== undefined
      ? campos.rondas
      : rondasEfectivas({
          rondas: (competencia as unknown as Record<string, unknown>).rondas,
          wods: data.wods ?? (await Wod.findAll({ where: { competencia_id: id }, transaction: t })).map((c) => ({ esquema: c.esquema as { rondas?: unknown } | null })),
        });

    if (data.wods) {
      const existentes = await Wod.findAll({ where: { competencia_id: id }, transaction: t });
      const idsEnviados = new Set(data.wods.map((c) => c.id).filter(Boolean) as number[]);

      const aBorrar = existentes.filter((c) => !idsEnviados.has(c.id));
      if (aBorrar.length > 0) {
        const conResultados = await Resultado.count({
          where: { wod_id: { [Op.in]: aBorrar.map((c) => c.id) } },
          transaction: t,
        });
        if (conResultados > 0) {
          throw new Error(
            'No se pueden eliminar wods que ya tienen resultados registrados. Resetea esas mediciones primero.'
          );
        }
        for (const c of aBorrar) borrarImagenWodAnterior(c.imagen_url ?? null);
        await Wod.destroy({ where: { id: aBorrar.map((c) => c.id) }, transaction: t });
      }

      for (const [indice, wod] of data.wods.entries()) {
        const normalizado = normalizarTipoMedicion(wod);
        const valores = {
          competencia_id: id,
          orden: wod.orden ?? indice + 1,
          nombre_ejercicio: wod.nombre_ejercicio,
          tipo_medicion: normalizado.tipo_medicion,
          unidad_distancia: normalizarUnidadDistancia(wod.unidad_distancia),
          imagen_url: normalizarImagenWod(wod.imagen_url),
          tiempo_estimado_duracion: wod.tiempo_estimado_duracion,
          tiempo_cap: normalizado.tipo_medicion === 'tiempo' ? normalizarTiempoCap(wod.tiempo_cap) : 0,
          esquema: esquemaConRondas(normalizado.esquema, rondasEfectivasTx),
          puntaje_maximo: wod.puntaje_maximo,
        };

        if (wod.id && existentes.some((c) => c.id === wod.id)) {
          const previo = existentes.find((c) => c.id === wod.id);
          if (previo?.imagen_url && previo.imagen_url !== valores.imagen_url) {
            borrarImagenWodAnterior(previo.imagen_url);
          }
          await Wod.update(valores, { where: { id: wod.id }, transaction: t });
        } else {
          await Wod.create(valores, { transaction: t });
        }
      }
    } else if (campos.rondas !== undefined) {
      // Cambiaron solo las rondas de la competencia: se propagan a los esquemas
      // for_time/amrap existentes para que el cálculo siga cuadrando.
      const existentes = await Wod.findAll({ where: { competencia_id: id }, transaction: t });
      for (const c of existentes) {
        const actualizado = esquemaConRondas(c.esquema as EsquemaWod | null, rondasEfectivasTx);
        if (JSON.stringify(actualizado) !== JSON.stringify(c.esquema)) {
          await Wod.update({ esquema: actualizado }, { where: { id: c.id }, transaction: t });
        }
      }
    }

    return Competencia.findByPk(id, { include: ['wods', 'categorias'], transaction: t });
  });
}

export async function deleteCompetencia(id: number) {
  // Chequeo + borrado en una tx con re-chequeo dentro: un resultado o
  // asignacion creado entre el conteo y el destroy aborta en vez de
  // dejar huérfanos o romper la FK.
  let portada: string | null = null;
  await sequelize.transaction(async (t) => {
    const competencia = await Competencia.findByPk(id, { transaction: t });
    if (!competencia) throw new Error('Competencia no encontrado');

    const [resultados, asignaciones] = await Promise.all([
      Resultado.count({ include: [{ model: Wod, as: 'Wod', where: { competencia_id: id } }], transaction: t }),
      Asignacion.count({ where: { competencia_id: id }, transaction: t }),
    ]);
    if (resultados > 0) {
      throw new Error(`No se puede eliminar: la competencia tiene ${resultados} resultado(s) registrado(s). Finalizala primero.`);
    }
    if (asignaciones > 0) {
      throw new Error(`No se puede eliminar: la competencia tiene ${asignaciones} asignacion(es) activa(s). Elimina las asignaciones primero.`);
    }

    portada = competencia.imagen_url ?? null;
    await competencia.destroy({ transaction: t });
  });
  borrarPortadaCompetenciaAnterior(portada);
}

/**
 * Asigna parejas juez-atleta a una competencia, opcionalmente acotadas a un WOD.
 *
 * Cada par crea un vinculo 1:1 (ese juez evalua a ese atleta), que es como
 * trabajan las estaciones: un instructor por participante. Se pueden enviar
 * muchos pares de una vez (p.ej. 10 jueces con 10 atletas). `wod_id` en
 * null significa "todos los WODs de la competencia". Los duplicados se ignoran.
 */
export async function assignCompetencia(data: {
  competencia_id: number;
  wod_id: number | null;
  pares: Array<{ usuario_id: number; participante_id: number }>;
}) {
  const competencia = await Competencia.findByPk(data.competencia_id);
  if (!competencia) throw new Error('Competencia no encontrado');

  if (data.wod_id != null) {
    const wod = await Wod.findOne({
      where: { id: data.wod_id, competencia_id: data.competencia_id },
    });
    if (!wod) throw new Error('El wod no pertenece a esta competencia');
  }

  if (!data.pares || data.pares.length === 0) {
    throw new Error('Agrega al menos una pareja juez-atleta');
  }

  const scope = data.wod_id ?? null;
  const participanteIds = [...new Set(data.pares.map((p) => p.participante_id))];

  // Un atleta no puede tener dos jueces en el mismo ambito: se borra la
  // asignacion previa de esos atletas en este WOD (o en "todos") y se
  // vuelve a crear con el juez elegido. Asi una nueva asignacion sobrescribe.
  // Todo en una tx: sin `ignoreDuplicates` (tragaba fallos reales como falsos
  // exitos), un fallo a mitad debe revertir el borrado, no dejar 0 filas.
  const filas = data.pares.map((p) => ({
    competencia_id: data.competencia_id,
    wod_id: scope,
    usuario_id: p.usuario_id,
    participante_id: p.participante_id,
  }));

  await sequelize.transaction(async (t) => {
    await Asignacion.destroy({
      where: { competencia_id: data.competencia_id, wod_id: scope, participante_id: participanteIds },
      transaction: t,
    });

    const creadas = await Asignacion.bulkCreate(filas, { transaction: t });

    // La asignacion es la que da acceso: el juez queda miembro del evento
    // (si aun no lo era). Sin esto, un juez creado por un superadmin sin
    // evento activa nunca entraba al WOD (403 en /results/check aunque
    // tuviera asignacion). bulkCreate con ignoreDuplicates respeta roles
    // ya existentes (propietario/admin) sin tocarlos.
    if (competencia.evento_id != null) {
      const juezIds = [...new Set(data.pares.map((p) => p.usuario_id))];
      await EventoUsuario.bulkCreate(
        juezIds.map((usuario_id) => ({ evento_id: competencia.evento_id as number, usuario_id, rol: 'juez' as const })),
        { ignoreDuplicates: true, transaction: t }
      );
    }

    return creadas;
  });

  // Los atletas recien asignados deben aparecer ya en la pantalla en vivo.
  await broadcastLeaderboard(data.competencia_id);

  return {
    message: `${filas.length} asignaciones guardadas`,
    total: filas.length,
  };
}

/** Elimina una asignacion concreta y refresca la clasificacion. */
export async function removeAssignment(asignacionId: number) {
  const asignacion = await Asignacion.findByPk(asignacionId);
  if (!asignacion) throw new Error('Asignacion no encontrada');

  const competenciaId = asignacion.competencia_id;
  await asignacion.destroy();
  await broadcastLeaderboard(competenciaId);
}

export async function getCompetenciaAssignments(competenciaId: number) {
  return Asignacion.findAll({
    where: { competencia_id: competenciaId },
    include: [
      { model: Usuario, as: 'Usuario', attributes: ['id', 'nombre', 'apellidos', 'cedula'] },
      {
        model: Participante,
        as: 'Participante',
        attributes: ['id', 'nombre', 'apellidos', 'cedula', 'box', 'categoria'],
      },
      { model: Wod, as: 'Wod', attributes: ['id', 'orden', 'nombre_ejercicio'] },
    ],
    order: [['id', 'ASC']],
  });
}

/**
 * Competencias que el juez puede evaluar, con SOLO los WODs que tiene asignados.
 * Si en algun vinculo el WOD es NULL, cubre todos los WODs de la competencia.
 */
export async function getCompetenciasByJudge(usuarioId: number) {
  const asignaciones = await Asignacion.findAll({
    where: { usuario_id: usuarioId },
    attributes: ['competencia_id', 'wod_id'],
  });

  if (asignaciones.length === 0) return [];

  // competencia_id -> { todos, wods asignados }
  const porCompetencia = new Map<number, { todos: boolean; wods: Set<number> }>();
  for (const a of asignaciones) {
    const entrada = porCompetencia.get(a.competencia_id) ?? { todos: false, wods: new Set<number>() };
    if (a.wod_id == null) entrada.todos = true;
    else entrada.wods.add(a.wod_id);
    porCompetencia.set(a.competencia_id, entrada);
  }

  const competencias = await Competencia.findAll({
    where: { id: [...porCompetencia.keys()], estado: { [Op.ne]: 'borrador' } },
    include: ['wods'],
    order: [
      ['id', 'DESC'],
      [{ model: Wod, as: 'wods' }, 'orden', 'ASC'],
    ],
  });

  // Se recorta la lista de wods a los asignados (salvo cobertura total).
  return competencias.map((w) => {
    const filtro = porCompetencia.get(w.id)!;
    const json = w.toJSON() as unknown as {
      wods?: Array<{ id: number }>;
      divisiones: unknown;
      rondas?: unknown;
    };
    if (!filtro.todos) {
      json.wods = (json.wods ?? []).filter((c) => filtro.wods.has(c.id));
    }
    json.divisiones = sanearDivisionesSalida(json.divisiones);
    json.rondas = rondasEfectivas(json as { rondas?: unknown; wods?: Array<{ esquema?: { rondas?: unknown } | null }> });
    return json;
  });
}

/** Competencias visibles en la pantalla publica: los que ya no son borrador. */
export async function getPublicCompetencias(eventoId?: number | null) {
  const competencias = await Competencia.findAll({
    where: {
      estado: { [Op.ne]: 'borrador' },
      ...(eventoId ? { evento_id: eventoId } : {}),
    },
    include: ['wods'],
    attributes: [
      'id',
      'nombre',
      'descripcion',
      'estado',
      'tipo_flujo',
      'tipo_participacion',
      'duracion_minutos',
      'rondas',
      'imagen_url',
      'divisiones',
      'evento_id',
    ],
    order: [
      ['id', 'DESC'],
      [{ model: Wod, as: 'wods' }, 'orden', 'ASC'],
    ],
  });
  return competencias.map((w) => {
    const json = w.toJSON() as Record<string, unknown>;
    json.divisiones = sanearDivisionesSalida(json.divisiones);
    json.rondas = rondasEfectivas(json as { rondas?: unknown; wods?: Array<{ esquema?: { rondas?: unknown } | null }> });
    return json;
  });
}
