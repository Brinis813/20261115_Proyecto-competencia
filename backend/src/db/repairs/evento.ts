import mysql from 'mysql2/promise';
import { log } from '../../utils/logger';

/**
 * Cuelga de un evento las competencias, categorias y atletas que se crearon
 * antes de que la aplicacion manejara eventos.
 *
 * Se ejecuta en cada arranque pero solo hace algo si queda alguna fila
 * suelta, asi que es seguro repetirlo. El admin sembrado pasa a superadmin:
 * es quien administraba todo hasta ahora.
 */
export async function adoptarDatosSinEvento(conn: mysql.Connection): Promise<void> {
  try {
    const [sueltos] = await conn.query<any[]>(
      `SELECT
         (SELECT COUNT(*) FROM competencias WHERE evento_id IS NULL) +
         (SELECT COUNT(*) FROM categorias WHERE evento_id IS NULL) +
         (SELECT COUNT(*) FROM participantes WHERE evento_id IS NULL) AS total`
    );
    if (!sueltos[0]?.total) return;

    const [admins] = await conn.query<any[]>(
      `SELECT id FROM usuarios WHERE rol IN ('super_admin', 'admin')
       ORDER BY rol = 'super_admin' DESC, id ASC LIMIT 1`
    );
    const adminId = admins[0]?.id ?? null;

    const [existentes] = await conn.query<any[]>(
      `SELECT id FROM eventos ORDER BY id ASC LIMIT 1`
    );

    let eventoId: number = existentes[0]?.id;
    if (!eventoId) {
      const [res] = await conn.query<any>(
        // La fecha de fin se deja una semana por delante: los datos que ya
        // estaban se siguen usando, y un evento que nace "pasada" se
        // veria archivada desde el primer dia.
        `INSERT INTO eventos (nombre, descripcion, fecha_inicio, fecha_fin, propietario_id)
         VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), ?)`,
        [
          'Evento inicial',
          'Recoge las competencias, categorias y atletas que ya existian antes de separar la aplicacion por eventos.',
          adminId,
        ]
      );
      eventoId = res.insertId;
      log.info(`evento inicial creado (id ${eventoId}) para los datos existentes`);
    }

    for (const tabla of ['competencias', 'categorias', 'participantes']) {
      await conn.query(`UPDATE ${tabla} SET evento_id = ? WHERE evento_id IS NULL`, [
        eventoId,
      ]);
    }

    // Todo el personal existente queda dentro de ese evento.
    await conn.query(
      `INSERT IGNORE INTO evento_usuarios (evento_id, usuario_id, rol)
       SELECT ?, id, CASE WHEN rol = 'admin' THEN 'admin' ELSE 'juez' END FROM usuarios`,
      [eventoId]
    );
    if (adminId) {
      await conn.query(
        `UPDATE evento_usuarios SET rol = 'propietario' WHERE evento_id = ? AND usuario_id = ?`,
        [eventoId, adminId]
      );
      await conn.query(`UPDATE usuarios SET es_superadmin = TRUE WHERE id = ?`, [adminId]);
    }
  } catch (err) {
    log.warn(`no se pudieron adoptar los datos sin evento: ${(err as Error).message}`);
  }
}

/**
 * Crea los boxes a partir del texto libre que ya existia y enlaza usuarios y
 * eventos con ellos.
 *
 * Antes el box era una cadena suelta en `usuarios.box` y en `eventos.sede`.
 * Aqui se convierte en una fila real sin perder el texto, que se conserva como
 * etiqueta. El superadmin se queda sin box a proposito: los ve todos.
 *
 * Se ejecuta en cada arranque pero solo actua sobre lo que sigue sin enlazar.
 */
export async function poblarBoxes(conn: mysql.Connection): Promise<void> {
  try {
    const [pendientes] = await conn.query<any[]>(
      `SELECT
         (SELECT COUNT(*) FROM usuarios WHERE box_id IS NULL AND es_superadmin = FALSE) +
         (SELECT COUNT(*) FROM eventos WHERE box_id IS NULL) AS total`
    );
    if (!pendientes[0]?.total) return;

    // Un box por cada nombre distinto, venga de donde venga.
    await conn.query(
      `INSERT IGNORE INTO boxes (nombre)
       SELECT DISTINCT TRIM(box) FROM usuarios
       WHERE box IS NOT NULL AND TRIM(box) <> '' AND es_superadmin = FALSE`
    );
    await conn.query(
      `INSERT IGNORE INTO boxes (nombre)
       SELECT DISTINCT TRIM(sede) FROM eventos
       WHERE sede IS NOT NULL AND TRIM(sede) <> ''`
    );

    await conn.query(
      `UPDATE usuarios u JOIN boxes b ON b.nombre = TRIM(u.box)
       SET u.box_id = b.id
       WHERE u.box_id IS NULL AND u.es_superadmin = FALSE`
    );
    await conn.query(
      `UPDATE eventos c JOIN boxes b ON b.nombre = TRIM(c.sede)
       SET c.box_id = b.id
       WHERE c.box_id IS NULL`
    );

    // Un evento sin sede hereda el box de su propietario.
    await conn.query(
      `UPDATE eventos c JOIN usuarios u ON u.id = c.propietario_id
       SET c.box_id = u.box_id
       WHERE c.box_id IS NULL AND u.box_id IS NOT NULL`
    );

    const [creados] = await conn.query<any[]>('SELECT COUNT(*) AS total FROM boxes');
    log.info(`boxes enlazados: ${creados[0]?.total ?? 0} en total`);
  } catch (err) {
    log.warn(`no se pudieron poblar los boxes: ${(err as Error).message}`);
  }
}
