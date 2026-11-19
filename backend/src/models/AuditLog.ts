import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Auditoría inmutable de acciones sensibles (área 3).
 * Solo INSERT + SELECT: no hay update/delete en ningún servicio.
 */
export class AuditLog extends Model {
  declare id: number;
  declare accion: string;
  declare entidad: string | null;
  declare entidad_id: number | null;
  declare usuario_id: number | null;
  declare evento_id: number | null;
  declare detalle: Record<string, unknown> | null;
  declare readonly created_at: Date;
}

AuditLog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    accion: { type: DataTypes.STRING(80), allowNull: false },
    entidad: { type: DataTypes.STRING(60), allowNull: true },
    entidad_id: { type: DataTypes.INTEGER, allowNull: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: true },
    evento_id: { type: DataTypes.INTEGER, allowNull: true },
    detalle: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    tableName: 'audit_log',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  },
);
