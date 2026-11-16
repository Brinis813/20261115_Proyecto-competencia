import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { Participante } from './Participante';
import { Wod } from './Wod';
import { Usuario } from './Usuario';
import type { DetalleMedicion } from '../types/medicion';

export class Resultado extends Model {
  declare id: number;
  declare participante_id: number;
  declare wod_id: number | null;
  declare juez_id: number;
  declare valor_bruto: string;
  declare puntos_calculados: number;
  declare abandono: boolean;
  declare capado: boolean;
  declare disqualificado: boolean;
  declare detalle: DetalleMedicion | null;
  declare desempate: number | null;
  declare es_desempate: boolean;
  declare sincronizado: boolean;
  declare timestamp_servidor: Date;
}

Resultado.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    participante_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Participante,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    wod_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Wod,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    juez_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Usuario,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    valor_bruto: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    puntos_calculados: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    abandono: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    capado: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'No termino antes del tope de tiempo: valor_bruto son las reps hechas',
    },
    disqualificado: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Disqualified (DSQ) - descalificado por incumplimiento de reglas',
    },
    detalle: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    desempate: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Criterio de desempate dentro del WOD (menor es mejor)',
    },
    es_desempate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sincronizado: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    timestamp_servidor: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'resultados',
    timestamps: true,
    underscored: true,
    // Espejo documental de los indices reales (db/schema.ts + RAW_MIGRATIONS).
    // La app nunca ejecuta sequelize.sync(), asi que esto no genera DDL:
    // solo evita que ORM y esquema diverjan en silencio.
    indexes: [
      { unique: true, fields: ['participante_id', 'wod_id'] },
      { fields: ['wod_id', 'participante_id'] },
      { fields: ['juez_id'] },
    ],
  },
);

Participante.hasMany(Resultado, { foreignKey: 'participante_id', as: 'resultados' });
Resultado.belongsTo(Participante, { foreignKey: 'participante_id' });

Wod.hasMany(Resultado, { foreignKey: 'wod_id', as: 'resultados' });
Resultado.belongsTo(Wod, { foreignKey: 'wod_id' });

Usuario.hasMany(Resultado, { foreignKey: 'juez_id', as: 'resultados_tomados' });
Resultado.belongsTo(Usuario, { foreignKey: 'juez_id' });
