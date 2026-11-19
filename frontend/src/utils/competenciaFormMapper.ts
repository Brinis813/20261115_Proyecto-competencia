import type { EsquemaWod, Modalidad, TipoMedicion, UnidadDistancia } from '../types';
import { DIVISION_GENERAL } from '../types';

/** Cada medición exige una modalidad de scorecard (o ninguna, como distancia). */
export const MODALIDAD_DE: Record<TipoMedicion, Modalidad | null> = {
  tiempo: 'for_time',
  repeticiones: 'amrap',
  peso: 'max_load',
  distancia: null,
  calorías: 'amrap',
  time_trial_splits: 'time_trial_splits',
};

export function uid(prefijo: string): string {
  return `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Al enfocar un numérico se selecciona todo: escribir reemplaza el 0
 *  inicial en vez de concatenar (evita el "010"). */
export function seleccionarAlEnfocar(e: React.FocusEvent<HTMLInputElement>) {
  e.target.select();
}

export interface MovimientoUI {
  clave: string;
  nombre: string;
  /** Tipo de medición para este movimiento (independiente por categoría). */
  tipo_medicion: TipoMedicion;
  /** Puntaje asignado a este movimiento dentro de su categoría. */
  puntaje: number;
  /** Para tiempo: duración en segundos. */
  duracionSeg: number;
  /** Para repeticiones: cantidad de repeticiones. */
  repeticiones: number;
  /** Para peso: número de intentos. */
  intentos: number;
  /** Para distancia: unidad de medida. */
  unidad_distancia: UnidadDistancia;
  /** Para distancia: valor de la distancia. */
  distancia: number;
  /** Para calorías: unidad de energía. */
  unidad_energia: 'kcal' | 'cal';
  /** Para calorías: cantidad de calorías. */
  calorias: number;
  /** Carga prescrita de este movimiento en su categoría (0 = peso corporal). */
  peso: number;
  /** kg/lb = carga; kcal/cal = meta de energía (WOD por calorías). */
  unidad_peso: 'kg' | 'lb' | 'kcal' | 'cal';
}

export interface WodUI {
  clave: string;
  id?: number;
  /** Nombre del WOD (se sugiere un formato: AMRAP, EMOM, For Time, Chipper). */
  nombre: string;
  medicion: TipoMedicion;
  puntaje_maximo: number;
  unidad_distancia: UnidadDistancia;
  /** Minutos en pantalla (el servidor guarda segundos). */
  duracionMin: number;
  capMin: number;
  /** Solo distancia: meta a recorrer por división, en la unidad elegida. Vacío = sin meta. */
  distancias: Record<string, number>;
  /** Solo peso: intentos de carga máxima. */
  intentos: number;
  /** Si el ejercicio lleva carga. Apagado = peso corporal (sin columnas de peso). */
  conPeso: boolean;
  /** Movimientos independientes por categoría (clave = etiqueta de división).
   *  Cada categoría trae su propia lista: distinto ejercicio, medición y
   *  cantidades. Listas libres: pueden tener distinto número de filas. */
  movimientosPorCategoria: Record<string, MovimientoUI[]>;
}

export function movimientoVacio(): MovimientoUI {
  return {
    clave: uid('mov'),
    nombre: '',
    tipo_medicion: 'repeticiones',
    puntaje: 0,
    duracionSeg: 0,
    repeticiones: 0,
    intentos: 3,
    unidad_distancia: 'm',
    distancia: 0,
    unidad_energia: 'kcal',
    calorias: 0,
    peso: 0,
    unidad_peso: 'kg',
  };
}

export function wodVacio(): WodUI {
  return {
    clave: uid('wod'),
    nombre: 'AMRAP',
    medicion: 'repeticiones',
    puntaje_maximo: 100,
    unidad_distancia: 'm',
    duracionMin: 0,
    capMin: 0,
    distancias: {},
    intentos: 3,
    conPeso: false,
    movimientosPorCategoria: { [DIVISION_GENERAL]: [movimientoVacio()] },
  };
}

/** Cantidad objetivo del movimiento según su medición (para `reps` del esquema). */
export function objetivoDeMovimiento(m: MovimientoUI): number {
  if (m.tipo_medicion === 'repeticiones')
    return Math.max(0, Math.round(Number(m.repeticiones) || 0));
  if (m.tipo_medicion === 'calorías') return Math.max(0, Math.round(Number(m.calorias) || 0));
  if (m.tipo_medicion === 'distancia') return Math.max(0, Math.round(Number(m.distancia) || 0));
  if (m.tipo_medicion === 'peso') return Math.max(0, Math.round(Number(m.intentos) || 0));
  if (m.tipo_medicion === 'tiempo') return Math.max(0, Math.round(Number(m.duracionSeg) || 0));
  return 0;
}

export function aEsquema(m: MovimientoUI, division: string, conPeso: boolean) {
  const nombre = m.nombre.trim();
  const entrada: {
    nombre: string;
    tipo_medicion?: TipoMedicion;
    puntaje?: number;
    reps: Record<string, number>;
    peso?: Record<string, number>;
    unidad_peso?: 'kg' | 'lb' | 'kcal' | 'cal';
    duracion_seg?: number;
    repeticiones?: number;
    intentos?: number;
    unidad_distancia?: UnidadDistancia;
    distancia?: number;
    unidad_energia?: 'kcal' | 'cal';
    calorias?: number;
  } = {
    nombre,
    tipo_medicion: m.tipo_medicion,
    puntaje: m.puntaje,
    reps: { [division]: objetivoDeMovimiento(m) },
  };
  // Agregar campos según tipo de medición del movimiento
  if (m.tipo_medicion === 'tiempo') {
    entrada.duracion_seg = m.duracionSeg;
  } else if (m.tipo_medicion === 'repeticiones') {
    entrada.repeticiones = m.repeticiones;
  } else if (m.tipo_medicion === 'peso') {
    entrada.intentos = m.intentos;
  } else if (m.tipo_medicion === 'distancia') {
    entrada.unidad_distancia = m.unidad_distancia;
    entrada.distancia = m.distancia;
  } else if (m.tipo_medicion === 'calorías') {
    entrada.unidad_energia = m.unidad_energia;
    entrada.calorias = m.calorias;
  }
  // El peso es opcional: apagado = peso corporal, sin clave `peso`.
  // Es propio de la categoría: cada división guarda su propia carga.
  if (conPeso && Math.max(0, Number(m.peso) || 0) > 0) {
    entrada.peso = { [division]: Math.max(0, Number(m.peso) || 0) };
    entrada.unidad_peso = m.unidad_peso;
  }
  return entrada;
}

/**
 * Serializa un WOD de la UI al `esquema` canónico que leen el scorecard del
 * juez y el motor de puntuación (`modalidad`, `movimientos[].reps/peso` por
 * división, `unidad_peso` por movimiento). Equivale 1:1 al JSON del diseño:
 * `formato` vive en el nombre, `unidad_peso_global` se aplica como valor por
 * defecto de cada movimiento y `categorias.GENERAL` es la clave `General`.
 * null = captura simple, sin scorecard guiado.
 */
export function esquemaDesdeUI(wod: WodUI, divisiones: string[]): EsquemaWod | null {
  const modalidad = MODALIDAD_DE[wod.medicion];
  if (modalidad === null) {
    // Distancia: la meta es informativa por división y viaja en el esquema
    // sin movimientos, así no activa el scorecard guiado (el juez mide la
    // marca lograda y el ranking ordena de mayor a menor).
    const meta: Record<string, number> = {};
    for (const d of divisiones.length > 0 ? divisiones : [DIVISION_GENERAL]) {
      const n = Number(wod.distancias?.[d]) || 0;
      if (n > 0) meta[d] = n;
    }
    return Object.keys(meta).length > 0 ? { modalidad: 'for_time', distancia_meta: meta } : null;
  }
  if (modalidad === 'max_load') {
    return { modalidad, intentos: Math.min(20, Math.max(1, Math.round(wod.intentos) || 3)) };
  }
  if (modalidad === 'time_trial_splits') {
    return { modalidad, segmentos: [] };
  }
  const claves = divisiones.length > 0 ? divisiones : [DIVISION_GENERAL];
  // Listas independientes por categoría: cada división trae sus propios
  // movimientos (distinto ejercicio, medición y cantidades). Solo viajan las
  // filas con nombre; las vacías se descartan.
  const movimientos_por_division: Record<string, Array<ReturnType<typeof aEsquema>>> = {};
  for (const d of claves) {
    const lista = (wod.movimientosPorCategoria[d] ?? []).filter((m) => m.nombre.trim());
    if (lista.length === 0) continue;
    movimientos_por_division[d] = lista.map((m) => aEsquema(m, d, wod.conPeso));
  }
  const conListas = Object.keys(movimientos_por_division).length > 0;
  if (!conListas) return null;
  // Compatibilidad: `movimientos` (formato anterior compartido) se rellena con
  // la primera división con contenido, para lectores antiguos.
  const primera = claves.find((d) => movimientos_por_division[d]);
  return {
    modalidad,
    movimientos: primera ? movimientos_por_division[primera] : [],
    movimientos_por_division,
  };
}
