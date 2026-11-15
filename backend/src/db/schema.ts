/**
 * Esquema DDL de la base de datos.
 *
 * Esta es la unica fuente de verdad del esquema: el backend la aplica
 * automaticamente al arrancar (ver `bootstrap.ts`), tanto en local como en
 * Docker/Dokploy. No hace falta ejecutar ningun .sql a mano.
 *
 * Todas las sentencias son idempotentes (IF NOT EXISTS), asi que se pueden
 * volver a aplicar en cada arranque sin efectos secundarios.
 */

export const SCHEMA_STATEMENTS: string[] = [
  // 1. USUARIOS (admin y jueces)
  `CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    cedula VARCHAR(20) NOT NULL UNIQUE,
    box VARCHAR(100) NOT NULL,
    rol ENUM('admin', 'juez') NOT NULL DEFAULT 'juez',
    password VARCHAR(255) NOT NULL,
    password_cambiado BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_usuarios_cedula (cedula),
    INDEX idx_usuarios_rol (rol)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 2. CATEGORIAS DE COMPETENCIA (Opción B: SOLO perfil de participación.
  // Toda la operativa —ejercicios, pesos, distancias, reps por categoría—
  // vive en la competencia: `competencia_categorias` + `wods.esquema.movimientos[]`.
  // Las columnas legacy `peso/distancia/repeticiones/elementos_*` se retiran
  // en RAW_MIGRATIONS para no romper instalaciones existentes.)
  `CREATE TABLE IF NOT EXISTS categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL COMMENT 'Nivel / división: RX, Scaled, Elite, Master, etc.',
    genero ENUM('Masculino', 'Femenino', 'Mixto') NOT NULL,
    tipo_participacion ENUM('Individual', 'Escalado', 'Duplas', 'Equipos', 'Relevos') NOT NULL DEFAULT 'Individual' COMMENT 'Formato: individual, escalado, duplas, equipos o relevos',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_categoria_genero (nombre, genero)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3. PARTICIPANTES (atletas)
  `CREATE TABLE IF NOT EXISTS participantes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    cedula VARCHAR(20) NOT NULL UNIQUE,
    fecha_nacimiento DATE NOT NULL,
    box VARCHAR(100) NOT NULL,
    email VARCHAR(150) NULL UNIQUE,
    categoria VARCHAR(50) NULL,
    categoria_id INT NULL,
    evento_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_participantes_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
    INDEX idx_participantes_cedula (cedula),
    INDEX idx_participantes_email (email),
    INDEX idx_participantes_categoria_id (categoria_id),
    INDEX idx_participantes_evento (evento_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 4. COMPETENCIAS (pruebas del evento)
  `CREATE TABLE IF NOT EXISTS competencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    metodo_desempate TEXT,
    tipo_flujo ENUM('en_serie', 'estaciones_simultaneas') NOT NULL DEFAULT 'en_serie',
    tipo_publicacion ENUM('tiempo_real', 'al_finalizar_circuito') NOT NULL DEFAULT 'tiempo_real',
    estado ENUM('borrador', 'activo', 'finalizado') NOT NULL DEFAULT 'activo',
    tipo_participacion ENUM('Individual', 'Relevos', 'Duplas', 'Equipos', 'Escalado') NOT NULL DEFAULT 'Individual' COMMENT 'Formato de la prueba: individual, relevos, duplas, equipos o escalado',
    duracion_minutos INT DEFAULT NULL COMMENT 'Duracion / time cap de la competencia en minutos (NULL = sin tope)',
    rondas INT NOT NULL DEFAULT 1 COMMENT 'Numero de rondas que se repite cada ejercicio de la competencia',
    imagen_url VARCHAR(500) DEFAULT NULL COMMENT 'Portada de la competencia, ej. /api/uploads/competencias/3_1729000000000.jpg',
    desempate_nombre VARCHAR(150) DEFAULT NULL,
    desempate_tipo_medicion ENUM('tiempo', 'repeticiones', 'peso', 'distancia', 'calorías') DEFAULT NULL,
    wod_desempate_id INT DEFAULT NULL,
    tiebreak_policy ENUM('NONE','TIEBREAK_MARK','DESIGNATED_CIRCUIT_SPLIT') NOT NULL DEFAULT 'DESIGNATED_CIRCUIT_SPLIT' COMMENT 'Cómo se resuelven los empates dentro de la competencia',
    divisiones JSON DEFAULT NULL COMMENT 'Lista de divisiones/categorias de la competencia, ej. ["Rx","Scaled"]',
    evento_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_competencias_evento_estado (evento_id, estado)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 4. WODS (ejercicios/estaciones de cada competencia)
  `CREATE TABLE IF NOT EXISTS wods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    competencia_id INT NOT NULL,
    orden INT NOT NULL,
    nombre_ejercicio VARCHAR(150) NOT NULL,
    tipo_medicion ENUM('tiempo', 'repeticiones', 'peso', 'distancia', 'calorías') NOT NULL,
    unidad_distancia ENUM('m', 'km', 'mi') NOT NULL DEFAULT 'm' COMMENT 'Unidad de la marca cuando tipo_medicion=distancia (m = metros, km = kilometros, mi = millas)',
    imagen_url VARCHAR(500) DEFAULT NULL COMMENT 'Foto del WOD, ej. /api/uploads/wods/12_1729000000000.jpg',
    tiempo_estimado_duracion INT NOT NULL COMMENT 'Duracion estimada en segundos',
    tiempo_cap INT NOT NULL DEFAULT 0 COMMENT 'Tope de tiempo en segundos (0 = sin tope). Solo aplica a tipo_medicion=tiempo',
    esquema JSON DEFAULT NULL COMMENT 'Medicion guiada: modalidad, rondas, movimientos con reps por division, intentos',
    puntaje_maximo INT NOT NULL DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_wods_competencia FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE CASCADE,
    INDEX idx_wods_competencia (competencia_id),
    INDEX idx_wods_orden (competencia_id, orden)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 4.b ARRANQUES: historial de arranques sincronizados de cada competencia. La fila
  // vigente es la de mayor id; así un juez que reconecta lee el t0 del
  // servidor y acopla su cronómetro.
  `CREATE TABLE IF NOT EXISTS arranques (
    id INT AUTO_INCREMENT PRIMARY KEY,
    competencia_id INT NOT NULL,
    evento_id INT NULL,
    modo ENUM('directo','cuenta_regresiva','manual_juez','programado') NOT NULL,
    estado ENUM('armado','cuenta_regresiva','en_curso','pausado','finalizado','cancelado') NOT NULL DEFAULT 'armado',
    t0_ms BIGINT NULL COMMENT 'Arranque, epoch ms del servidor',
    pausado_en_ms BIGINT NULL COMMENT 'Instante de la pausa (epoch ms servidor)',
    pausa_acumulada_ms INT NOT NULL DEFAULT 0 COMMENT 'Total en pausa, auditoria',
    countdown_seg INT NULL,
    programado_para_ms BIGINT NULL,
    duracion_minutos INT NULL COMMENT 'Snapshot del time cap de la competencia al armar',
    rondas INT NOT NULL DEFAULT 1,
    version INT NOT NULL DEFAULT 1,
    creado_por INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_arranques_competencia FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE CASCADE,
    INDEX idx_arranques_competencia (competencia_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 4.c HEATS GLOBALES POR CATEGORÍA: series estables para todo el evento.
  // Un atleta queda en un heat + carril fijos; solo el horario varía por Competencia.
  `CREATE TABLE IF NOT EXISTS heats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    evento_id INT NOT NULL,
    categoria_id INT NOT NULL,
    numero INT NOT NULL COMMENT 'N° de serie dentro de la categoría',
    capacidad_maxima INT NOT NULL COMMENT 'Carriles disponibles en la pista',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_heats_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE,
    UNIQUE KEY unique_heat_categoria_numero (categoria_id, numero),
    INDEX idx_heats_categoria (categoria_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS heat_participantes (
    heat_id INT NOT NULL,
    participante_id INT NOT NULL,
    carril_numero INT NOT NULL COMMENT 'Carril fijo del atleta en su heat',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (heat_id, participante_id),
    CONSTRAINT fk_heatpart_heat FOREIGN KEY (heat_id) REFERENCES heats(id) ON DELETE CASCADE,
    CONSTRAINT fk_heatpart_participante FOREIGN KEY (participante_id) REFERENCES participantes(id) ON DELETE CASCADE,
    UNIQUE KEY unique_heat_participante (participante_id),
    UNIQUE KEY unique_heat_carril (heat_id, carril_numero)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS heat_horarios (
    heat_id INT NOT NULL,
    competencia_id INT NOT NULL,
    hora_inicio TIME NOT NULL COMMENT 'Hora de inicio de la serie en esa competencia',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (heat_id, competencia_id),
    CONSTRAINT fk_heatcompetencia_heat FOREIGN KEY (heat_id) REFERENCES heats(id) ON DELETE CASCADE,
    CONSTRAINT fk_heatcompetencia_competencia FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 5. ASIGNACIONES (Competencia <-> wod <-> juez <-> participante)
  //
  // wod_id NULL significa "todos los WODs de la competencia". Un valor concreto
  // vincula al juez con el atleta solo en esa estacion. Se usa un valor centinela
  // (0) en la unique key para poder deduplicar tambien las filas de "todos"
  // (MySQL trata cada NULL como distinto en un indice unico).
  `CREATE TABLE IF NOT EXISTS asignaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    competencia_id INT NOT NULL,
    wod_id INT NULL COMMENT 'NULL = todos los WODs de la competencia',
    usuario_id INT NOT NULL COMMENT 'Juez asignado',
    participante_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_asignaciones_competencia FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE CASCADE,
    CONSTRAINT fk_asignaciones_wod FOREIGN KEY (wod_id) REFERENCES wods(id) ON DELETE CASCADE,
    CONSTRAINT fk_asignaciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_asignaciones_participante FOREIGN KEY (participante_id) REFERENCES participantes(id) ON DELETE CASCADE,
    UNIQUE KEY unique_asignacion (competencia_id, participante_id, wod_id),
    INDEX idx_asignaciones_competencia (competencia_id),
    INDEX idx_asignaciones_wod (wod_id),
    INDEX idx_asignaciones_usuario (usuario_id),
    INDEX idx_asignaciones_participante (participante_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 6. RESULTADOS
  `CREATE TABLE IF NOT EXISTS resultados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    participante_id INT NOT NULL,
    wod_id INT NULL,
    juez_id INT NOT NULL,
    valor_bruto VARCHAR(50) NOT NULL COMMENT 'MM:SS.CS para tiempo (o reps hechas si capado), numero para reps/kg/distancia',
    puntos_calculados INT NOT NULL DEFAULT 0,
    abandono BOOLEAN NOT NULL DEFAULT FALSE,
    capado BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'No termino antes del tope de tiempo: valor_bruto son las reps hechas',
    disqualificado BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Descalificado (DSQ): 0 puntos, posición final',
    detalle JSON DEFAULT NULL COMMENT 'Desglose de la medicion guiada: conteos por movimiento/ronda, splits o intentos',
    desempate INT DEFAULT NULL COMMENT 'Criterio de desempate dentro del WOD (menor es mejor), ej. tiempo del tie-break en ms',
    es_desempate BOOLEAN NOT NULL DEFAULT FALSE,
    sincronizado BOOLEAN NOT NULL DEFAULT TRUE,
    timestamp_servidor TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_resultados_participante FOREIGN KEY (participante_id) REFERENCES participantes(id) ON DELETE CASCADE,
    CONSTRAINT fk_resultados_wod FOREIGN KEY (wod_id) REFERENCES wods(id) ON DELETE CASCADE,
    CONSTRAINT fk_resultados_juez FOREIGN KEY (juez_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    UNIQUE KEY unique_resultado (participante_id, wod_id),
    INDEX idx_resultados_participante (participante_id),
    INDEX idx_resultados_wod (wod_id),
    INDEX idx_resultados_wod_participante (wod_id, participante_id),
    INDEX idx_resultados_juez (juez_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 6.b competencia_categorias: que categorias compiten en cada competencia.
  //
  // Sustituye al texto libre de `competencias.divisiones`, que no casaba con la
  // categoria real del atleta. `divisiones` se sigue escribiendo como copia
  // derivada de esta tabla para no romper el agrupado de la clasificacion.
  `CREATE TABLE IF NOT EXISTS competencia_categorias (
    competencia_id INT NOT NULL,
    categoria_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (competencia_id, categoria_id),
    CONSTRAINT fk_competenciacat_competencia FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE CASCADE,
    CONSTRAINT fk_competenciacat_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE,
    INDEX idx_competenciacat_categoria (categoria_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 7. RESULTADO_SPLITS (NUEVO - para HYROX multi-etapa)
  `CREATE TABLE IF NOT EXISTS resultado_splits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resultado_id INT NOT NULL,
    segmento_numero INT NOT NULL COMMENT 'Número secuencial del segmento (1, 2, 3...)',
    segmento_nombre VARCHAR(150) NOT NULL COMMENT 'Nombre descriptivo (Sprint 1, Estación A, etc)',
    tipo_segmento ENUM('carrera', 'ejercicio', 'transicion') NOT NULL DEFAULT 'carrera',
    tiempo_acumulado_ms INT NOT NULL COMMENT 'Tiempo total desde inicio (milisegundos)',
    tiempo_parcial_ms INT NOT NULL COMMENT 'Tiempo de este segmento solo (milisegundos)',
    posicion_en_segmento INT NULL COMMENT 'Ranking en este segmento (opcional)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_splits_resultado FOREIGN KEY (resultado_id) REFERENCES resultados(id) ON DELETE CASCADE,
    INDEX idx_splits_resultado (resultado_id),
    INDEX idx_splits_segmento (resultado_id, segmento_numero)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 8. COMPETENCIAS
  //
  // Es el contenedor de todo lo demas: Competencias, categorias y atletas cuelgan de
  // un evento. El estado (en curso / proxima / pasada) NO se guarda: se
  // deriva de las fechas, porque un estado guardado se queda obsoleto solo.
  `CREATE TABLE IF NOT EXISTS eventos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,
    sede VARCHAR(150) NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    propietario_id INT NULL,
    es_demo BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Creada automaticamente al verificar el correo',
    scoring_type ENUM('POINTS_ACCUMULATION','WINNER_PER_COMPETENCIA') NOT NULL DEFAULT 'POINTS_ACCUMULATION' COMMENT 'Criterio global de ganador: acumulado o por Competencia',
    tiebreak_policy ENUM('NONE','BEST_INDIVIDUAL_RANK','DESIGNATED_TIEBREAK_COMPETENCIA','LAST_COMPETENCIA_SCORE') NOT NULL DEFAULT 'BEST_INDIVIDUAL_RANK' COMMENT 'Cómo se resuelven los empates en el acumulado global',
    tiebreak_competencia_id INT NULL COMMENT 'Competencia designado como desempate (solo con DESIGNATED_TIEBREAK_COMPETENCIA)',
    imagen_url VARCHAR(500) DEFAULT NULL COMMENT 'Portada del evento, ej. /api/uploads/eventos/3_1729000000000.jpg',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_eventos_propietario FOREIGN KEY (propietario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    INDEX idx_eventos_fechas (fecha_inicio, fecha_fin),
    INDEX idx_eventos_propietario (propietario_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 8.b BOXES: el gimnasio u organizacion que agrupa eventos y
  // administradores. Un box tiene varias eventos; un administrador de box
  // solo puede tocar las de su box.
  `CREATE TABLE IF NOT EXISTS boxes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    ciudad VARCHAR(120) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_box_nombre (nombre)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 9. COMPETENCIA_USUARIOS: quien puede entrar a cada evento y como.
  `CREATE TABLE IF NOT EXISTS evento_usuarios (
    evento_id INT NOT NULL,
    usuario_id INT NOT NULL,
    rol ENUM('propietario','admin','juez') NOT NULL DEFAULT 'juez',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (evento_id, usuario_id),
    CONSTRAINT fk_compuser_evento FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
    CONSTRAINT fk_compuser_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_compuser_usuario (usuario_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 10. AUDIT_LOG: auditoría inmutable (solo INSERT). Sin FK para no bloquear
  // borrados operativos; evento_id permite filtrar por tenant.
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    accion VARCHAR(80) NOT NULL,
    entidad VARCHAR(60) NULL,
    entidad_id INT NULL,
    usuario_id INT NULL,
    evento_id INT NULL,
    detalle JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_evento (evento_id, created_at),
    INDEX idx_audit_entidad (entidad, entidad_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 11. RESULT_HISTORY: cada guardado/reset deja fila; jamás se actualiza.
  `CREATE TABLE IF NOT EXISTS result_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resultado_id INT NULL,
    participante_id INT NOT NULL,
    wod_id INT NOT NULL,
    juez_id INT NOT NULL,
    valor_bruto VARCHAR(50) NULL,
    accion ENUM('creado','reseteado') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_hist_wod (wod_id, created_at),
    INDEX idx_hist_participante (participante_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/**
 * Migraciones para bases de datos creadas con versiones anteriores del esquema.
 * Cada entrada se aplica solo si la columna/indice todavia no existe.
 */
export const MIGRATIONS: Array<{ table: string; column: string; definition: string }> = [
  { table: 'competencias', column: 'estado', definition: `ALTER TABLE competencias ADD COLUMN estado ENUM('borrador','activo','finalizado') NOT NULL DEFAULT 'activo'` },
  { table: 'competencias', column: 'wod_desempate_id', definition: `ALTER TABLE competencias ADD COLUMN wod_desempate_id INT DEFAULT NULL` },
  { table: 'participantes', column: 'categoria', definition: `ALTER TABLE participantes ADD COLUMN categoria VARCHAR(50) NULL` },
  // Tope de tiempo por WOD (0 = sin tope).
  { table: 'wods', column: 'tiempo_cap', definition: `ALTER TABLE wods ADD COLUMN tiempo_cap INT NOT NULL DEFAULT 0 AFTER tiempo_estimado_duracion` },
  // Asignacion por wod (NULL = todos los WODs de la competencia).
  { table: 'asignaciones', column: 'wod_id', definition: `ALTER TABLE asignaciones ADD COLUMN wod_id INT NULL AFTER competencia_id` },
  // Marca de resultado capado (no termino antes del tope; valor_bruto = reps).
  { table: 'resultados', column: 'capado', definition: `ALTER TABLE resultados ADD COLUMN capado BOOLEAN NOT NULL DEFAULT FALSE AFTER abandono` },
  // Descalificacion (DSQ). Va en el CREATE TABLE, pero las bases ya creadas
  // necesitan la migracion o toda consulta de resultados falla.
  { table: 'resultados', column: 'disqualificado', definition: `ALTER TABLE resultados ADD COLUMN disqualificado BOOLEAN NOT NULL DEFAULT FALSE AFTER capado` },

  // --- Alta de usuarios con verificacion por correo ---
  // `email_verificado` entra en TRUE: los usuarios que ya existian se crearon a
  // mano desde la administracion y no tienen correo que verificar.
  { table: 'usuarios', column: 'email', definition: `ALTER TABLE usuarios ADD COLUMN email VARCHAR(150) NULL UNIQUE AFTER cedula` },
  { table: 'usuarios', column: 'email_verificado', definition: `ALTER TABLE usuarios ADD COLUMN email_verificado BOOLEAN NOT NULL DEFAULT TRUE AFTER email` },
  // Solo se guarda el hash del token; el valor en claro viaja en el correo.
  { table: 'usuarios', column: 'verificacion_token', definition: `ALTER TABLE usuarios ADD COLUMN verificacion_token VARCHAR(64) NULL` },
  { table: 'usuarios', column: 'verificacion_expira', definition: `ALTER TABLE usuarios ADD COLUMN verificacion_expira DATETIME NULL` },
  // Recuperación de contraseña: mismo patrón (hash + expira 1h). Sin estas
  // columnas el endpoint /auth/reset-* falla con "unknown column".
  { table: 'usuarios', column: 'reset_token', definition: `ALTER TABLE usuarios ADD COLUMN reset_token VARCHAR(64) NULL` },
  { table: 'usuarios', column: 'reset_expira', definition: `ALTER TABLE usuarios ADD COLUMN reset_expira DATETIME NULL` },
  // El admin sembrado ve todos los eventos; los usuarios que se dan de
  // alta solo la suya.
  { table: 'usuarios', column: 'es_superadmin', definition: `ALTER TABLE usuarios ADD COLUMN es_superadmin BOOLEAN NOT NULL DEFAULT FALSE` },

  // --- Boxes: el administrador y el evento pertenecen a uno ---
  // NULL en `usuarios.box_id` es el superadmin: no pertenece a ninguno porque
  // los ve todos.
  { table: 'usuarios', column: 'box_id', definition: `ALTER TABLE usuarios ADD COLUMN box_id INT NULL AFTER box` },
  { table: 'eventos', column: 'box_id', definition: `ALTER TABLE eventos ADD COLUMN box_id INT NULL AFTER sede` },

  // --- Scoring policy global del evento ---
  { table: 'eventos', column: 'scoring_type', definition: `ALTER TABLE eventos ADD COLUMN scoring_type ENUM('POINTS_ACCUMULATION','WINNER_PER_COMPETENCIA') NOT NULL DEFAULT 'POINTS_ACCUMULATION' AFTER es_demo` },
  // --- Tiebreak policies (desempates configurables) ---
  { table: 'eventos', column: 'tiebreak_policy', definition: `ALTER TABLE eventos ADD COLUMN tiebreak_policy ENUM('NONE','BEST_INDIVIDUAL_RANK','DESIGNATED_TIEBREAK_COMPETENCIA','LAST_COMPETENCIA_SCORE') NOT NULL DEFAULT 'BEST_INDIVIDUAL_RANK' AFTER scoring_type` },
  { table: 'eventos', column: 'tiebreak_competencia_id', definition: `ALTER TABLE eventos ADD COLUMN tiebreak_competencia_id INT NULL AFTER tiebreak_policy` },
  // Portada del evento (visible en la portada publica y las tarjetas).
  { table: 'eventos', column: 'imagen_url', definition: `ALTER TABLE eventos ADD COLUMN imagen_url VARCHAR(500) DEFAULT NULL AFTER tiebreak_competencia_id` },
  { table: 'competencias', column: 'tiebreak_policy', definition: `ALTER TABLE competencias ADD COLUMN tiebreak_policy ENUM('NONE','TIEBREAK_MARK','DESIGNATED_CIRCUIT_SPLIT') NOT NULL DEFAULT 'DESIGNATED_CIRCUIT_SPLIT' AFTER wod_desempate_id` },

  // --- Todo lo de un evento cuelga de ella ---
  { table: 'competencias', column: 'evento_id', definition: `ALTER TABLE competencias ADD COLUMN evento_id INT NULL` },
  { table: 'categorias', column: 'evento_id', definition: `ALTER TABLE categorias ADD COLUMN evento_id INT NULL` },
  { table: 'participantes', column: 'evento_id', definition: `ALTER TABLE participantes ADD COLUMN evento_id INT NULL` },
  // Medicion guiada por esquema (For Time / AMRAP / Max Load por division).
  { table: 'wods', column: 'unidad_distancia', definition: `ALTER TABLE wods ADD COLUMN unidad_distancia ENUM('m', 'km', 'mi') NOT NULL DEFAULT 'm' AFTER tipo_medicion` },
  // Foto del WOD (visible en el editor, el juez y la clasificacion).
  { table: 'wods', column: 'imagen_url', definition: `ALTER TABLE wods ADD COLUMN imagen_url VARCHAR(500) DEFAULT NULL AFTER unidad_distancia` },
  { table: 'competencias', column: 'divisiones', definition: `ALTER TABLE competencias ADD COLUMN divisiones JSON DEFAULT NULL` },
  { table: 'wods', column: 'esquema', definition: `ALTER TABLE wods ADD COLUMN esquema JSON DEFAULT NULL AFTER tiempo_cap` },
  { table: 'resultados', column: 'detalle', definition: `ALTER TABLE resultados ADD COLUMN detalle JSON DEFAULT NULL` },
  { table: 'resultados', column: 'desempate', definition: `ALTER TABLE resultados ADD COLUMN desempate INT DEFAULT NULL` },
  // Email opcional y categoria_id en participantes.
  { table: 'participantes', column: 'email', definition: `ALTER TABLE participantes ADD COLUMN email VARCHAR(150) NULL UNIQUE AFTER box` },
  { table: 'participantes', column: 'categoria_id', definition: `ALTER TABLE participantes ADD COLUMN categoria_id INT NULL AFTER categoria` },
  // NOTA: las columnas legacy de métricas en categorias (peso, tipo_peso,
  // distancia, tipo_distancia, repeticiones, tipo_repeticiones,
  // elementos_peso/distancia/repeticiones/calorias) se ELIMINARON de MIGRATIONS
  // a propósito: CREATE TABLE ya no las tiene y RAW_MIGRATIONS las retira.
  // Mantener aquí sus ADD reventaba el arranque (ADD ... AFTER peso con `peso`
  // ya borrado -> "Unknown column 'peso'"), porque MIGRATIONS no tolera fallos.
  { table: 'categorias', column: 'tipo_participacion', definition: 'ALTER TABLE categorias ADD COLUMN tipo_participacion ENUM(\'Individual\', \'Escalado\', \'Duplas\', \'Equipos\', \'Relevos\') NOT NULL DEFAULT \'Individual\' AFTER genero' },
  // Formato de la prueba y duracion (time cap) a nivel de competencia.
  { table: 'competencias', column: 'tipo_participacion', definition: `ALTER TABLE competencias ADD COLUMN tipo_participacion ENUM('Individual','Relevos','Duplas','Equipos','Escalado') NOT NULL DEFAULT 'Individual' AFTER estado` },
  { table: 'competencias', column: 'duracion_minutos', definition: `ALTER TABLE competencias ADD COLUMN duracion_minutos INT DEFAULT NULL COMMENT 'Duracion / time cap de la competencia en minutos (NULL = sin tope)' AFTER tipo_participacion` },
  { table: 'competencias', column: 'rondas', definition: `ALTER TABLE competencias ADD COLUMN rondas INT NOT NULL DEFAULT 1 COMMENT 'Numero de rondas que se repite cada ejercicio de la competencia' AFTER duracion_minutos` },
  // Portada de la competencia (visible en sus tarjetas y en el resumen).
  { table: 'competencias', column: 'imagen_url', definition: `ALTER TABLE competencias ADD COLUMN imagen_url VARCHAR(500) DEFAULT NULL AFTER rondas` },
  // --- Tablas legacy que eran contenedores de evento (2026-09): la tabla
  // `competencias` puede ser el antiguo contenedor (con sede/fechas) y le
  // faltan las columnas de prueba. Sin ellas, /competencias/public revienta
  // con "Unknown column 'tipo_flujo'". El bucle de bootstrap tolera fallos,
  // asi que estas entradas solo actuan donde faltan.
  { table: 'competencias', column: 'metodo_desempate', definition: `ALTER TABLE competencias ADD COLUMN metodo_desempate TEXT NULL` },
  { table: 'competencias', column: 'tipo_flujo', definition: `ALTER TABLE competencias ADD COLUMN tipo_flujo ENUM('en_serie','estaciones_simultaneas') NOT NULL DEFAULT 'en_serie'` },
  { table: 'competencias', column: 'tipo_publicacion', definition: `ALTER TABLE competencias ADD COLUMN tipo_publicacion ENUM('tiempo_real','al_finalizar_circuito') NOT NULL DEFAULT 'tiempo_real'` },
  { table: 'competencias', column: 'desempate_nombre', definition: `ALTER TABLE competencias ADD COLUMN desempate_nombre VARCHAR(150) DEFAULT NULL` },
  { table: 'competencias', column: 'desempate_tipo_medicion', definition: `ALTER TABLE competencias ADD COLUMN desempate_tipo_medicion ENUM('tiempo','repeticiones','peso','distancia','calorías') DEFAULT NULL` },
  // --- Tabla `wods` legacy que guardaba pruebas (2026-09): le faltan las
  // columnas de ejercicio para recibir las filas de `circuitos`.
  { table: 'wods', column: 'orden', definition: `ALTER TABLE wods ADD COLUMN orden INT NOT NULL DEFAULT 1` },
  { table: 'wods', column: 'nombre_ejercicio', definition: `ALTER TABLE wods ADD COLUMN nombre_ejercicio VARCHAR(150) NOT NULL DEFAULT ''` },
  { table: 'wods', column: 'tipo_medicion', definition: `ALTER TABLE wods ADD COLUMN tipo_medicion ENUM('tiempo','repeticiones','peso','distancia','calorías') NOT NULL DEFAULT 'tiempo'` },
  { table: 'wods', column: 'tiempo_estimado_duracion', definition: `ALTER TABLE wods ADD COLUMN tiempo_estimado_duracion INT NOT NULL DEFAULT 0` },
  { table: 'wods', column: 'puntaje_maximo', definition: `ALTER TABLE wods ADD COLUMN puntaje_maximo INT NOT NULL DEFAULT 100` },
];

/**
 * Migraciones idempotentes que no son "add column": cambios de enum, indices y
 * saneado de datos legados. Cada sentencia debe poder ejecutarse en cada arranque
 * sin error ni efecto secundario, por eso se agrupan aparte de MIGRATIONS.
 *
 * El orden importa: primero se reetiquetan los datos con el valor antiguo
 * ('intervalos'), y solo despues se estrecha el enum para dejar de admitirlo.
 */
export const RAW_MIGRATIONS: string[] = [
  // 0. Opción B: el género incluye Mixto (duplas/equipos mixtos) y la categoría
  //    deja de guardar métricas: esas columnas legacy se retiran. Los DROP son
  //    idempotentes (segunda ejecución -> ER_CANT_DROP_FIELD_OR_KEY, tolerado).
  `ALTER TABLE categorias MODIFY COLUMN genero ENUM('Masculino','Femenino','Mixto') NOT NULL`,
  // 0.b Alineación con competencia: el formato incluye Relevos en ambas entidades.
  `ALTER TABLE categorias MODIFY COLUMN tipo_participacion ENUM('Individual','Escalado','Duplas','Equipos','Relevos') NOT NULL DEFAULT 'Individual'`,
  `ALTER TABLE categorias DROP COLUMN elementos_calorias`,
  `ALTER TABLE categorias DROP COLUMN elementos_repeticiones`,
  `ALTER TABLE categorias DROP COLUMN elementos_distancia`,
  `ALTER TABLE categorias DROP COLUMN elementos_peso`,
  `ALTER TABLE categorias DROP COLUMN tipo_repeticiones`,
  `ALTER TABLE categorias DROP COLUMN repeticiones`,
  `ALTER TABLE categorias DROP COLUMN tipo_distancia`,
  `ALTER TABLE categorias DROP COLUMN distancia`,
  `ALTER TABLE categorias DROP COLUMN tipo_peso`,
  `ALTER TABLE categorias DROP COLUMN peso`,
  // 1. Reetiquetar el tipo obsoleto 'intervalos' -> 'distancia' antes de tocar el enum.
  `UPDATE competencias SET desempate_tipo_medicion = 'distancia' WHERE desempate_tipo_medicion = 'intervalos'`,
  // 2. Estrechar los enums a la lista definitiva (incluir 'calorías').
  `ALTER TABLE wods MODIFY COLUMN tipo_medicion ENUM('tiempo','repeticiones','peso','distancia','calorías') NOT NULL`,
  `ALTER TABLE competencias MODIFY COLUMN desempate_tipo_medicion ENUM('tiempo','repeticiones','peso','distancia','calorías') DEFAULT NULL`,
  // 2.b La categoria es unica DENTRO de su evento, no en toda la base:
  //     dos organizadores distintos tienen cada uno su «RX Femenino». Se
  //     recrea en cada arranque para migrar desde la clave global anterior.
  `ALTER TABLE categorias DROP INDEX unique_categoria_genero`,
  `ALTER TABLE categorias ADD UNIQUE KEY unique_categoria_evento (evento_id, nombre, genero)`,
  // La cedula del atleta tambien deja de ser global: el mismo documento puede
  // inscribirse en eventos distintos.
  `ALTER TABLE participantes DROP INDEX cedula`,
  `ALTER TABLE participantes ADD UNIQUE KEY unique_participante_evento (evento_id, cedula)`,

  // 3. Unique key de asignaciones: un atleta tiene como maximo un juez por
  //    WOD (o uno para "todos"). Se recrea en cada arranque para migrar
  //    desde claves anteriores; los pasos son idempotentes (ignora existe/no).
  `ALTER TABLE asignaciones DROP INDEX unique_asignacion`,
  `ALTER TABLE asignaciones ADD UNIQUE KEY unique_asignacion (competencia_id, participante_id, wod_id)`,
  `ALTER TABLE asignaciones ADD CONSTRAINT fk_asignaciones_wod FOREIGN KEY (wod_id) REFERENCES wods(id) ON DELETE CASCADE`,
  // 4. Clave foranea para categoria_id en participantes.
  `ALTER TABLE participantes ADD CONSTRAINT fk_participantes_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL`,
  // 4.b Competencia designada como desempate global: si se borra, queda en NULL (= sin designada).
  `ALTER TABLE eventos ADD CONSTRAINT fk_eventos_tiebreak_competencia FOREIGN KEY (tiebreak_competencia_id) REFERENCES competencias(id) ON DELETE SET NULL`,
  // 4.c Las políticas FASTER_TIME_CAP_SPLIT / FIRST_TO_ACHIEVE se fusionaron en
  // TIEBREAK_MARK (lo único que el juez captura). Primero se remapean los
  // valores viejos y después se estrecha el enum; en ese orden.
  `UPDATE competencias SET tiebreak_policy = 'TIEBREAK_MARK' WHERE tiebreak_policy IN ('FASTER_TIME_CAP_SPLIT','FIRST_TO_ACHIEVE')`,
  `ALTER TABLE competencias MODIFY COLUMN tiebreak_policy ENUM('NONE','TIEBREAK_MARK','DESIGNATED_CIRCUIT_SPLIT') NOT NULL DEFAULT 'DESIGNATED_CIRCUIT_SPLIT'`,
  // 4.d Rondas a nivel de competencia: las competencias creadas antes de esta columna traen las
  // rondas en el esquema de cada WOD. Se migra el valor del primer
  // WOD con rondas a la competencia (solo si la competencia aun esta en el default 1).
  // Idempotente: una vez migrado, `w.rondas != 1` o ya coincide y no cambia.
  `UPDATE competencias w SET w.rondas = (SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(c.esquema, '$.rondas')) AS UNSIGNED) FROM wods c WHERE c.competencia_id = w.id AND c.esquema IS NOT NULL AND JSON_EXTRACT(c.esquema, '$.rondas') IS NOT NULL ORDER BY c.orden ASC LIMIT 1) WHERE w.rondas = 1 AND EXISTS (SELECT 1 FROM wods c2 WHERE c2.competencia_id = w.id AND c2.esquema IS NOT NULL AND JSON_EXTRACT(c2.esquema, '$.rondas') IS NOT NULL AND CAST(JSON_UNQUOTE(JSON_EXTRACT(c2.esquema, '$.rondas')) AS UNSIGNED) > 1)`,
  // 5. Índices anti N+1 del leaderboard vivo y rankings (consultas por
  //    WOD/participante/competencia). Idempotentes: el bootstrap tolera duplicados.
  `ALTER TABLE resultados ADD INDEX idx_resultados_wod_participante (wod_id, participante_id)`,
  `ALTER TABLE resultados ADD INDEX idx_resultados_juez (juez_id)`,
  `ALTER TABLE asignaciones ADD INDEX idx_asignaciones_competencia_participante (competencia_id, participante_id)`,
  `ALTER TABLE asignaciones ADD INDEX idx_asignaciones_usuario (usuario_id)`,
  `ALTER TABLE wods ADD INDEX idx_wods_competencia_orden (competencia_id, orden)`,
  `ALTER TABLE competencias ADD INDEX idx_competencias_evento_estado (evento_id, estado)`,
  `ALTER TABLE participantes ADD INDEX idx_participantes_evento (evento_id)`,
  // 5.b Renombrar competencia_id -> evento_id en heats si la migración de bootstrap
  //     no lo hizo (ER_BAD_FIELD_ERROR tolerado si ya fue renombrado).
  `ALTER TABLE heats CHANGE COLUMN competencia_id evento_id INT NOT NULL`,
  // 6. FK obsoleto en arranques: el renombre wod_id -> competencia_id no actualizó
  //    la FK, así que `fk_arranques_wod` sigue apuntando a `wods(id)`. Se recrea
  //    para apuntar a `competencias(id)`. Idempotente (drop + add tolerados).
  `ALTER TABLE arranques DROP FOREIGN KEY fk_arranques_wod`,
  `ALTER TABLE arranques ADD CONSTRAINT fk_arranques_competencia FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE CASCADE`,
  // 7. FK obsoleto en evento_usuarios: el renombre competencia_usuarios -> evento_usuarios
  //    no actualizó la FK `fk_compuser_competencia` que sigue apuntando a la tabla
  //    vieja. Tras el doble renombre (competencias->eventos, wods->competencias) la FK
  //    apunta a la tabla equivocada. Se recrea para apuntar a `eventos(id)`.
  `ALTER TABLE evento_usuarios DROP FOREIGN KEY fk_compuser_competencia`,
  `ALTER TABLE evento_usuarios ADD CONSTRAINT fk_compuser_evento FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE`,
];
