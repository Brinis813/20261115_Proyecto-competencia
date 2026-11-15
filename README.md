# Competition Manager

Sistema de gestión, cronometraje y clasificación en vivo para eventos de
CrossFit, Hyrox y formatos similares.

Un administrador crea las pruebas y asigna jueces y atletas; los jueces
cronometran desde el móvil; el público ve la clasificación actualizarse sola en
la pantalla del evento.

---

## Puesta en marcha en local

**Requisitos:** Node.js 18 o superior y MySQL 8 en marcha.

```bash
# 1. Configurar el backend
cp backend/.env.example backend/.env
```

Edita `backend/.env` con los datos de tu MySQL y genera el secreto de sesión:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

```bash
# 2. Arrancar todo
start.bat
```

`start.bat` instala las dependencias si faltan, levanta backend y frontend y
abre el navegador. **No hay que crear la base de datos a mano**: el backend
crea el esquema y el usuario administrador al arrancar.

La primera vez, la ventana del backend muestra las credenciales del
administrador. En el primer ingreso se pide cambiar la contraseña.

El dashboard del administrador muestra accesos rápidos para crear un WOD,
gestionar jueces y atletas, y ver los resultados.

| Dirección                        | Qué es                        |
| -------------------------------- | ----------------------------- |
| http://localhost:5173            | Aplicación                    |
| http://localhost:5173/leaderboard | Clasificación pública         |
| http://localhost:3001/api/health | Estado de la API y la base de datos |

`restart.bat` abre un menú para parar o reiniciar cualquiera de los dos
servidores.

<details>
<summary>Arranque manual, sin los .bat</summary>

```bash
cd backend  && npm install && npm run dev
cd frontend && npm install && npm run dev   # en otra terminal
```

</details>

---

## Despliegue en producción

Guía completa paso a paso: **[docs/DEPLOY_DOKPLOY.md](docs/DEPLOY_DOKPLOY.md)**

Resumen con Docker en cualquier servidor:

```bash
cp .env.example .env    # rellena los valores
docker compose up -d --build
```

---

## Roles y acceso

| Rol               | Entra con                     | Puede                                                                  |
| ----------------- | ----------------------------- | ---------------------------------------------------------------------- |
| **Administrador** | cédula + contraseña           | Crear WODs, categorías, dar de alta jueces y atletas, asignar, corregir mediciones |
| **Juez**          | cédula + contraseña temporal  | Cronometrar y registrar resultados de sus Competencias asignados               |
| **Atleta**        | cédula + fecha de nacimiento  | Consultar su posición y sus tiempos                                    |
| **Público**       | sin cuenta                    | Ver la clasificación en vivo                                           |

El **administrador se crea solo** la primera vez que arranca el backend con la
base de datos vacía, con los valores de `SEED_ADMIN_CEDULA` y
`SEED_ADMIN_PASSWORD`. En el primer ingreso el sistema obliga a cambiar esa
contraseña y no deja pasar a ninguna otra pantalla hasta hacerlo.

Los **jueces** los crea el administrador desde la aplicación; su contraseña
temporal se muestra una sola vez. Los **atletas** no tienen contraseña: usan su
fecha de nacimiento.

