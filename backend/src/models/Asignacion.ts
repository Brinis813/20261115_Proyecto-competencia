import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { Competencia } from './Competencia';
import { Usuario } from './Usuario';
import { Participante } from './Participante';
import { Wod } from './Wod';

export class Asignacion extends Model {
  declare id: number;
  declare competencia_id: number;
  declare wod_id: number | null;
  declare usuario_id: number;
  declare participante_id: number;
}

Asignacion.init(
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
    // NULL = el juez cubre todos los WODs de la competencia para ese atleta.
    wod_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Wod,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Usuario,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    participante_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Participante,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
  },
  {
    sequelize,
    tableName: 'asignaciones',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['competencia_id', 'participante_id', 'wod_id'],
      },
    ],
  },
);

// Direct associations for Asignacion -> Usuario/Participante/Competencia/Wod (needed for includes)
Asignacion.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'Usuario' });
Asignacion.belongsTo(Participante, { foreignKey: 'participante_id', as: 'Participante' });
Asignacion.belongsTo(Competencia, { foreignKey: 'competencia_id', as: 'Competencia' });
Asignacion.belongsTo(Wod, { foreignKey: 'wod_id', as: 'Wod' });

Competencia.belongsToMany(Usuario, {
  through: Asignacion,
  foreignKey: 'competencia_id',
  as: 'jueces',
});
Usuario.belongsToMany(Competencia, {
  through: Asignacion,
  foreignKey: 'usuario_id',
  as: 'competencias',
});
Competencia.belongsToMany(Participante, {
  through: Asignacion,
  foreignKey: 'competencia_id',
  as: 'participantes',
});
Participante.belongsToMany(Competencia, {
  through: Asignacion,
  foreignKey: 'participante_id',
  as: 'competencias',
});
