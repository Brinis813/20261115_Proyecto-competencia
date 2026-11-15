# Registro de cambios

Todos los cambios notables en este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y el proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

---

## [Por definir] - TBD

### Seguridad

#### JWT exclusivamente en HttpOnly cookie
- El token ya no se almacena en `localStorage` ni se envía en cabecera `Authorization`.
- El navegador envía la cookie HttpOnly automáticamente con `withCredentials: true`.
- Elimina el vector XSS → robo de JWT → account takeover.
- SameSite=strict en cookies de sesión para prevenir CSRF.
- Los sockets WebSocket también se autentican via cookie (sin `auth` callback).

#### Rate limiting hardened
- Auth endpoints (login, registro, reset): 20 intentos/min por IP.
- Endpoints generales: 300 req/min por IP.
- Stores con cleanup periódico y límite de 100K entradas.
- `trust proxy` validado (rango 0-4) al startup.

#### Validación de secrets al startup
- `JWT_SECRET` debe tener mínimo 32 caracteres.
- `UPLOADS_DIR` validado que esté dentro del directorio del proyecto.

#### Dependency checks antes de DELETE
- `deleteCompetencia`: verifica resultados y asignaciones antes de eliminar.
- `deleteUsuario`: verifica asignaciones y resultados como juez.
- `deleteParticipante`: verifica resultados y asignaciones.
- Errores descriptivos en vez de CASCADE silencioso.

#### ErrorBoundary
- Componente `ErrorBoundary` captura errores de React rendering.
- UI de recuperación con botones "Recargar página" e "Ir al inicio".
- Envuelve todas las rutas en `App.tsx`.

### Arreglado

#### Bugs críticos del backend
- `setupSocketHandlers(io)` movido dentro de `start()` después de `connectDB()`.
- Handlers `unhandledRejection` y `uncaughtException` registrados globalmente.
- `verificarToken` retorna objeto nuevo en vez de mutar el payload JWT.
- Graceful shutdown con timeout de 30s para drenar conexiones en vuelo.
- Health endpoint retorna `Retry-After: 30` en respuestas 503.

#### 401 selectivo en el frontend
- Solo limpia la sesión en 401 de endpoints protegidos.
- `/auth/login`, `/auth/me` y `/api/participant` no disparan limpieza de token.

### Rendimiento

#### Frontend
- Code splitting con `React.lazy` en las 30+ páginas de App.tsx.
- Vite `manualChunks`: vendor-react, vendor-socket, vendor-ui.

#### Backend
- Eliminado doble fetch en `getLeaderboard()`.
- Batch query en `getParticipantPosition()` (O(n) vs O(n²)).
- Leaderboard cache in-memory 2s TTL (invalidado al persistir resultados).
- Socket.IO `maxHttpBufferSize` reducido de 1MB a 64KB.
- Backend memory limit aumentado a 768M.

#### Técnico
- `as any` reducido de 39 → 11 (28 eliminados). Los 11 restantes son raw SQL, `.get()` de asociaciones y delete de props internas — todos aceptables.

#### Infraestructura
- Nginx upstream keepalive (32 conexiones TCP).
- `gzip_proxied any` habilitado para respuestas de proxy.
- Docker npm cache mounts en ambos Dockerfiles.
- Healthcheck real en docker-compose para el backend.
- Puerto backend configurable via `BACKEND_PORT`.

### Cambiado

#### Clean Code
- `passwordField` compartido en auth routes (DRY — antes 3 veces).
- `toProfileDTO()` en authService (DRY — antes 3 constructores).
- `ventanasSocket` cleanup periódico cada 30s.
- Helmet CSP configurado en producción.
- Cache de uploads reducido de 7d a 1d.

#### Renombre global Evento / Competencia / WOD

- La prueba (antes `WOD`) ahora se llama **competencia** y el ejercicio/estación (antes `circuito`) ahora se llama **WOD**; el contenedor (antes `competencia`) ahora se llama **evento**.
- Base de datos: `eventos`, `competencias`, `wods`, `competencia_categorias`, `evento_usuarios`, `heat_horarios`, con columnas `evento_id`, `competencia_id`, `wod_id`, `wod_desempate_id` y `tiebreak_competencia_id`. Migración automática e idempotente al arrancar (conserva todos los datos).
- API: `/api/eventos` (antes `/api/competencias`), `/api/competencias` (antes `/api/wods`), `/leaderboard/evento/:eventoId`, evento `competencia:start` por Socket.IO y cabecera `X-Evento-Id`.
- Frontend: rutas `/eventos`, `/admin/competencias`, `/juez/:competenciaId/:wodId`, menú **Heats** y etiquetas actualizadas en toda la app.

### Agregado

#### Calorías como Tipo de Medición

