import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type GeneroCategoria = 'Masculino' | 'Femenino' | 'Mixto';
export type TipoParticipacionCategoria = 'Individual' | 'Escalado' | 'Duplas' | 'Equipos' | 'Relevos';

/**
 * @deprecated Opción B: la categoría es SOLO perfil de participación
 * (nombre/nivel + género + formato). Los pesos/distancias/reps por categoría
 * viven en la competencia (`wods.esquema.movimientos[].reps/peso`). Se conserva
 * el tipo para no romper imports antiguos.
 */
export interface ElementoCategoria {
  nombre: string;
  valor: number;
  unidad?: string;
}

export class Categoria extends Model {
  declare id: number;
  declare nombre: string;
  declare genero: GeneroCategoria;
  declare tipo_participacion: TipoParticipacionCategoria;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
  /** Evento a la que pertenece. NULL solo en datos anteriores a los eventos. */
  declare evento_id: number | null;
}

Categoria.init(
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
    genero: {
      type: DataTypes.ENUM('Masculino', 'Femenino', 'Mixto'),
      allowNull: false,
    },
    tipo_participacion: {
      type: DataTypes.ENUM('Individual', 'Escalado', 'Duplas', 'Equipos', 'Relevos'),
      allowNull: false,
      defaultValue: 'Individual',
    },
  },
  {
    sequelize,
    tableName: 'categorias',
    timestamps: true,
    underscored: true,
  }
);
