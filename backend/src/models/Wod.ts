import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { Competencia } from './Competencia';
import type { EsquemaWod } from '../types/medicion';

export class Wod extends Model {
  declare id: number;
  declare competencia_id: number;
  declare orden: number;
  declare nombre_ejercicio: string;
  declare tipo_medicion: 'tiempo' | 'repeticiones' | 'peso' | 'distancia' | 'calorías';
  /** Unidad de la marca cuando tipo_medicion=distancia. m = metros, km = kilómetros, mi = millas. */
  declare unidad_distancia: 'm' | 'km' | 'mi';
  /** Foto del WOD (URL de /api/uploads). null = sin imagen. */
  declare imagen_url: string | null;
  declare tiempo_estimado_duracion: number;
  declare tiempo_cap: number;
  declare esquema: EsquemaWod | null;
  declare puntaje_maximo: number;
}

Wod.init(
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
    orden: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    nombre_ejercicio: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    tipo_medicion: {
      type: DataTypes.ENUM('tiempo', 'repeticiones', 'peso', 'distancia', 'calorías'),
      allowNull: false,
    },
    unidad_distancia: {
      type: DataTypes.ENUM('m', 'km', 'mi'),
      allowNull: false,
      defaultValue: 'm',
    },
    imagen_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
    },
    tiempo_estimado_duracion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Duracion estimada en segundos',
    },
    tiempo_cap: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Tope de tiempo en segundos (0 = sin tope). Solo aplica a tipo_medicion=tiempo',
    },
    esquema: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    puntaje_maximo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
    },
  },
  {
    sequelize,
    tableName: 'wods',
    timestamps: true,
    underscored: true,
  }
);

Competencia.hasMany(Wod, { foreignKey: 'competencia_id', as: 'wods' });
Wod.belongsTo(Competencia, { foreignKey: 'competencia_id' });
