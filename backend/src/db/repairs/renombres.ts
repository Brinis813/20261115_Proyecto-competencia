import mysql from 'mysql2/promise';
import { existeTabla, existeColumna } from './helpers';
import { log } from '../../utils/logger';

/**
 * Renombre Evento/Competencia/WOD (2026-09).
 *
 * Antes: competencias(eventos) > wods(pruebas) > circuitos(ejercicios).
 * Ahora: eventos > competencias(pruebas) > wods(ejercicios).
 *
 * Se ejecuta antes de crear tablas para no colisionar con los CREATE nuevos.
 * Idempotente: solo renombra si existe lo viejo y falta lo nuevo; ningún fallo
 * aborta el arranque.
 */
const RENOMBRES_TABLAS: Array<[string, string]> = [
  ['competencia_usuarios', 'evento_usuarios'],
  ['competencias', 'eventos'],
  ['wod_categorias', 'competencia_categorias'],
  ['wods', 'competencias'],
  ['circuitos', 'wods'],
  ['heat_wods', 'heat_horarios'],
];

const RENOMBRES_COLUMNAS: Array<{
  tabla: string;
  vieja: string;
  nueva: string;
  definicion: string;
}> = [
  {
    tabla: 'evento_usuarios',
    vieja: 'competencia_id',
    nueva: 'evento_id',
    definicion: 'INT NOT NULL',
  },
  { tabla: 'categorias', vieja: 'competencia_id', nueva: 'evento_id', definicion: 'INT NULL' },
  { tabla: 'participantes', vieja: 'competencia_id', nueva: 'evento_id', definicion: 'INT NULL' },
  { tabla: 'competencias', vieja: 'competencia_id', nueva: 'evento_id', definicion: 'INT NULL' },
  { tabla: 'heats', vieja: 'competencia_id', nueva: 'evento_id', definicion: 'INT NOT NULL' },
  { tabla: 'arranques', vieja: 'competencia_id', nueva: 'evento_id', definicion: 'INT NULL' },
  { tabla: 'wods', vieja: 'wod_id', nueva: 'competencia_id', definicion: 'INT NOT NULL' },
  { tabla: 'asignaciones', vieja: 'wod_id', nueva: 'competencia_id', definicion: 'INT NOT NULL' },
  { tabla: 'arranques', vieja: 'wod_id', nueva: 'competencia_id', definicion: 'INT NOT NULL' },
  { tabla: 'heat_horarios', vieja: 'wod_id', nueva: 'competencia_id', definicion: 'INT NOT NULL' },
  {
    tabla: 'competencia_categorias',
    vieja: 'wod_id',
    nueva: 'competencia_id',
    definicion: 'INT NOT NULL',
  },
  { tabla: 'asignaciones', vieja: 'circuito_id', nueva: 'wod_id', definicion: 'INT NULL' },
  { tabla: 'resultados', vieja: 'circuito_id', nueva: 'wod_id', definicion: 'INT NULL' },
  { tabla: 'result_history', vieja: 'circuito_id', nueva: 'wod_id', definicion: 'INT NOT NULL' },
  {
    tabla: 'competencias',
    vieja: 'circuito_desempate_id',
    nueva: 'wod_desempate_id',
    definicion: 'INT DEFAULT NULL',
  },
  {
    tabla: 'eventos',
    vieja: 'tiebreak_wod_id',
    nueva: 'tiebreak_competencia_id',
    definicion: 'INT NULL',
  },
];

/** Valores de enum renombrados junto con el resto (incluye variantes intermedias). */
const RENOMBRES_ENUMS: string[] = [
  `UPDATE eventos SET scoring_type = 'WINNER_PER_COMPETENCIA' WHERE scoring_type IN ('WINNER_PER_WOD', 'WINNER_PER_Competencia')`,
  `UPDATE eventos SET tiebreak_policy = 'DESIGNATED_TIEBREAK_COMPETENCIA' WHERE tiebreak_policy IN ('DESIGNATED_TIEBREAK_WOD', 'DESIGNATED_TIEBREAK_Competencia')`,
  `UPDATE eventos SET tiebreak_policy = 'LAST_COMPETENCIA_SCORE' WHERE tiebreak_policy IN ('LAST_WOD_SCORE', 'LAST_Competencia_SCORE')`,
  `ALTER TABLE eventos MODIFY COLUMN scoring_type ENUM('POINTS_ACCUMULATION','WINNER_PER_COMPETENCIA') NOT NULL DEFAULT 'POINTS_ACCUMULATION'`,
  `ALTER TABLE eventos MODIFY COLUMN tiebreak_policy ENUM('NONE','BEST_INDIVIDUAL_RANK','DESIGNATED_TIEBREAK_COMPETENCIA','LAST_COMPETENCIA_SCORE') NOT NULL DEFAULT 'BEST_INDIVIDUAL_RANK'`,
];

export async function renombrarEntidades(conn: mysql.Connection): Promise<void> {
  try {
    for (const [vieja, nueva] of RENOMBRES_TABLAS) {
      try {
        if ((await existeTabla(conn, vieja)) && !(await existeTabla(conn, nueva))) {
          await conn.query(`RENAME TABLE \`${vieja}\` TO \`${nueva}\``);
          log.info(`tabla renombrada: ${vieja} -> ${nueva}`);
        }
      } catch (err) {
        log.warn(`no se pudo renombrar tabla ${vieja}: ${(err as Error).message}`);
      }
    }
    for (const c of RENOMBRES_COLUMNAS) {
      try {
        if (
          (await existeColumna(conn, c.tabla, c.vieja)) &&
          !(await existeColumna(conn, c.tabla, c.nueva))
        ) {
          await conn.query(
            `ALTER TABLE \`${c.tabla}\` CHANGE COLUMN \`${c.vieja}\` \`${c.nueva}\` ${c.definicion}`,
          );
          log.info(`columna renombrada: ${c.tabla}.${c.vieja} -> ${c.nueva}`);
        }
      } catch (err) {
        log.warn(`no se pudo renombrar columna ${c.tabla}.${c.vieja}: ${(err as Error).message}`);
      }
    }
    for (const sql of RENOMBRES_ENUMS) {
      try {
        await conn.query(sql);
      } catch (err: any) {
        log.warn(`migración de enum omitida: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    log.warn(`no se pudo completar el renombre Evento/Competencia/WOD: ${(err as Error).message}`);
  }
}
