import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class Participante extends Model {
  declare id: number;
  declare nombre: string;
  declare apellidos: string;
  declare cedula: string;
  declare fecha_nacimiento: Date;
  declare box: string;
  declare email: string | null;
  declare categoria: string | null;
  declare categoria_id: number | null;
  /** Evento a la que pertenece. NULL solo en datos anteriores a los eventos. */
  declare evento_id: number | null;
}

Participante.init(
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
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    apellidos: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    cedula: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    fecha_nacimiento: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    box: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
      unique: true,
    },
    categoria: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'participantes',
    timestamps: true,
    underscored: true,
  },
);
