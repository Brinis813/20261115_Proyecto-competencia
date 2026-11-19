import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { Categoria } from './Categoria';

/**
 * Heat (serie) GLOBAL de una categoría.
 *
 * La serie es estable para todo el evento: un atleta en el Heat 1 de su
 * categoría compite en ese mismo heat (y carril) en todos las competencias. Solo el
 * horario cambia por Competencia (ver HeatHorario).
 */
export class Heat extends Model {
  declare id: number;
  declare evento_id: number;
  declare categoria_id: number;
  declare numero: number;
  /** Capacidad máxima (carriles) fijada al armar las series. */
  declare capacidad_maxima: number;
}

Heat.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    evento_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Categoria,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    numero: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'N° de serie dentro de la categoría (1, 2, 3...)',
    },
    capacidad_maxima: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Carriles disponibles en la pista para esta serie',
    },
  },
  {
    sequelize,
    tableName: 'heats',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['categoria_id', 'numero'],
      },
    ],
  },
);

Categoria.hasMany(Heat, { foreignKey: 'categoria_id', as: 'heats' });
Heat.belongsTo(Categoria, { foreignKey: 'categoria_id' });
