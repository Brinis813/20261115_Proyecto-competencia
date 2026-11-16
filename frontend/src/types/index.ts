export type Rol = 'admin' | 'juez' | 'participante';

export type TipoMedicion =
  'tiempo' | 'repeticiones' | 'peso' | 'distancia' | 'calorías' | 'time_trial_splits';

/**
 * Formato de la prueba: como compite el atleta en esta competencia.
 * Es independiente del `tipo_participacion` de las categorias.
 */
export type TipoParticipacion = 'Individual' | 'Relevos' | 'Duplas' | 'Equipos' | 'Escalado';

export const TIPOS_PARTICIPACION: TipoParticipacion[] = [
  'Individual',
  'Relevos',
  'Duplas',
  'Equipos',
  'Escalado',
];

/* ----------------------- Medicion guiada (scorecards) ----------------------- */

export type Modalidad = 'for_time' | 'amrap' | 'max_load' | 'time_trial_splits';

/** Clave de reps cuando la competencia no define divisiones. */
export const DIVISION_GENERAL = 'General';

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

export interface MovimientoEsquema {
  nombre: string;
  /** Tipo de medición para este movimiento individual. */
  tipo_medicion?: TipoMedicion;
  /** Puntaje asignado a este movimiento. */
  puntaje?: number;
  /** Reps objetivo por division (clave = nombre de division, o DIVISION_GENERAL). */
  reps: Record<string, number>;
  /** Carga prescrita por division, con las mismas claves que `reps`. */
  peso?: Record<string, number>;
  /** Unidad de `peso`. Es del movimiento, no de la division. */
  unidad_peso?: UnidadPeso;
  /** Para tiempo: duración en segundos. */
  duracion_seg?: number;
  /** Para repeticiones: cantidad de repeticiones. */
  repeticiones?: number;
  /** Para peso: número de intentos. */
  intentos?: number;
  /** Para distancia: unidad de medida. */
  unidad_distancia?: UnidadDistancia;
  /** Para distancia: valor de la distancia. */
  distancia?: number;
  /** Para calorías: unidad de energía. */
  unidad_energia?: 'kcal' | 'cal';
  /** Para calorías: cantidad de calorías. */
  calorias?: number;
}

export interface SegmentoEsquema {
  numero: number;
  nombre: string;
  tipo: 'carrera' | 'ejercicio' | 'transicion';
  duracion_estimada_ms: number;
  distancia?: string;
}

export interface EsquemaWod {
  modalidad: Modalidad;
  /**
   * @deprecated Las rondas viven en `Competencia.rondas`. Se conserva por
   * compatibilidad con Competencias antiguos; el backend la sincroniza solo.
   */
  rondas?: number;
  movimientos?: MovimientoEsquema[];
  /**
   * Movimientos independientes por división (clave = etiqueta de categoría).
   * Cuando existe y trae la división del atleta, prevalece sobre `movimientos`:
   * permite distinto ejercicio, medición y cantidades por categoría.
   */
  movimientos_por_division?: Record<string, MovimientoEsquema[]>;
  intentos?: number;
  segmentos?: SegmentoEsquema[];
  /**
   * Meta de distancia a recorrer, en unidades de `unidad_distancia`
   * (solo WODs de distancia). Número único o matriz por división (etiqueta
   * de categoría). Informativa: sin movimientos no activa scorecard.
   */
  distancia_meta?: number | Record<string, number>;
}

export interface SplitRegistro {
  segmento_numero: number;
  segmento_nombre: string;
  tiempo_acumulado_ms: number;
  tiempo_parcial_ms: number;
}

export interface DetalleMedicion {
  modalidad?: Modalidad;
  division?: string;
  movimientos?: Array<{ nombre: string; reps: number }>;
  rondas_completas?: number;
  total_reps?: number;
  finalizado?: boolean;
  split_desempate?: string;
  intentos?: Array<{ peso: number; valido: boolean; barra?: number; discos?: string }>;
  mejor?: number;
  splits?: SplitRegistro[];
  /** Arranque manual del juez (modo offline): tolerancia humana auditable. */
  inicio_manual?: boolean;
  t0_local_ms?: number;
  offset_ms?: number;
}

