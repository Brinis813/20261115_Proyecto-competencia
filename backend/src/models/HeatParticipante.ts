import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { Heat } from './Heat';
import { Participante } from './Participante';

/**
 * Atleta dentro de su Heat global, con carril (lane) permanente.
 *
 * Un participante tiene una sola categoría, así que como máximo ocupa una
 * fila aquí: su heat y su carril valen para todos las competencias del evento.
 */
export class HeatParticipante extends Model {
  declare heat_id: number;
  declare participante_id: number;
  /** Carril fijo del atleta dentro del heat (1..capacidad_maxima). */
  declare carril_numero: number;
}

HeatParticipante.init(
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
    participante_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: Participante,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    carril_numero: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'heat_participantes',
    timestamps: true,
    underscored: true,
    indexes: [
      // Un atleta, un heat (su categoría solo tiene una serie por atleta).
      {
        unique: true,
        fields: ['participante_id'],
      },
      // Un carril, un atleta dentro del heat.
      {
        unique: true,
        fields: ['heat_id', 'carril_numero'],
      },
    ],
  }
);

Heat.belongsToMany(Participante, {
  through: HeatParticipante,
  foreignKey: 'heat_id',
  otherKey: 'participante_id',
  as: 'participantes',
});
Participante.belongsToMany(Heat, {
  through: HeatParticipante,
  foreignKey: 'participante_id',
  otherKey: 'heat_id',
  as: 'heats',
});

// Directas para los includes (igual que Asignacion).
HeatParticipante.belongsTo(Heat, { foreignKey: 'heat_id' });
HeatParticipante.belongsTo(Participante, { foreignKey: 'participante_id', as: 'Participante' });
