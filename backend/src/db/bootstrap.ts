import mysql from 'mysql2/promise';
import { env } from '../config/env';
import { SCHEMA_STATEMENTS, MIGRATIONS, RAW_MIGRATIONS } from './schema';
import { assertSafeBootstrap } from './guard';
import { log } from '../utils/logger';
import { renombrarEntidades } from './repairs/renombres';
import { autoPopulateCategories, eliminarCategoriasDuplicadas, sanearDivisionesCompetencias, sanearEsquemasCompetencias } from './repairs/categorias';
import { adoptarDatosSinEvento, poblarBoxes } from './repairs/evento';
import { migrarPruebasLegacy } from './repairs/legacy';
import { repararAsignaciones, repararMembresiasJueces } from './repairs/asignaciones';

/**
 * Orquestador del arranque de la base de datos.
 *
 * Crea la base si no existe, aplica esquema + migraciones y encadena las
 * reparaciones idempotentes (una por archivo en `db/repairs/`). Las semillas
 * viven en `repairs/superadmin.ts` y `repairs/demo.ts` y se invocan desde
 * `index.ts`, no aqui.
 *
 * Nada de lo que corre aqui aborta el arranque por un fallo puntual: cada
 * paso registra y sigue (ver cada modulo).
 */
export async function ensureDatabase(): Promise<void> {
  // En prod, SEED_DEMO=true revienta aquí antes de tocar nada.
  assertSafeBootstrap();
  const baseConfig = {
    host: env.DB_HOST,
    port: parseInt(env.DB_PORT, 10),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    multipleStatements: false,
  };

  // 1. Conexion sin base de datos seleccionada para poder crearla.
  const rootConn = await mysql.createConnection(baseConfig);
  try {
    await rootConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await rootConn.end();
  }

  // 2. Conexion a la base de datos para aplicar esquema y migraciones.
  const conn = await mysql.createConnection({ ...baseConfig, database: env.DB_NAME });
  try {
    // 0. Renombre de entidades: antes de crear nada, para no colisionar.
    await renombrarEntidades(conn);

    for (const statement of SCHEMA_STATEMENTS) {
      await conn.query(statement);
    }

    for (const migration of MIGRATIONS) {
      let existe = false;
      try {
        const [rows] = await conn.query<any[]>(
          `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
          [env.DB_NAME, migration.table, migration.column]
        );
        existe = (rows[0]?.total ?? 0) > 0;
      } catch (err) {
        log.warn(`no se pudo comprobar ${migration.table}.${migration.column}: ${(err as Error).message}`);
        continue;
      }
      if (!existe) {
        try {
          await conn.query(migration.definition);
          log.info(`migracion aplicada: ${migration.table}.${migration.column}`);
        } catch (err: any) {
          // Tablas legacy sin la columna base del AFTER (ej. wods sin
          // tiempo_estimado_duracion): se reintenta sin posicion.
          if (err?.code === 'ER_BAD_FIELD_ERROR' && /\sAFTER\s/i.test(migration.definition)) {
            try {
              const sinAfter = migration.definition.replace(/\s+AFTER\s+`?\w+`?\s*$/i, '');
              await conn.query(sinAfter);
              log.info(`migracion aplicada (sin AFTER): ${migration.table}.${migration.column}`);
              continue;
            } catch (err2: any) {
              log.warn(`migracion omitida ${migration.table}.${migration.column}: ${(err2 as Error).message}`);
              continue;
            }
          }
          // Una migracion que falla no puede tumbar el arranque: se registra
          // y se sigue con las demas (ej. box_id en eventos es critica y
          // llegaria igual aunque falle tiempo_cap en wods legacy).
          log.warn(`migracion omitida ${migration.table}.${migration.column}: ${(err as Error).message}`);
        }
      }
    }

    // Migraciones idempotentes (enums, indices, saneado). Se toleran los errores
    // de "ya existe / no existe" porque son el estado esperado en instalaciones
    // que ya estan al dia; cualquier otro fallo se registra sin abortar el arranque.
    for (const statement of RAW_MIGRATIONS) {
      try {
        await conn.query(statement);
      } catch (err: any) {
        const codigo = err?.code ?? '';
        const esperado = [
          'ER_DUP_KEYNAME',
          'ER_CANT_DROP_FIELD_OR_KEY',
          'ER_DUP_KEY',
          'ER_FK_DUP_NAME',
          'ER_DUP_FIELDNAME',
          // Tablas/columnas legacy que ya no existen: nada que migrar.
          'ER_BAD_FIELD_ERROR',
          'ER_NO_SUCH_TABLE',
        ].includes(codigo);
        if (!esperado) {
          log.warn(`migracion idempotente omitida (${codigo || 'sin codigo'}): ${statement.slice(0, 60)}...`);
        }
      }
    }

    // 3. Poblar categorias automaticamente a partir de los datos existentes y sincronizar categoria_id.
    await autoPopulateCategories(conn);

    // 3.a Fusionar duplicados históricos (misma etiqueta, distinto id) que la
    // UI mostraba repetidos. Reasigna FKs antes de borrar; idempotente.
    await eliminarCategoriasDuplicadas(conn);

    // 3.b Reparar `competencias.divisiones` corruptas: versiones antiguas guardaron
    // objetos de categoría en vez de etiquetas, y eso reventaba al frontend.
    await sanearDivisionesCompetencias(conn);

    // 3.c Podar divisiones obsoletas de los esquemas guardados (categorías
    // eliminadas/renombradas) que bloqueaban el guardado con 400.
    await sanearEsquemasCompetencias(conn);

    // 4. Meter en un evento todo lo que se creo antes de que existieran.
    await adoptarDatosSinEvento(conn);

    // 5. Crear los boxes a partir del texto libre que ya habia y enlazarlos.
    await poblarBoxes(conn);

    // 6. Mover pruebas/ejercicios legacy (wods -> competencias, circuitos ->
    //    wods) cuando el renombre de tablas no pudo correr porque los
    //    destinos ya existian. Sin esto, /competencias/public revienta con
    //    "Unknown column 'tipo_flujo'" y la pagina del evento sale vacia.
    await migrarPruebasLegacy(conn);

    // 6.b Clave unica y FKs de asignaciones del esquema actual.
    await repararAsignaciones(conn);

    // 6.c Jueces asignados sin membresia al evento.
    await repararMembresiasJueces(conn);
  } finally {
    await conn.end();
  }

  log.info(`base de datos lista: ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`);
}