/* ----------------- Arranque sincronizado de cronómetros ----------------- */

/** Cómo se eligió el t0 del heat. */
export type ModoArranque = 'directo' | 'cuenta_regresiva' | 'manual_juez' | 'programado';

/** Ciclo de vida del heat. */
export type EstadoArranque =
  'armado' | 'cuenta_regresiva' | 'en_curso' | 'pausado' | 'finalizado' | 'cancelado';

/**
 * Snapshot del arranque (evento `competencia:start` + GET /competencias/:id/arranque).
 * Tiempos en epoch ms del SERVIDOR; el cliente los usa con su offset medido.
 */
export interface CompetenciaStartPayload {
  competenciaId: number;
  eventoId: number | null;
  tipoArranque: ModoArranque;
  estado: EstadoArranque;
  /** Instante de arranque. null = modo manual (lo fija cada juez). */
  startTimeServer: number | null;
  /** Reloj del servidor al emitir. */
  serverNow: number;
  /** Instante de la pausa, si está pausado. */
  pausadoEnMs: number | null;
  /** Total acumulado en pausa (ms), auditoría. */
  pausaAcumuladaMs: number;
  duracionMinutos: number | null;
  /** Derivado: duracionMinutos * 60000. null = sin tope. */
  timeCapMs: number | null;
  rondas: number;
  countdownSeg: number | null;
  programadoParaMs: number | null;
  /** Monotónica: se descartan eventos con version vieja. */
  version: number;
}

/** Perfil devuelto por /auth/me y por los endpoints de login. */
export interface Usuario {
  id: number;
  nombre: string;
  apellidos: string;
  cedula: string;
  box: string;
  rol: Rol;
  /** Solo lo tienen las cuentas creadas desde el alta publica. */
  email?: string | null;
  /** Ve y administra todas los eventos. */
  es_superadmin?: boolean;
  /** Box al que pertenece. null en el superadmin, que los ve todos. */
  box_id?: number | null;
  password_cambiado: boolean;
}

/** En que momento estal evento. Lo calcula el backend por fechas. */
export type EstadoEvento = 'en_curso' | 'proxima' | 'pasada';

export interface Box {
  id: number;
  nombre: string;
  ciudad: string | null;
  total_eventos: number;
  total_administradores: number;
}

export interface Administrador {
  id: number;
  nombre: string;
  apellidos: string;
  cedula: string;
  email: string | null;
  box_id: number | null;
  boxDetalle?: { id: number; nombre: string } | null;
  password_cambiado: boolean;
}

export interface Evento {
  id: number;
  nombre: string;
  descripcion: string | null;
  sede: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  /** Creada automaticamente al activar la cuenta, con datos de ejemplo. */
  es_demo: boolean;
  /** Portada del evento (URL de /api/uploads). Ausente = sin imagen. */
  imagen_url?: string | null;
  estado: EstadoEvento;
  /** Criterio global de ganador. Ausente en respuestas antiguas = acumulado. */
  scoring_type?: EventoScoringType | null;
  /** Desempate global. Ausente = estándar (mejores puestos). */
  tiebreak_policy?: EventoTieBreakPolicy | null;
  tiebreak_competencia_id?: number | null;
  /** Papel del usuario en ella: propietario, admin o juez. */
  rol: string | null;
  box_id: number | null;
  box_nombre: string | null;
  total_competencias: number;
  total_atletas: number;
}

/** Criterio global de ganador: acumulado multi-Competencia o independiente por Competencia. */
export type EventoScoringType = 'POINTS_ACCUMULATION' | 'WINNER_PER_COMPETENCIA';

export const EVENTO_SCORING_TYPES: EventoScoringType[] = [
  'POINTS_ACCUMULATION',
  'WINNER_PER_COMPETENCIA',
];

