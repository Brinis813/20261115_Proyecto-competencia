import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * El gimnasio u organizacion que monta eventos.
 *
 * Es la unidad de permisos por encima del evento: un box tiene varias
 * eventos y sus administradores solo pueden tocar esas.
 */
export class Box extends Model {
  declare id: number;
  declare nombre: string;
  declare ciudad: string | null;
  declare readonly created_at: Date;
}

Box.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    nombre: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
    },
    ciudad: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Box',
    tableName: 'boxes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);