Con `SEED_DEMO=true` y la base de datos vacía se cargan además un juez, cuatro
atletas y una competencia de ejemplo. Detalle completo en
[docs/DEPLOY_DOKPLOY.md → Anexo A](docs/DEPLOY_DOKPLOY.md#anexo-a--credenciales-de-cada-tipo-de-usuario).

---

## Cómo funciona la clasificación en vivo

Es la pieza central del sistema y no usa recargas ni consultas periódicas:

1. El juez guarda una medición (`POST /api/results`).
2. El backend recalcula la clasificación de la competencia y la emite por WebSocket a la
   sala `competencia-<id>`.
3. En el navegador, un store de [Zustand](https://zustand.docs.pmnd.rs/)
   (el equivalente a Pinia en React) recibe el dato, lo compara con el estado
   anterior y actualiza la tabla.

Como el store recuerda la clasificación previa, puede mostrar quién **subió o
bajó** de puesto con una flecha y resaltar un instante las filas que cambiaron.

La primera carga se hace por HTTP, así que la pantalla funciona aunque el
WebSocket tarde en conectar. Al reconectar vuelve a entrar en la sala sola.

Archivos implicados:

- `frontend/src/stores/leaderboardStore.ts` — estado y cálculo de movimientos
- `frontend/src/hooks/useLiveLeaderboard.ts` — carga inicial y suscripción
- `frontend/src/contexts/SocketContext.tsx` — conexión única y reconexión
- `backend/src/sockets/handlers.ts` — salas y difusión

---

## Puntuación

Estilo CrossFit Games, en `backend/src/services/scoringEngine.ts`:

- En cada wod se ordena a los atletas: **menor tiempo** gana en los
  wods de tiempo, **mayor valor** en repeticiones, peso, distancia e intervalos.
- Los puntos salen de la posición: `puntaje_maximo - (posición - 1)`, con
  mínimo 0.
- Los **empates comparten posición y puntos**. Tras dos empatados en 1.º, el
  siguiente es 3.º.
- Un **abandono (DNF)** queda último con 0 puntos.
- El total es la suma de todos los WODs. Los empates en el total se
  resuelven por el WOD de desempate de la competencia y, si no hay, por la mejor
  posición individual conseguida.

Formatos de tiempo admitidos: `MM:SS`, `MM:SS.CS` y `MM:SS:CS`. No hay tramo de
horas porque sería ambiguo: una prueba de más de una hora se anota con los
minutos por encima de 60 (`75:30`).

---

## Categorías de participación

Las categorías permiten clasificar a los atletas por **tipo de participación** y
otros atributos. En la base de datos se guardan en la tabla `categorias`.

Cada categoría tiene:

- **Nombre y género**: `RX Femenino`, `Scaled Masculino`, etc.
- **Tipo de participación**: `Individual` (uno solo), `Escalado` (variante más fácil),
  `Duplas` (dos atletas), `Equipos` (grupo) o `Relevos`.

El tipo de participación es principalmente informativo en la interfaz de usuario,
pero permite organizar mejor el evento y facilitará futuras funcionalidades
(como validar que en una categoría `Duplas` solo se asignen parejas).

Un participante se vincula a una categoría al inscribirse y aparece en esa línea
de la clasificación.

---

## Editor de WODs

El formulario de creación/edición de WODs (`/admin/competencias/nuevo`) funciona
con una jerarquía visual de 3 niveles:

- **Nivel 1** — Datos de la competencia: nombre, fecha, duración en minutos,
  categorías, ronda, WOD de desempate.
- **Nivel 2** — Cada WOD: nombre del formato (AMRAP, EMOM, For Time, Chipper),
  medición por defecto (repeticiones, calorías, tiempo, distancia, peso),
  distancia si aplica, intentos si es peso, tope de tiempo si aplica,
  modo de cálculo, puntaje máximo.
- **Nivel 3** — Movimientos × categorías: cada movimiento tiene su propia
  medición (independiente del WOD), nombre, unidad de distancia si aplica,
  valor (reps, calorías, distancia o tiempo), peso si está habilitado.

La medición se define **por movimiento**, no por WOD. Esto permite crear WODs
mixtos (por ejemplo, un AMRAP con un movimiento de reps y otro de distancia).
La unidad de distancia (m/km/mi) se configura una vez por WOD y aplica a todos
los movimientos de tipo distancia.

---

## Rutas

| Ruta                             | Acceso        |
| -------------------------------- | ------------- |
| `/leaderboard`                   | público       |
| `/leaderboard/:competenciaId`            | público       |
| `/login`                         | público       |
| `/cambiar-password`              | admin, juez   |
| `/admin`                         | admin         |
| `/admin/categorias`, `/admin/categorias/nuevo` | admin |
| `/admin/competencias`, `/admin/competencias/nuevo`, `/admin/competencias/:competenciaId` | admin |
| `/admin/jueces`, `/admin/participantes` | admin  |
| `/admin/asignaciones[/:competenciaId]`   | admin         |
| `/admin/resultados[/:competenciaId]`     | admin         |
| `/admin/heats`                     | admin         |
| `/juez`, `/juez/:competenciaId`, `/juez/:competenciaId/:wodId` | admin, juez |
| `/participante`                  | atleta        |

Todas admiten enlace directo y recarga. `/leaderboard/:competenciaId` es la que se deja
fija en la pantalla del evento; `/juez/:competenciaId/:wodId` permite al juez
retomar la medición tras reiniciar el navegador.

---

## API

**Autenticación** — `POST /api/auth/login`, `POST /api/auth/login-participante`,
`POST /api/auth/change-password`, `GET /api/auth/me`, `POST /api/auth/logout`

**Usuarios** (admin) — `GET|POST /api/users/jueces`,
`GET|POST /api/users/participantes`, `PUT|DELETE .../:id`

**Competencias** — `GET /api/competencias/public` (sin sesión), `GET /api/competencias/judge` (staff),
`GET|POST|PUT|DELETE /api/competencias[/:id]` (admin), `POST /api/competencias/assign`,
`GET /api/competencias/:id/assignments`, `DELETE /api/competencias/assignments/:id`

Los WODs se crean y editan dentro de una competencia. Cada WOD tiene un formato
(AMRAP, EMOM, For Time, Chipper) que determina cómo se cronometra y puntúa.

**Arranque sincronizado** — `GET /api/competencias/:id/arranque` (auth),
`POST /api/competencias/:id/arranque` (admin, modos: directo, cuenta_regresiva, manual_juez, programado),
`POST .../arranque/pausa`, `POST .../arranque/reanudar`, `POST .../arranque/fin`,
`DELETE /api/competencias/:id/arranque` (cancelar)

El arranque permite iniciar sincronizadamente una competencia para todos los
jueces. Los modos disponibles son:
- **directo**: inicia inmediatamente
- **cuenta_regresiva**: countdown visible para todos
- **manual_juez**: cada juez inicia cuando presione
- **programado**: hora de inicio fija

**Resultados** (staff) — `POST /api/results`, `POST /api/results/check`,
`POST /api/results/reset` (admin), `GET /api/results/competencia/:competenciaId`

**Clasificación** — `GET /api/leaderboard/public/:competenciaId` (sin sesión)

**Heats** — `GET|POST /api/heats`, `GET|PUT|DELETE /api/heats/:id`,
`GET|POST /api/heats/:heatId/participantes`, `DELETE /api/heats/:heatId/participantes/:participanteId`

**Estado** — `GET /api/health`

---

## Seguridad

- Contraseñas con bcrypt (coste 12); las temporales se generan con
  `crypto.randomBytes`.
- Sesión en cookie `HttpOnly` + `Secure` en producción, con la cabecera
  `Authorization` como respaldo para navegadores que bloquean cookies.
- El token distingue si el `id` pertenece a `usuarios` o a `participantes`:
  ambas tablas tienen secuencias independientes y sin esa marca un atleta
  podría pasar por juez.
- Control de acceso por rol en cada ruta. Un atleta no puede escribir
  resultados ni consultar los de otro; un juez solo opera en las competencias que
  tiene asignados.
- Validación con Zod en todos los endpoints y lista blanca de campos en las
  actualizaciones.
- Límite de peticiones por IP (300/min general, 20/min en login), con
  `trust proxy` configurado para leer la IP real detrás del proxy.
- Los mensajes de error nunca exponen SQL ni detalles internos en producción.

---

## Estructura

```
backend/
  src/
    config/       Entorno y conexión a la base de datos
    db/           Esquema DDL y arranque automático (crea BD, tablas y admin)
    models/       Modelos de Sequelize (usuarios, competencias, wods, categorias, arranques, heats, results...)
    middleware/   Autenticación, roles, validación, límite de peticiones
    controllers/  Manejadores de ruta
    services/     Lógica de negocio y motor de puntuación
    routes/       Rutas de Express
    sockets/      Salas y difusión en tiempo real
    __tests__/    Pruebas del motor de puntuación

frontend/
  src/
    api/          Cliente HTTP y normalización de errores
    components/   ui/ (primitivos) y layout/ (estructura y navegación)
    contexts/     Sesión y WebSocket
    stores/       Estado de la clasificación en vivo (Zustand)
    hooks/        Cronómetro, wake lock, sincronización offline, leaderboard
    pages/        Una carpeta por rol (admin/, juez/, public/)
    workers/      Cronómetro en Web Worker
```

---

## Logs y depuración

Por defecto la consola del backend solo muestra lo accionable: tres líneas al
arrancar y nada más mientras todo va bien.

```
21:50:16 info  base de datos lista: localhost:3307/hyrox_db
21:50:16 info  API lista en el puerto 3001 (development)
21:50:16 info  Estado: http://localhost:3001/api/health
```

El registro de consultas SQL está **desactivado**: cada carga de la
clasificación lanza cinco consultas y se repite en cada resultado que guarda un
juez, así que llenaba la consola y tapaba los errores reales.

Cuando necesites verlo, en `backend/.env`:

| Variable     | Valor          | Efecto                                        |
| ------------ | -------------- | --------------------------------------------- |
| `LOG_LEVEL`  | `info` (por defecto) | Arranque, avisos y errores               |
| `LOG_LEVEL`  | `debug`        | Añade el detalle interno                      |
| `LOG_LEVEL`  | `warn`/`error` | Aún más silencioso                            |
| `DB_LOGGING` | `true`         | Imprime cada consulta SQL                     |

O sin tocar el archivo, para una sola ejecución:

```bash
cd backend && DB_LOGGING=true LOG_LEVEL=debug npm run dev
```

---

## Pruebas

```bash
cd backend && npm test
```

Cubren el motor de puntuación: orden por tipo de medición, empates que
comparten puntos, abandonos, formatos de tiempo y el mínimo de 0 puntos.

---

## Detalles del panel del juez

- **Cronómetro en Web Worker**, para que siga midiendo con precisión aunque el
  navegador ralentice el hilo principal al minimizar la pestaña.
- **Wake Lock**: la pantalla no se apaga mientras corre el cronómetro, y el
  bloqueo se recupera al volver a la pestaña.
- **Modo offline**: si falla la red, la medición se guarda en IndexedDB y se
  envía al reconectar. Un resultado rechazado por duplicado se descarta en vez
  de atascar la cola.
- **Bloqueo de atleta**: mientras un juez está midiendo a alguien, otro juez no
  puede empezar a medirlo. El bloqueo se libera al guardar, al cancelar o al
  cerrar la pestaña.
- Cada atleta admite **una sola medición por wod**. Para corregir una, un
  administrador debe resetearla desde *Resultados*.
