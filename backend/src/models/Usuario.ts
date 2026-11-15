import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class Usuario extends Model {
  declare id: number;
  declare nombre: string;
  declare apellidos: string;
  declare cedula: string;
  declare box: string;
  declare rol: 'admin' | 'juez';
  declare password: string;
  declare password_cambiado: boolean;
  /** Solo lo tienen las cuentas creadas desde el alta publica. */
  declare email: string | null;
  /**
   * Los usuarios que crea un administrador a mano entran verificados: no hay
   * correo que comprobar. Solo el alta publica lo pone en false.
   */
  declare email_verificado: boolean;
  /** Hash sha256 del token; el valor en claro solo viaja en el correo. */
  declare verificacion_token: string | null;
  declare verificacion_expira: Date | null;
  /** Recuperación de contraseña: mismo patrón que verificación (hash + expira). */
  declare reset_token: string | null;
  declare reset_expira: Date | null;
  /** Ve y administra todas los eventos. Es el admin sembrado. */
  declare es_superadmin: boolean;
  /** Box al que pertenece. NULL en el superadmin, que no pertenece a ninguno. */
  declare box_id: number | null;
}

Usuario.init(
  {
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
    box: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
      unique: true,
    },
    email_verificado: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    verificacion_token: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    verificacion_expira: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reset_token: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    reset_expira: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    es_superadmin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    box_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rol: {
      type: DataTypes.ENUM('admin', 'juez'),
      allowNull: false,
      defaultValue: 'juez',
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    password_cambiado: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'usuarios',
    timestamps: true,
    underscored: true,
  }
);
