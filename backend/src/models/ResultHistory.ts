import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Historial inmutable de mediciones (área 3).
 * Cada guardado/reset de un resultado deja una fila; jamás se actualiza ni
 * borra. Es la pista de auditoría del scoring.
 */
export class ResultHistory extends Model {
  declare id: number;
  declare resultado_id: number | null;
  declare participante_id: number;
  declare competencia_id: number;
  declare juez_id: number;
  declare valor_bruto: string | null;
  declare accion: 'creado' | 'reseteado';
  declare readonly created_at: Date;
}

ResultHistory.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    resultado_id: { type: DataTypes.INTEGER, allowNull: true },
    participante_id: { type: DataTypes.INTEGER, allowNull: false },
    competencia_id: { type: DataTypes.INTEGER, allowNull: false },
    juez_id: { type: DataTypes.INTEGER, allowNull: false },
    valor_bruto: { type: DataTypes.STRING(50), allowNull: true },
    accion: { type: DataTypes.ENUM('creado', 'reseteado'), allowNull: false },
  },
  { sequelize, tableName: 'result_history', timestamps: true, createdAt: 'created_at', updatedAt: false }
);