- Nuevo tipo de medición: `calorías` (ej. Assault Bike, Remo).
  - Tratamiento: **mayor es mejor** (como reps/peso/distancia).
  - Unidad: kcal (kilocalorías).
  - Disponible en el dropdown "Medición" al crear competencias.
  - Se ordena descendente en la clasificación (quien quema más calorías, gana).

### Corregido

- **Base de Datos**: Se añadió la migración faltante para la columna `tipo_participacion` en la tabla `categorias`.
- **Frontend**: Se eliminaron variables no utilizadas en `ContadorSegmentos.tsx`.

#### Estado DSQ (Disqualified)

- Nuevo campo `disqualificado` en tabla `resultados`.
  - Estado: **Descalificado** (quebrantó reglas, técnica inválida, etc.).
  - Comportamiento: Como DNF, recibe 0 puntos y queda al final de la clasificación.
  - Acceso: Administrador puede marcar DSQ al revisar resultados.
  - Diferencia con DNF: DNF = no finalizó (lesión); DSQ = finalizó pero fue descalificado.

### Cambios

#### Medición y Scoring

- **scoringEngine.ts**:
  - Actualizado `TipoMedicion` para incluir `'calorías'`.
  - Función `menorEsMejor()` ahora retorna `false` para calorías (mayor es mejor).
  - Nueva estructura `ResultadoEntrada` incluye campo `disqualificado`.
  - Función `puntuarWod()` ahora maneja 4 niveles: finalizadores, capados, DNF, DSQ.
  - DSQ y DNF comparten posición final con 0 puntos.

- **Resultado.ts** (modelo):
  - Nuevo campo `declare disqualificado: boolean`.
  - Inicialización: `disqualificado: false` por defecto.

- **resultService.ts**:
  - Función `saveResult()` acepta parámetro `disqualificado`.

- **resultController.ts**:
  - Endpoint `POST /api/results` ahora acepta `{ disqualificado: boolean }`.

#### Frontend

- **types/index.ts**:
  - `TipoMedicion` agregó `| 'calorías'`.
  - `ETIQUETA_MEDICION` agregó entrada `calorías: 'Calorías'`.
  - `UNIDAD_MEDICION` agregó entrada `calorías: 'kcal'`.
  - Automáticamente disponible en CompetenciaEditorPage al seleccionar medición.

#### Categorías de participación

- Nuevo campo `tipo_participacion` en la tabla `categorias` con opciones:
  - **Individual** (por defecto): un atleta compite solo.
  - **Escalado**: variante facilitada del evento.
  - **Duplas**: dos atletas comparten el mismo resultado.
  - **Equipos**: grupos de atletas (3 o más).

- Nueva sección en el panel de administración: **Categorías** (`/admin/categorias`).
  - Crear, editar y eliminar categorías.
  - Asignar tipo de participación a cada categoría.
  - Definir elementos de medición (pesos, distancias, repeticiones).

- El tipo de participación aparece como badge en la lista de categorías.
- Búsqueda filtrable por tipo de participación.

### Cambios Documentación

- **README.md**:
  - Actualizada tabla de roles: administradores ahora crean categorías.
  - Agregada ruta `/admin/categorias` en la tabla de rutas.
  - Nueva sección "Categorías de participación" explicando la estructura.
  - Sección "Puntuación" actualizada: menciona calorías y DSQ.

- **MANUAL_USUARIO.md**:
  - Nueva sección "Crear categorías de participación" como **paso 1** en
    "Preparar un evento".
  - Explicación de cada tipo de participación con ejemplos.
  - Renumeración de pasos posteriores (Competencias, jueces, atletas, asignaciones).

### Técnico

- **Backend**:
  - Agregada columna `tipo_participacion` ENUM a tabla `categorias`.
  - Agregada columna `disqualificado` BOOLEAN a tabla `resultados`.
  - Actualizado modelo `Categoria` con nuevo tipo en TypeScript.
  - Servicio `categoryService` incluye validación y manejo del nuevo campo.
  - Controlador `categoryController` soporta lectura/escritura.

- **Frontend**:
  - Interfaz `Categoria` actualizada con `tipo_participacion`.
  - Componente `CategoriasPage` incluye:
    - Select dropdown para elegir tipo de participación (obligatorio).
    - Badge visual para mostrar el tipo en las tarjetas.
    - Filtro de búsqueda incluye tipo de participación.
    - Validación que requiere el tipo de participación.

- **Base de datos**:
  - Idempotencia garantizada: la columna se crea solo si no existe.
  - Valor por defecto: `Individual` para categorías existentes.

### Notas de compatibilidad

- **Retrocompatibilidad**: Las categorías existentes tendrán automáticamente
  `tipo_participacion = 'Individual'`.
- No se requiere migración manual: el esquema se aplica automáticamente al
  arrancar el backend.
- Los clientes API antiguos seguirán funcionando; el campo es opcional en el
  POST/PUT pero se devuelve siempre en GET.

---

## Historial anterior

*Los cambios anteriores al sistema de categorías no se documentan en este archivo.*
