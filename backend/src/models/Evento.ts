import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/** En que momento estal evento. Se deriva de las fechas, no se guarda. */
export type EstadoEvento = 'en_curso' | 'proxima' | 'pasada';

/**
 * Criterio global de ganador del evento (scoring policy).
 * - POINTS_ACCUMULATION: se suman los puntos de todos las competencias activos.
 * - WINNER_PER_Competencia: ranking independiente por Competencia, sin total global.
 */
export type ScoringType = 'POINTS_ACCUMULATION' | 'WINNER_PER_Competencia';

export const SCORING_TYPES: ScoringType[] = ['POINTS_ACCUMULATION', 'WINNER_PER_Competencia'];

/**
 * Cómo se resuelven los empates en el puntaje acumulado global.
 * - NONE: mismo puntaje = mismo puesto y mismos puntos, sin más criterios.
 * - BEST_INDIVIDUAL_RANK: más 1.os puestos en competencias (luego 2.os, 3.os...).
 * - DESIGNATED_TIEBREAK_Competencia: mejor puesto en la competencia designada (tiebreak_competencia_id).
 * - LAST_Competencia_SCORE: mejor puesto en la última competencia disputada.
 */
export type EventoTieBreakPolicy =
  'NONE' | 'BEST_INDIVIDUAL_RANK' | 'DESIGNATED_TIEBREAK_Competencia' | 'LAST_Competencia_SCORE';

export const EVENTO_TIEBREAK_POLICIES: EventoTieBreakPolicy[] = [
  'NONE',
  'BEST_INDIVIDUAL_RANK',
  'DESIGNATED_TIEBREAK_Competencia',
  'LAST_Competencia_SCORE',
];

export class Evento extends Model {
  declare id: number;
  declare nombre: string;
  declare descripcion: string | null;
  declare sede: string | null;
  declare fecha_inicio: string;
  declare fecha_fin: string;
  declare propietario_id: number | null;
  /** Box que la organiza. Define quien puede administrarla. */
  declare box_id: number | null;
  /** Criterio para determinar al ganador global. Default: acumulación. */
  declare scoring_type: ScoringType;
  /** Cómo se resuelven los empates en el acumulado global. Default: estándar. */
  declare tiebreak_policy: EventoTieBreakPolicy;
  /** Competencia designada como desempate (solo si policy = DESIGNATED_TIEBREAK_Competencia). */
  declare tiebreak_competencia_id: number | null;
  /** Creada automaticamente al verificar el correo, con datos de ejemplo. */
  declare es_demo: boolean;
  /** Portada del evento (URL servida por /api/uploads). null = sin imagen. */
  declare imagen_url: string | null;
  declare readonly created_at: Date;
}

Evento.init(
  {
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
    sede: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    // DATEONLY: el evento empieza y acaba un dia, no a una hora. Guardar
    // hora aqui solo traeria problemas de zona horaria al comparar con "hoy".
    fecha_inicio: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    fecha_fin: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    propietario_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    box_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    scoring_type: {
      type: DataTypes.ENUM('POINTS_ACCUMULATION', 'WINNER_PER_Competencia'),
      allowNull: false,
      defaultValue: 'POINTS_ACCUMULATION',
    },
    tiebreak_policy: {
      type: DataTypes.ENUM(
        'NONE',
        'BEST_INDIVIDUAL_RANK',
        'DESIGNATED_TIEBREAK_Competencia',
        'LAST_Competencia_SCORE',
      ),
      allowNull: false,
      defaultValue: 'BEST_INDIVIDUAL_RANK',
    },
    tiebreak_competencia_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    es_demo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    imagen_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Portada del evento, ej. /api/uploads/eventos/3_1729000000000.jpg',
    },
  },
  {
    sequelize,
    modelName: 'Evento',
    tableName: 'eventos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

/**
 * Estado a partir de las fechas, comparando por dia. Se calcula al vuelo para
 * que no haga falta ningun proceso que vaya cambiando estados guardados.
 */
export function estadoDeEvento(
  fechaInicio: string,
  fechaFin: string,
  hoy = new Date(),
): EstadoEvento {
  const dia = hoy.toISOString().slice(0, 10);
  if (dia < fechaInicio) return 'proxima';
  if (dia > fechaFin) return 'pasada';
  return 'en_curso';
}
