jest.mock('mysql2/promise', () => ({ createConnection: jest.fn() }));

jest.mock('../config/env', () => ({
  env: {
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_USER: 'root',
    DB_PASSWORD: 'secret',
    DB_NAME: 'testdb',
  },
}));

jest.mock('../db/schema', () => ({
  SCHEMA_STATEMENTS: ['CREATE TABLE competencias (id INT)', 'CREATE TABLE wods (id INT)'],
  MIGRATIONS: [
    {
      table: 'wods',
      column: 'tiempo_cap',
      definition: 'ALTER TABLE wods ADD COLUMN tiempo_cap INT AFTER puntaje_maximo',
    },
  ],
  RAW_MIGRATIONS: [
    'ALTER TABLE eventos ADD INDEX idx_uno (nombre)',
    'ALTER TABLE boxes ADD INDEX idx_dos (slug)',
  ],
}));

jest.mock('../db/guard', () => ({ assertSafeBootstrap: jest.fn() }));
jest.mock('../utils/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../db/repairs/renombres', () => ({ renombrarEntidades: jest.fn() }));
jest.mock('../db/repairs/categorias', () => ({
  autoPopulateCategories: jest.fn(),
  eliminarCategoriasDuplicadas: jest.fn(),
  sanearDivisionesCompetencias: jest.fn(),
  sanearEsquemasCompetencias: jest.fn(),
}));
jest.mock('../db/repairs/evento', () => ({
  adoptarDatosSinEvento: jest.fn(),
  poblarBoxes: jest.fn(),
}));
jest.mock('../db/repairs/legacy', () => ({ migrarPruebasLegacy: jest.fn() }));
jest.mock('../db/repairs/asignaciones', () => ({
  repararAsignaciones: jest.fn(),
  repararMembresiasJueces: jest.fn(),
}));

import mysql from 'mysql2/promise';
import { ensureDatabase } from '../db/bootstrap';
import { assertSafeBootstrap } from '../db/guard';
import { log } from '../utils/logger';
import { renombrarEntidades } from '../db/repairs/renombres';
import {
  autoPopulateCategories,
  eliminarCategoriasDuplicadas,
  sanearDivisionesCompetencias,
  sanearEsquemasCompetencias,
} from '../db/repairs/categorias';
import { adoptarDatosSinEvento, poblarBoxes } from '../db/repairs/evento';
import { migrarPruebasLegacy } from '../db/repairs/legacy';
import { repararAsignaciones, repararMembresiasJueces } from '../db/repairs/asignaciones';

const mockCreateConnection = mysql.createConnection as jest.Mock;
const queryRoot = jest.fn();
const endRoot = jest.fn();
const queryMain = jest.fn();
const endMain = jest.fn();

/** Prepara la conexión raíz y la conexión a la base de datos. */
function prepararConexiones() {
  queryRoot.mockResolvedValue([]);
  queryMain.mockResolvedValue([]);
  mockCreateConnection.mockImplementation((config: any) =>
    config?.database ? { query: queryMain, end: endMain } : { query: queryRoot, end: endRoot },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  prepararConexiones();
});

describe('ensureDatabase — arranque normal', () => {
  it('comprueba la guardia, crea la base y aplica el esquema', async () => {
    await ensureDatabase();

    expect(assertSafeBootstrap).toHaveBeenCalledTimes(1);
    expect(mockCreateConnection).toHaveBeenNthCalledWith(1, {
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'secret',
      multipleStatements: false,
    });
    expect(mockCreateConnection).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ database: 'testdb' }),
    );
    expect(queryRoot).toHaveBeenCalledWith(
      expect.stringContaining('CREATE DATABASE IF NOT EXISTS `testdb`'),
    );
    expect(endRoot).toHaveBeenCalledTimes(1);

    // El esquema se aplica en orden, después del renombre de entidades.
    expect(renombrarEntidades).toHaveBeenCalledTimes(1);
    const orden = queryMain.mock.calls.map((c) => String(c[0]));
    expect(orden[0]).toContain('CREATE TABLE competencias');
    expect(orden[1]).toContain('CREATE TABLE wods');
    // El esquema corre antes de comprobar las migraciones de columna.
    expect(orden.findIndex((sql) => sql.includes('CREATE TABLE competencias'))).toBeLessThan(
      orden.findIndex((sql) => sql.includes('information_schema.COLUMNS')),
    );
  });

  it('encadena todas las reparaciones idempotentes con la misma conexión', async () => {
    await ensureDatabase();

    expect(renombrarEntidades).toHaveBeenCalledWith(expect.objectContaining({ query: queryMain }));
    expect(autoPopulateCategories).toHaveBeenCalledWith(
      expect.objectContaining({ query: queryMain }),
    );
    expect(eliminarCategoriasDuplicadas).toHaveBeenCalledWith(expect.anything());
    expect(sanearDivisionesCompetencias).toHaveBeenCalledWith(expect.anything());
    expect(sanearEsquemasCompetencias).toHaveBeenCalledWith(expect.anything());
    expect(adoptarDatosSinEvento).toHaveBeenCalledWith(expect.anything());
    expect(poblarBoxes).toHaveBeenCalledWith(expect.anything());
    expect(migrarPruebasLegacy).toHaveBeenCalledWith(expect.anything());
    expect(repararAsignaciones).toHaveBeenCalledWith(expect.anything());
    expect(repararMembresiasJueces).toHaveBeenCalledWith(expect.anything());
    expect(endMain).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith('base de datos lista: localhost:3306/testdb');
  });

  it('cierra la conexión raíz aunque falle la creación de la base', async () => {
    queryRoot.mockRejectedValue(new Error('permiso denegado'));

    await expect(ensureDatabase()).rejects.toThrow('permiso denegado');
    expect(endRoot).toHaveBeenCalledTimes(1);
    expect(endMain).not.toHaveBeenCalled();
  });
});

