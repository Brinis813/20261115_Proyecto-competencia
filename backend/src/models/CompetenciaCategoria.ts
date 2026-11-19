import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Qué categorías compiten en cada competencia.
 *
 * Es la fuente de verdad de las divisiones de la prueba:
 * `competencias.divisiones` es una copia derivada de estas filas (etiquetas),
 * escrita por `competenciaService`, para que el agrupado de la clasificación
 * y las reps del scorecard sigan funcionando sin cambios.
 */
export class CompetenciaCategoria extends Model {
  declare competencia_id: number;
  declare categoria_id: number;
}

CompetenciaCategoria.init(
  {
    competencia_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
  },
  {
    sequelize,
    modelName: 'CompetenciaCategoria',
    tableName: 'competencia_categorias',
    timestamps: false,
  },
);
