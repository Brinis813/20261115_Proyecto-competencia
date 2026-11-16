import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { Competencia } from './Competencia';

/**
 * Arranque sincronizado de una competencia (heat).
 *
 * Guarda el historial de arranques: cada "armar" crea una fila y la vigente es
 * la de mayor id. Así un juez que reconecta (o que abre tarde) lee el `t0` del
 * servidor y acopla su cronómetro sin depender del instante del mensaje.
 */
export type ModoArranque = 'directo' | 'cuenta_regresiva' | 'manual_juez' | 'programado';

export const MODOS_ARRANQUE: ModoArranque[] = [
  'directo',
  'cuenta_regresiva',
  'manual_juez',
  'programado',
];

export type EstadoArranque =
  'armado' | 'cuenta_regresiva' | 'en_curso' | 'pausado' | 'finalizado' | 'cancelado';

export const ESTADOS_ARRANQUE: EstadoArranque[] = [
  'armado',
  'cuenta_regresiva',
  'en_curso',
  'pausado',
  'finalizado',
  'cancelado',
];

export class Arranque extends Model {
  declare id: number;
  declare competencia_id: number;
  declare evento_id: number | null;
  declare modo: ModoArranque;
  declare estado: EstadoArranque;
  /** Instante de arranque, epoch ms del SERVIDOR. null = modo manual (lo fija cada juez). */
  declare t0_ms: number | null;
  /** Si está pausado, instante en que se pausó (epoch ms servidor). null = corriendo. */
  declare pausado_en_ms: number | null;
  /** Total acumulado en pausa (ms), para auditoría. Al reanudar se desplaza t0. */
  declare pausa_acumulada_ms: number;
  declare countdown_seg: number | null;
  declare programado_para_ms: number | null;
  /** Snapshot de la competencia al armar: el time cap viaja con el arranque. */
  declare duracion_minutos: number | null;
  declare rondas: number;
  /** Monotónica: el cliente descarta eventos con version vieja. */
  declare version: number;
  declare creado_por: number | null;
}

Arranque.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    competencia_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Competencia,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    evento_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    modo: {
      type: DataTypes.ENUM(...MODOS_ARRANQUE),
      allowNull: false,
    },
    estado: {
      type: DataTypes.ENUM(...ESTADOS_ARRANQUE),
      allowNull: false,
      defaultValue: 'armado',
    },
    t0_ms: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    pausado_en_ms: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    pausa_acumulada_ms: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    countdown_seg: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    programado_para_ms: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    duracion_minutos: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rondas: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    creado_por: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'arranques',
    timestamps: true,
    underscored: true,
  },
);

Competencia.hasMany(Arranque, { foreignKey: 'competencia_id', as: 'arranques' });
Arranque.belongsTo(Competencia, { foreignKey: 'competencia_id' });
