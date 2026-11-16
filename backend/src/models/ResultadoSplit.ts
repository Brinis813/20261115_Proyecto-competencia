import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Modelo ResultadoSplit
 *
 * Representa los splits (segmentos de tiempo) en competiciones de múltiples etapas
 * como HYROX. Cada resultado puede tener N splits, cada uno con su tiempo parcial
 * y acumulado.
 *
 * Ejemplo HYROX (8 segmentos):
 * - Sprint 1: 05:20.00 (acumulado)
 * - Estación A: 02:05.00 (parcial) → 07:25.00 (acumulado)
 * - Sprint 2: 05:18.50 (parcial) → 12:43.50 (acumulado)
 * - ... (más segmentos)
 *
 * Uso:
 * - Persistencia: guardar splits al recibir resultado con modalidad 'time_trial_splits'
 * - Recuperación: obtener splits para mostrar en leaderboard detallado
 * - Scoring: comparar segmentos para desempate (si tiempos totales son iguales)
 */
export class ResultadoSplit extends Model {
  declare id: number;
  declare resultado_id: number;
  declare segmento_numero: number;
  declare segmento_nombre: string;
  declare tipo_segmento: 'carrera' | 'ejercicio' | 'transicion';
  declare tiempo_acumulado_ms: number;
  declare tiempo_parcial_ms: number;
  declare posicion_en_segmento: number | null;
  declare created_at: Date;
}

ResultadoSplit.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    resultado_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Referencia a resultados.id',
      references: {
        model: 'resultados',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    segmento_numero: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Número secuencial (1, 2, 3...)',
    },
    segmento_nombre: {
      type: DataTypes.STRING(150),
      allowNull: false,
      comment: 'Nombre descriptivo (Sprint 1, Estación A, etc)',
    },
    tipo_segmento: {
      type: DataTypes.ENUM('carrera', 'ejercicio', 'transicion'),
      allowNull: false,
      defaultValue: 'carrera',
      comment: 'Tipo de segmento',
    },
    tiempo_acumulado_ms: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Tiempo total desde inicio (milisegundos)',
    },
    tiempo_parcial_ms: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Tiempo de este segmento solo (milisegundos)',
    },
    posicion_en_segmento: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Ranking en este segmento (opcional)',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'ResultadoSplit',
    tableName: 'resultado_splits',
    timestamps: false,
    indexes: [
      {
        fields: ['resultado_id'],
        name: 'idx_splits_resultado',
      },
      {
        fields: ['resultado_id', 'segmento_numero'],
        name: 'idx_splits_segmento',
      },
    ],
  },
);

export default ResultadoSplit;