describe('ensureDatabase — migraciones de columna', () => {
  it('omite la definición si la columna ya existe', async () => {
    queryMain.mockImplementation((sql: string) =>
      sql.includes('information_schema.COLUMNS')
        ? Promise.resolve([[{ total: 1 }]])
        : Promise.resolve([]),
    );

    await ensureDatabase();

    const definiciones = queryMain.mock.calls.filter((c) => String(c[0]).includes('ADD COLUMN'));
    expect(definiciones).toHaveLength(0);
  });

  it('aplica la definición cuando la columna falta', async () => {
    queryMain.mockImplementation((sql: string) =>
      sql.includes('information_schema.COLUMNS')
        ? Promise.resolve([[{ total: 0 }]])
        : Promise.resolve([]),
    );

    await ensureDatabase();

    expect(queryMain.mock.calls.some((c) => String(c[0]).includes('ADD COLUMN tiempo_cap'))).toBe(
      true,
    );
    expect(log.info).toHaveBeenCalledWith('migracion aplicada: wods.tiempo_cap');
  });

  it('registra y sigue si la comprobación revienta', async () => {
    queryMain.mockImplementation((sql: string) =>
      sql.includes('information_schema.COLUMNS')
        ? Promise.reject(new Error('tabla inexistente'))
        : Promise.resolve([]),
    );

    await ensureDatabase();

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('no se pudo comprobar wods.tiempo_cap: tabla inexistente'),
    );
    expect(queryMain.mock.calls.some((c) => String(c[0]).includes('ADD COLUMN'))).toBe(false);
    // No aborta: el resto de la corrida sigue.
    expect(endMain).toHaveBeenCalledTimes(1);
  });

  it('reintenta la migración sin posición si falla por AFTER', async () => {
    queryMain.mockImplementation((sql: string) => {
      if (sql.includes('information_schema.COLUMNS')) return Promise.resolve([[{ total: 0 }]]);
      if (sql.includes('ADD COLUMN tiempo_cap') && sql.includes('AFTER')) {
        const err: any = new Error('Unknown column');
        err.code = 'ER_BAD_FIELD_ERROR';
        return Promise.reject(err);
      }
      return Promise.resolve([]);
    });

    await ensureDatabase();

    const reintento = queryMain.mock.calls.find(
      (c) => String(c[0]).includes('ADD COLUMN tiempo_cap') && !String(c[0]).includes('AFTER'),
    );
    expect(reintento).toBeDefined();
    expect(log.info).toHaveBeenCalledWith('migracion aplicada (sin AFTER): wods.tiempo_cap');
  });

  it('registra la omisión si el reintento sin posición también falla', async () => {
    queryMain.mockImplementation((sql: string) => {
      if (sql.includes('information_schema.COLUMNS')) return Promise.resolve([[{ total: 0 }]]);
      if (sql.includes('ADD COLUMN tiempo_cap')) {
        const err: any = new Error('tabla legacy');
        err.code = 'ER_BAD_FIELD_ERROR';
        return Promise.reject(err);
      }
      return Promise.resolve([]);
    });

    await ensureDatabase();

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('migracion omitida wods.tiempo_cap: tabla legacy'),
    );
    expect(endMain).toHaveBeenCalledTimes(1);
  });

  it('registra la omisión cuando la migración falla por otra razón', async () => {
    queryMain.mockImplementation((sql: string) => {
      if (sql.includes('information_schema.COLUMNS')) return Promise.resolve([[{ total: 0 }]]);
      if (sql.includes('ADD COLUMN tiempo_cap')) {
        const err: any = new Error('sintaxis rara');
        err.code = 'ER_PARSE_ERROR';
        return Promise.reject(err);
      }
      return Promise.resolve([]);
    });

    await ensureDatabase();

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('migracion omitida wods.tiempo_cap: sintaxis rara'),
    );
  });
});

describe('ensureDatabase — migraciones idempotentes', () => {
  function rechazarRaw(codigo: string) {
    queryMain.mockImplementation((sql: string) => {
      if (sql.includes('ADD INDEX')) {
        const err: any = new Error('duplicado');
        err.code = codigo;
        return Promise.reject(err);
      }
      return Promise.resolve([]);
    });
  }

  it('tolera en silencio los códigos esperados de "ya existe"', async () => {
    rechazarRaw('ER_DUP_KEYNAME');

    await ensureDatabase();

    expect(log.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('migracion idempotente omitida'),
    );
    expect(endMain).toHaveBeenCalledTimes(1);
  });

  it('tolera también los errores de tablas o columnas legacy', async () => {
    rechazarRaw('ER_NO_SUCH_TABLE');

    await ensureDatabase();

    expect(log.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('migracion idempotente omitida'),
    );
  });

  it('avisa cuando el fallo no es uno de los esperados', async () => {
    rechazarRaw('ER_ACCESS_DENIED_ERROR');

    await ensureDatabase();

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('migracion idempotente omitida (ER_ACCESS_DENIED_ERROR)'),
    );
    expect(endMain).toHaveBeenCalledTimes(1);
  });

  it('avisa también cuando el error no trae código', async () => {
    queryMain.mockImplementation((sql: string) =>
      sql.includes('ADD INDEX') ? Promise.reject(new Error('sin codigo')) : Promise.resolve([]),
    );

    await ensureDatabase();

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('migracion idempotente omitida (sin codigo)'),
    );
  });
});
