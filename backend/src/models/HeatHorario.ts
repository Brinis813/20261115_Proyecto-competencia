import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { Heat } from './Heat';
import { Competencia } from './Competencia';

/**
 * Horario de un Heat global en una competencia concreta.
 *
 * Los heats son estables por categoría, pero cada prueba tiene su cronograma:
 * aquí vive la hora de inicio de cada serie dentro de cada competencia.
 */
export class HeatHorario extends Model {
  declare heat_id: number;
  declare competencia_id: number;
  /** Hora de inicio de la serie en esa competencia ('HH:MM:SS'). */
  declare hora_inicio: string;
}

HeatHorario.init(
  {
    heat_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: Heat,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    competencia_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: Competencia,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    hora_inicio: {
      type: DataTypes.TIME,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'heat_horarios',
    timestamps: true,
    underscored: true,
  }
);

Heat.belongsToMany(Competencia, {
  through: HeatHorario,
  foreignKey: 'heat_id',
  otherKey: 'competencia_id',
  as: 'competencias',
});
Competencia.belongsToMany(Heat, {
  through: HeatHorario,
  foreignKey: 'competencia_id',
  otherKey: 'heat_id',
  as: 'heats',
});
