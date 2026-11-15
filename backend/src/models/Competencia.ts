import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Como se compite esta competencia. Es independiente del tipo de participacion de las
 * categorias: aqui describe el formato de la prueba en si.
 */
export type TipoParticipacion = 'Individual' | 'Relevos' | 'Duplas' | 'Equipos' | 'Escalado';

export const TIPOS_PARTICIPACION: TipoParticipacion[] = [
  'Individual',
  'Relevos',
  'Duplas',
  'Equipos',
  'Escalado',
];

/**
 * Cómo se resuelven los empates dentro de la competencia. Coincide con lo que la app
 * realmente captura:
 * - NONE: misma marca = mismo puesto y mismos puntos, sin más criterios.
 * - TIEBREAK_MARK: usa la marca de desempate registrada por el juez en el
 *   resultado (menor es mejor: parcial más rápido, intento más temprano...).
 * - DESIGNATED_CIRCUIT_SPLIT: el total se ordena por la competencia designada
 *   (`wod_desempate_id`) y luego por mejor posición individual.
 */
export type CompetenciaTieBreakPolicy =
  | 'NONE'
  | 'TIEBREAK_MARK'
  | 'DESIGNATED_CIRCUIT_SPLIT';

export const COMPETENCIA_TIEBREAK_POLICIES: CompetenciaTieBreakPolicy[] = [
  'NONE',
  'TIEBREAK_MARK',
  'DESIGNATED_CIRCUIT_SPLIT',
];

export class Competencia extends Model {
  declare id: number;
  declare nombre: string;
  declare descripcion: string | null;
  declare metodo_desempate: string | null;
  declare tipo_flujo: 'en_serie' | 'estaciones_simultaneas';
  declare tipo_publicacion: 'tiempo_real' | 'al_finalizar_circuito';
  declare desempate_nombre: string | null;
  declare desempate_tipo_medicion: 'tiempo' | 'repeticiones' | 'peso' | 'distancia' | 'calorías' | null;
  declare wod_desempate_id: number | null;
  /** Política de desempate de la competencia. Default: estándar (competencia designada). */
  declare tiebreak_policy: CompetenciaTieBreakPolicy;
  declare estado: 'borrador' | 'activo' | 'finalizado';
  declare tipo_participacion: TipoParticipacion;
  /** Duracion / time cap de la competencia completa en minutos. null = sin tope. */
  declare duracion_minutos: number | null;
  /** Numero de rondas que se repite cada ejercicio de la competencia (1-100). */
  declare rondas: number;
  /** Portada de la competencia (URL de /api/uploads). null = sin imagen. */
  declare imagen_url: string | null;
  declare divisiones: string[] | null;
  /** Evento al que pertenece. NULL solo en datos anteriores a los eventos. */
  declare evento_id: number | null;
}

Competencia.init(
  {
    evento_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    nombre: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metodo_desempate: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tipo_flujo: {
      type: DataTypes.ENUM('en_serie', 'estaciones_simultaneas'),
      allowNull: false,
      defaultValue: 'en_serie',
    },
    tipo_publicacion: {
      type: DataTypes.ENUM('tiempo_real', 'al_finalizar_circuito'),
      allowNull: false,
      defaultValue: 'tiempo_real',
    },
    desempate_nombre: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    desempate_tipo_medicion: {
      type: DataTypes.ENUM('tiempo', 'repeticiones', 'peso', 'distancia'),
      allowNull: true,
    },
    wod_desempate_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    tiebreak_policy: {
      type: DataTypes.ENUM('NONE', 'TIEBREAK_MARK', 'DESIGNATED_CIRCUIT_SPLIT'),
      allowNull: false,
      defaultValue: 'DESIGNATED_CIRCUIT_SPLIT',
    },
    estado: {
      type: DataTypes.ENUM('borrador', 'activo', 'finalizado'),
      allowNull: false,
      defaultValue: 'activo',
    },
    tipo_participacion: {
      type: DataTypes.ENUM(...TIPOS_PARTICIPACION),
      allowNull: false,
      defaultValue: 'Individual',
    },
    duracion_minutos: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Duracion / time cap de la competencia en minutos (NULL = sin tope)',
    },
    rondas: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Numero de rondas que se repite cada ejercicio de la competencia',
    },
    imagen_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    divisiones: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'competencias',
    timestamps: true,
    underscored: true,
  }
);