export const ETIQUETA_SCORING: Record<EventoScoringType, string> = {
  POINTS_ACCUMULATION: 'Puntos acumulados',
  WINNER_PER_COMPETENCIA: 'Ganador por competencia',
};

/** Desempate global: cómo se resuelven los empates en el acumulado. */
export type EventoTieBreakPolicy =
  'NONE' | 'BEST_INDIVIDUAL_RANK' | 'DESIGNATED_TIEBREAK_COMPETENCIA' | 'LAST_COMPETENCIA_SCORE';

export const ETIQUETA_TIEBREAK_GLOBAL: Record<EventoTieBreakPolicy, string> = {
  NONE: 'Sin desempate',
  BEST_INDIVIDUAL_RANK: 'Mejores puestos en Competencias',
  DESIGNATED_TIEBREAK_COMPETENCIA: 'Competencia designada',
  LAST_COMPETENCIA_SCORE: 'Última competencia',
};

/** Desempate dentro de la competencia: coincide con lo que el juez puede registrar. */
export type CompetenciaTieBreakPolicy = 'NONE' | 'TIEBREAK_MARK' | 'DESIGNATED_CIRCUIT_SPLIT';

export const ETIQUETA_TIEBREAK_COMPETENCIA: Record<CompetenciaTieBreakPolicy, string> = {
  NONE: 'Sin desempate',
  TIEBREAK_MARK: 'Marca de desempate del juez',
  DESIGNATED_CIRCUIT_SPLIT: 'WOD designado',
};

export interface Juez {
  id: number;
  nombre: string;
  apellidos: string;
  cedula: string;
  box: string;
  rol: 'juez';
}

/**
 * @deprecated Opción B: la categoría ya no lleva métricas. Se conserva para
 * no romper imports antiguos.
 */
export interface ElementoCategoria {
  nombre: string;
  valor: number;
  unidad?: string;
}

/**
 * Opción B: la categoría es SOLO perfil de participación
 * (nivel/división + género + formato). Los pesos, distancias y reps por
 * categoría se definen en la competencia (`Wod.esquema.movimientos[].reps/peso`).
 */
export interface Categoria {
  id: number;
  nombre: string;
  genero: 'Masculino' | 'Femenino' | 'Mixto';
  tipo_participacion: 'Individual' | 'Escalado' | 'Duplas' | 'Equipos' | 'Relevos';
  // Campos legacy: el backend ya no los envía. Se mantienen opcionales para
  // no romper la lectura de respuestas antiguas cacheadas.
  peso?: number;
  tipo_peso?: string | null;
  distancia?: number;
  tipo_distancia?: string | null;
  repeticiones?: number;
  tipo_repeticiones?: string | null;
  elementos_peso?: ElementoCategoria[] | null;
  elementos_distancia?: ElementoCategoria[] | null;
  elementos_repeticiones?: ElementoCategoria[] | null;
  elementos_calorias?: ElementoCategoria[] | null;
  total_participantes?: number;
}

export interface Participante {
  id: number;
  nombre: string;
  apellidos: string;
  cedula: string;
  fecha_nacimiento: string;
  box: string;
  email?: string | null;
  categoria?: string | null;
  categoria_id?: number | null;
}

export interface Wod {
  id: number;
  competencia_id: number;
  orden: number;
  nombre_ejercicio: string;
  tipo_medicion: TipoMedicion;
  /** Unidad de la marca cuando tipo_medicion=distancia. m = metros, km = kilómetros, mi = millas. */
  unidad_distancia?: UnidadDistancia | null;
  /** Foto del WOD (URL de /api/uploads). Ausente = sin imagen. */
  imagen_url?: string | null;
  tiempo_estimado_duracion: number;
  /**
   * Tope OPCIONAL del ejercicio en segundos (0 = sin tope). Solo aplica a
   * tipo_medicion=tiempo. La duracion general vive en `Competencia.duracion_minutos`.
   */
  tiempo_cap: number;
  /** Medicion guiada opcional (For Time / AMRAP / Max Load). */
  esquema?: EsquemaWod | null;
  puntaje_maximo: number;
}

