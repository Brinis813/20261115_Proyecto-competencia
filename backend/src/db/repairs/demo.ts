import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { env, isProduction } from '../../config/env';
import { log } from '../../utils/logger';

/**
 * Datos de demostracion (jueces, participantes, Competencia y asignaciones).
 * Solo se ejecuta con SEED_DEMO=true y si todavia no hay Competencias cargados.
 */
export async function seedDemoData(): Promise<void> {
  if (!env.SEED_DEMO) return;
  // Segunda barrera: aunque ensureDatabase ya valida, nunca sembrar demo en prod.
  if (isProduction && process.env.ALLOW_SEEDS !== 'true') {
    log.warn('seedDemoData omitido: prohibido en producción sin ALLOW_SEEDS=true');
    return;
  }

  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: parseInt(env.DB_PORT, 10),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  try {
    const [competenciaRows] = await conn.query<any[]>('SELECT COUNT(*) AS total FROM competencias');
    if (competenciaRows[0]?.total > 0) return;

    // Categorias de demostracion (Opción B: solo perfil; las cargas viven en el esquema de la competencia)
    const categoriasDemo = [
      ['Rx', 'Femenino'],
      ['Rx', 'Masculino'],
      ['Scaled', 'Femenino'],
      ['Scaled', 'Masculino'],
    ];
    const catMap = new Map<string, number>();
    for (const c of categoriasDemo) {
      await conn.query(
        `INSERT IGNORE INTO categorias (nombre, genero)
         VALUES (?, ?)`,
        c,
      );
      const [res] = await conn.query<any[]>(
        `SELECT id FROM categorias WHERE nombre = ? AND genero = ? LIMIT 1`,
        [c[0], c[1]],
      );
      if (res[0]?.id) catMap.set(`${c[0]}-${c[1]}`, res[0].id);
    }

    // Contrasena temporal de los jueces demo: password_cambiado=FALSE obliga a
    // cambiarla en el primer ingreso. Se crean cuatro jueces para poder mostrar
    // la regla "un juez por atleta en cada wod" (emparejamiento 1:1).
    const juezHash = await bcrypt.hash('Juez123!', 12);
    const jueces = [
      ['Carlos', 'Garcia', '12345678', 'Box Central'],
      ['Laura', 'Gomez', '23456789', 'Box Norte'],
      ['Pedro', 'Ramirez', '34567890', 'Box Sur'],
      ['Sofia', 'Torres', '45678901', 'Box Central'],
    ];
    const juezIds: number[] = [];
    for (const j of jueces) {
      const [res] = await conn.query<any>(
        `INSERT INTO usuarios (nombre, apellidos, cedula, box, rol, password, password_cambiado)
         VALUES (?, ?, ?, ?, 'juez', ?, FALSE)`,
        [...j, juezHash],
      );
      juezIds.push(res.insertId);
    }

    // La categoria coincide con una division de la competencia (Rx / Scaled) para que el
    // scorecard cargue las reps por division del atleta.
    const participantes = [
      [
        'Maria',
        'Lopez',
        '87654321',
        '1990-05-15',
        'Box Central',
        'maria.lopez@example.com',
        'Rx',
        catMap.get('Rx-Femenino') ?? null,
      ],
      [
        'Juan',
        'Perez',
        '11223344',
        '1985-08-20',
        'Box Norte',
        'juan.perez@example.com',
        'Rx',
        catMap.get('Rx-Masculino') ?? null,
      ],
      [
        'Ana',
        'Rodriguez',
        '55667788',
        '1992-12-10',
        'Box Central',
        'ana.rodriguez@example.com',
        'Scaled',
        catMap.get('Scaled-Femenino') ?? null,
      ],
      [
        'Diego',
        'Martinez',
        '99887766',
        '1994-03-02',
        'Box Sur',
        'diego.martinez@example.com',
        'Scaled',
        catMap.get('Scaled-Masculino') ?? null,
      ],
    ];
    const participanteIds: number[] = [];
    for (const p of participantes) {
      const [res] = await conn.query<any>(
        `INSERT INTO participantes (nombre, apellidos, cedula, fecha_nacimiento, box, email, categoria, categoria_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        p,
      );
      participanteIds.push(res.insertId);
    }

    // Divisiones para las reps por division del scorecard.
    const divisiones = JSON.stringify(['Rx', 'Scaled']);
    const [competencia] = await conn.query<any>(
      `INSERT INTO competencias (nombre, descripcion, metodo_desempate, tipo_flujo, tipo_publicacion, estado, divisiones, rondas)
       VALUES ('Competencia 1 - Funcional', 'WODs funcionales de alta intensidad',
               'Menor tiempo en el WOD de remo', 'en_serie', 'tiempo_real', 'activo', ?, 2)`,
      [divisiones],
    );
    const competenciaId = competencia.insertId;

    // Esquemas de medicion guiada (scorecards). null = captura simple.
    const esqChipper = JSON.stringify({
      modalidad: 'for_time',
      rondas: 2,
      movimientos: [
        { nombre: 'Remo (cal)', reps: { Rx: 20, Scaled: 15 } },
        { nombre: 'Wall Balls', reps: { Rx: 15, Scaled: 10 } },
      ],
    });
    const esqAmrap = JSON.stringify({
      modalidad: 'amrap',
      rondas: 1,
      movimientos: [
        { nombre: 'Thrusters', reps: { Rx: 12, Scaled: 9 } },
        { nombre: 'Box Jumps', reps: { Rx: 12, Scaled: 9 } },
      ],
    });
    const esqMaxLoad = JSON.stringify({ modalidad: 'max_load', intentos: 3 });

    // [competencia, orden, nombre, tipo, dur_estimada, tiempo_cap, esquema, puntaje]
    const wods: Array<[number, number, string, string, number, number, string | null, number]> = [
      [competenciaId, 1, 'Chipper 2 rondas (For Time)', 'tiempo', 300, 420, esqChipper, 100],
      [
        competenciaId,
        2,
        'AMRAP 5min (Thrusters + Box Jumps)',
        'repeticiones',
        300,
        0,
        esqAmrap,
        100,
      ],
      [competenciaId, 3, 'Max Deadlift', 'peso', 120, 0, esqMaxLoad, 100],
      [competenciaId, 4, 'Sled Push 50m', 'distancia', 120, 0, null, 100],
    ];
    const wodIds: number[] = [];
    for (const c of wods) {
      const [res] = await conn.query<any>(
        `INSERT INTO wods (competencia_id, orden, nombre_ejercicio, tipo_medicion, tiempo_estimado_duracion, tiempo_cap, esquema, puntaje_maximo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        c,
      );
      wodIds.push(res.insertId);
    }

    // Asignacion por WOD con un juez por atleta (1:1): en cada estacion el
    // juez i evalua al atleta i. Asi ningun juez se repite dentro de un WOD
    // y ningun atleta tiene dos jueces, que es justo lo que exige la app.
    for (const wodId of wodIds) {
      for (let i = 0; i < participanteIds.length; i++) {
        await conn.query(
          'INSERT INTO asignaciones (competencia_id, wod_id, usuario_id, participante_id) VALUES (?, ?, ?, ?)',
          [competenciaId, wodId, juezIds[i], participanteIds[i]],
        );
      }
    }

    log.info('datos de demostracion cargados (SEED_DEMO=true)');
  } finally {
    await conn.end();
  }
}
