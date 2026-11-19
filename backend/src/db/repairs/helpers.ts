import mysql from 'mysql2/promise';

/** ¿Existe la tabla en la base activa? */
export async function existeTabla(conn: mysql.Connection, tabla: string): Promise<boolean> {
  const [rows] = await conn.query<any[]>(
    `SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tabla],
  );
  return (rows[0]?.total ?? 0) > 0;
}

/** ¿Existe la columna en la tabla? */
export async function existeColumna(
  conn: mysql.Connection,
  tabla: string,
  columna: string,
): Promise<boolean> {
  const [rows] = await conn.query<any[]>(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabla, columna],
  );
  return (rows[0]?.total ?? 0) > 0;
}