export interface Competencia {
  id: number;
  nombre: string;
  descripcion: string | null;
  metodo_desempate: string | null;
  tipo_flujo: 'en_serie' | 'estaciones_simultaneas';
  tipo_publicacion: 'tiempo_real' | 'al_finalizar_circuito';
  estado: 'borrador' | 'activo' | 'finalizado';
  /** Formato de la prueba: individual, relevos, duplas, equipos o escalado. */
  tipo_participacion: TipoParticipacion;
  /** Duracion / time cap de la competencia completo en minutos. null = sin tope. */
  duracion_minutos: number | null;
  /** Numero de rondas que se repite cada ejercicio de la competencia. */
  rondas?: number | null;
  /** Portada de la competencia (URL de /api/uploads). Ausente = sin imagen. */
  imagen_url?: string | null;
  desempate_nombre: string | null;
  desempate_tipo_medicion: TipoMedicion | null;
  wod_desempate_id?: number | null;
  /** Política de desempate de la competencia. Ausente en respuestas antiguas = estándar. */
  tiebreak_policy?: CompetenciaTieBreakPolicy | null;
  /** Divisiones/categorias de la competencia para las reps por division del esquema. */
  /**
   * Copia derivada de las categorias de la competencia, con la misma etiqueta que lleva
   * el atleta. Es la clave de las reps y el peso del scorecard.
   */
  divisiones?: string[] | null;
  /** Categorias que compiten esta competencia. */
  categorias?: Categoria[];
  wods?: Wod[];
}

export interface Asignacion {
  id: number;
  competencia_id: number;
  /** null = el juez cubre todos los WODs de la competencia para ese atleta. */
  wod_id: number | null;
  usuario_id: number;
  participante_id: number;
  Usuario?: Pick<Juez, 'id' | 'nombre' | 'apellidos' | 'cedula'>;
  Participante?: Pick<Participante, 'id' | 'nombre' | 'apellidos' | 'cedula' | 'box' | 'categoria'>;
  Wod?: Pick<Wod, 'id' | 'orden' | 'nombre_ejercicio'>;
}

/* ----------------- Heats globales por categoría ----------------- */

/** Atleta con su carril fijo dentro del heat. */
export interface HeatParticipanteVista {
  id: number;
  nombre: string;
  apellidos: string;
  cedula: string;
  box: string | null;
  categoria: string | null;
  carril_numero: number;
}

/** Serie estable de la categoría (vale para todos las competencias). */
export interface HeatDetalle {
  id: number;
  numero: number;
  capacidad_maxima: number;
  ocupados: number;
  /** Hora en la competencia seleccionado ('HH:MM'). null = sin programar. */
  hora_inicio: string | null;
  participantes: HeatParticipanteVista[];
}

/** Vista completa de GET /heats. */
export interface VistaHeats {
  categoria: { id: number; nombre: string; genero: string };
  heats: HeatDetalle[];
  sinAsignar: Array<{
    id: number;
    nombre: string;
    apellidos: string;
    cedula: string;
    box: string | null;
    categoria: string | null;
  }>;
}

export interface Resultado {
  id: number;
  participante_id: number;
  wod_id: number | null;
  juez_id: number;
  valor_bruto: string;
  puntos_calculados: number;
  abandono: boolean;
  capado: boolean;
  detalle?: DetalleMedicion | null;
  desempate?: number | null;
  es_desempate: boolean;
  sincronizado: boolean;
  timestamp_servidor: string;
  Wod?: Pick<
    Wod,
    | 'id'
    | 'nombre_ejercicio'
    | 'tipo_medicion'
    | 'unidad_distancia'
    | 'imagen_url'
    | 'orden'
    | 'competencia_id'
  >;
}

/* --------------------------- Clasificacion --------------------------- */

