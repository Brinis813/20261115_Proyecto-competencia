/**
 * Tipos de la medicion guiada (los "scorecards" de CrossFit/Hyrox).
 *
 * Un WOD puede llevar un `esquema` opcional que describe como se mide:
 *  - for_time / amrap: lista de movimientos con reps objetivo por division y
 *    un numero de rondas; el juez cuenta reps y el sistema calcula el resultado.
 *  - max_load: numero de intentos; el juez registra peso y valido/no-rep y se
 *    toma el mayor valido.
 *  - time_trial_splits: N segmentos (HYROX); el juez registra el tiempo de cada
 *    segmento y el sistema calcula tiempos acumulados y posiciones.
 *
 * Si el WOD no tiene esquema, se usa la captura simple de siempre.
 */

export type Modalidad = 'for_time' | 'amrap' | 'max_load' | 'time_trial_splits';

/** Clave usada para las reps cuando la competencia no define divisiones. */
export const DIVISION_GENERAL = 'General';

export interface MovimientoEsquema {
  nombre: string;
  /** Reps objetivo por division (clave = nombre de division, o DIVISION_GENERAL). */
  reps: Record<string, number>;
  /**
   * Carga prescrita por division, con la misma clave que `reps`. Ausente o 0
   * significa que ese movimiento no lleva peso (carrera, burpees, remo...).
   */
  peso?: Record<string, number>;
  /** Unidad de `peso`. Es del movimiento, no de la division. */
  unidad_peso?: UnidadPeso;
}

export type UnidadPeso = 'kg' | 'lb' | 'kcal' | 'cal';

export const UNIDADES_PESO: UnidadPeso[] = ['kg', 'lb', 'kcal', 'cal'];

/** Unidad de la marca de un WOD de distancia. m = metros, km = kilómetros, mi = millas. */
export type UnidadDistancia = 'm' | 'km' | 'mi';

export const UNIDADES_DISTANCIA: UnidadDistancia[] = ['m', 'km', 'mi'];

export const ETIQUETA_UNIDAD_DISTANCIA: Record<UnidadDistancia, string> = {
  m: 'Metros (m)',
  km: 'Kilómetros (km)',
  mi: 'Millas (mi)',
};

export interface SegmentoEsquema {
  numero: number;
  nombre: string;
  tipo: 'carrera' | 'ejercicio' | 'transicion';
  duracion_estimada_ms: number;
  distancia?: string; // Ej. "1 km", "500m"
}

export interface EsquemaWod {
  modalidad: Modalidad;
  /** Rondas del esquema (for_time / amrap). */
  rondas?: number;
  /** Movimientos con sus reps objetivo (for_time / amrap, formato legacy compartido). */
  movimientos?: MovimientoEsquema[];
  /**
   * Movimientos independientes por división (clave = etiqueta de categoría).
   * Cuando existe y trae la división del atleta, prevalece sobre `movimientos`:
   * permite distinto ejercicio, medición y cantidades por categoría.
   */
  movimientos_por_division?: Record<string, MovimientoEsquema[]>;
  /** Numero maximo de intentos (max_load). */
  intentos?: number;
  /** Segmentos del time_trial_splits (HYROX). */
  segmentos?: SegmentoEsquema[];
  /**
   * Meta de distancia a recorrer, en unidades de `unidad_distancia`
   * (solo WODs de distancia). Número único o matriz por división (etiqueta
   * de categoría). Informativa: el juez mide la marca lograda y el ranking
   * ordena de mayor a menor. Sin movimientos no activa scorecard.
   */
  distancia_meta?: number | Record<string, number>;
}

/** Desglose que el juez guarda junto al resultado, para auditar el conteo. */
export interface SplitRegistro {
  segmento_numero: number;
  segmento_nombre: string;
  tiempo_acumulado_ms: number;
  tiempo_parcial_ms: number;
}

export interface DetalleMedicion {
  modalidad?: Modalidad;
  division?: string;
  /** Conteo final por movimiento (for_time / amrap). */
  movimientos?: Array<{ nombre: string; reps: number }>;
  rondas_completas?: number;
  total_reps?: number;
  /** for_time: true si completo todo el trabajo antes del tope. */
  finalizado?: boolean;
  /** Tiempo del tie-break (MM:SS.CS), si el esquema lo captura. */
  split_desempate?: string;
  /** Intentos de carga (max_load). */
  intentos?: Array<{ peso: number; valido: boolean; barra?: number; discos?: string }>;
  /** Mejor peso valido (max_load). */
  mejor?: number;
  /** Splits de time_trial_splits (HYROX). */
  splits?: SplitRegistro[];
}
