import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type RolEnEvento = 'propietario' | 'admin' | 'juez';

/**
 * Quien entra a cada evento y con que papel.
 *
 * Hoy cada usuario que se da de alta tiene un solo evento, pero el
 * modelo ya admite varios y varios administradores por evento sin tocar
 * el esquema otra vez.
 */
export class EventoUsuario extends Model {
  declare evento_id: number;
  declare usuario_id: number;
  declare rol: RolEnEvento;
}

EventoUsuario.init(
  {
    evento_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    rol: {
      type: DataTypes.ENUM('propietario', 'admin', 'juez'),
      allowNull: false,
      defaultValue: 'juez',
    },
  },
  {
    sequelize,
    modelName: 'EventoUsuario',
    tableName: 'evento_usuarios',
    timestamps: false,
  }
);