export interface ResultadoWod {
  resultado_id: number;
  wod_id: number;
  orden: number;
  nombre_ejercicio: string;
  tipo_medicion: TipoMedicion;
  valor_bruto: string | null;
  puntos_calculados: number;
  posicion: number | null;
  abandono: boolean;
  capado: boolean;
}

export interface LeaderboardEntry {
  participante_id: number;
  nombre: string;
  apellidos: string;
  cedula: string;
  box: string | null;
  categoria: string | null;
  puesto: number;
  puntos_total: number;
  wods_completados: number;
  resultados: ResultadoWod[];
  /** True si comparte puesto con otro atleta (empate aplicado). */
  comparte_puesto?: boolean;
}

export interface LeaderboardWod {
  id: number;
  orden: number;
  nombre_ejercicio: string;
  tipo_medicion: TipoMedicion;
  unidad_distancia?: UnidadDistancia | null;
  imagen_url?: string | null;
  tiempo_cap?: number;
  esquema?: EsquemaWod | null;
  puntaje_maximo: number;
}

export interface LeaderboardData {
  competencia: {
    id: number;
    nombre: string;
    descripcion: string | null;
    divisiones?: string[] | null;
    tiebreakPolicy?: CompetenciaTieBreakPolicy | null;
  } | null;
  leaderboard: LeaderboardEntry[];
  wods: LeaderboardWod[];
  actualizado: string;
}

/* --------------------------- Vista de admin -------------------------- */

export interface PosicionParticipante {
  competencia_id: number;
  competencia_nombre: string;
  posicion: number | null;
  puntos_total: number;
  total_participantes: number;
}

export interface ResultadoFila {
  resultado_id: number;
  participante_id: number;
  wod_id: number;
  nombre: string;
  apellidos: string;
  cedula: string;
  categoria: string | null;
  valor_bruto: string;
  puntos_calculados: number;
  abandono: boolean;
  capado: boolean;
  timestamp_servidor: string;
}

export interface ResultadosPorCompetencia {
  wods: LeaderboardWod[];
  participantes: ResultadoFila[];
}

/* ------------------------------ Etiquetas ---------------------------- */

export const ETIQUETA_MEDICION: Record<TipoMedicion, string> = {
  tiempo: 'Tiempo',
  repeticiones: 'Repeticiones',
  peso: 'Peso',
  distancia: 'Distancia',
  calorías: 'Calorías',
  time_trial_splits: 'HYROX Splits',
};

export const UNIDAD_MEDICION: Record<TipoMedicion, string> = {
  tiempo: '',
  repeticiones: 'reps',
  peso: 'kg',
  distancia: 'm',
  calorías: 'kcal',
  time_trial_splits: '',
};

/**
 * Unidad con la que se muestra una marca según el WOD. La distancia usa la
 * unidad propia del WOD (m/km/mi); el resto usa la fija de su tipo.
 */
export function unidadDeWod(
  wod:
    { tipo_medicion: TipoMedicion; unidad_distancia?: UnidadDistancia | null } | null | undefined,
): string {
  if (wod?.tipo_medicion === 'distancia') {
    const u = wod.unidad_distancia;
    return u === 'km' || u === 'mi' || u === 'm' ? u : 'm';
  }
  return UNIDAD_MEDICION[wod?.tipo_medicion ?? 'repeticiones'];
}

/**
 * Da formato al valor bruto segun el tipo de medicion del WOD.
 * Un resultado capado (no termino antes del tope) muestra las reps hechas con
 * el prefijo CAP para distinguirlo de un tiempo real.
 */
export function formatearValor(
  valor: string | null,
  tipo: TipoMedicion,
  abandono = false,
  capado = false,
  unidad?: string | null,
): string {
  if (abandono) return 'DNF';
  if (!valor) return '--';
  if (capado) return `CAP · ${valor} reps`;
  const u = unidad ?? UNIDAD_MEDICION[tipo];
  return u ? `${valor} ${u}` : valor;
}
