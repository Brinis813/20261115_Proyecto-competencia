# Memoria del proyecto — Competition Manager

*Sistema de gestión, cronometraje y clasificación en vivo para eventos de CrossFit, HYROX y formatos similares.*
*Última actualización: 27 de septiembre de 2026.*

---

## 1. Descripción general

Un administrador crea las pruebas (Competencias) y asigna jueces y atletas; los jueces cronometran y cuentan
repeticiones desde el móvil; el público ve la clasificación actualizarse sola en la pantalla del evento.
Al finalizar, el organizador exporta el informe final (CSV para Excel y PDF) con atletas, jueces y
puntuaciones.

Cada evento tiene portada propia (imagen), visible en las tarjetas, en su página pública y en el
informe final, al estilo del escaparate de eventos de FaceWOD.

## 2. Stack tecnológico

| Capa | Tecnología |
| --- | --- |
| Backend | Node.js 20, Express 4, Sequelize 6, MySQL 8, Socket.IO, Zod, multer, bcrypt, jsonwebtoken |
| Frontend | React 18, Vite, Tailwind CSS, React Router 6, axios, Zustand, Socket.IO client |
| Despliegue | Docker + docker-compose (MySQL, backend, frontend/nginx), listo para Dokploy. Healthcheck real en backend. npm cache mounts. |
| Auth | JWT en cookie HttpOnly (`SameSite=strict`, `httpOnly`, `secure` en prod); WebSocket autenticado via cookie |

## 3. Roles y permisos

| Rol | Alcance |
| --- | --- |
| Superadmin (`es_superadmin`) | Ve y administra todas los eventos y boxes |
| Admin | Administra los eventos de su box (o las asignadas); crea Competencias, atletas, jueces, asignaciones; corrige resultados |
| Juez | Solo mide en las competencias/wods asignados; no edita estructura |
| Participante | Consulta sus propios resultados |

La evento activa viaja en la cabecera `X-Evento-Id` y el servidor siempre la valida contra
los eventos permitidas del usuario (`middleware/evento.ts`): es una preferencia, nunca un permiso.

## 4. Módulos funcionales

### 4.1 Eventos
Contenedor de todo: Competencias, categorías y atletas cuelgan de un evento. El estado
(`en_curso`/`proxima`/`pasada`) se deriva de las fechas, no se guarda. Cada evento define su
criterio global de ganador (`POINTS_ACCUMULATION` o `WINNER_PER_COMPETENCIA`) y su política de desempate global
(`NONE`, `BEST_INDIVIDUAL_RANK`, `DESIGNATED_TIEBREAK_COMPETENCIA`, `LAST_COMPETENCIA_SCORE`), editables desde el panel.
Tiene **portada** (`imagen_url`, JPG/PNG/WebP hasta 5 MB) que suben su admin o el superadmin desde
*Resumen → Portada del evento*; se sirve en `/api/uploads` y persiste con volumen en Docker.
Se muestra con el componente `PortadaImagen`: marco 16:9 fijo, imagen entera (`object-contain`)
y fondo rellenado con la misma foto difuminada, sin recortes (tarjetas, página pública del evento,
vista previa del editor e informe final en tono claro para impresión).

### 4.2 Categorías (Opción B)
La categoría es solo perfil de participación (nivel + género + formato). Los pesos, reps y cargas por
categoría viven en la competencia (`wods.esquema.movimientos[].reps/peso`), no en la categoría.

### 4.3 Competencias y wods
Un Competencia tiene: nombre, descripción, tipo de participación, duración/time cap (min), **rondas**,
flujo, publicación, estado, política de desempate y categorías. Sus wods (ejercicios) definen
tipo de medición (`tiempo`, `repeticiones`, `peso`, `distancia`, `calorías`, `time_trial_splits`),
puntaje máximo y un `esquema` opcional de medición guiada (scorecard: `for_time`, `amrap`, `max_load`,
`time_trial_splits` con movimientos, reps/peso por categoría, intentos o segmentos).

**Rondas a nivel de competencia**: el número de rondas/vueltas se define una sola vez en *Datos de la competencia* y aplica
a todos sus ejercicios. El backend lo sincroniza en cada esquema `for_time`/`amrap` para que el cálculo
del juez (reps × rondas) siga cuadrando; las competencias antiguas migran el valor del primer WOD.

**Portada por competencia** (27-09-2026): la tabla `competencias` tiene `imagen_url`
(migración idempotente al arrancar) con endpoints dedicados `PUT/DELETE /competencias/:id/imagen`
(JPG/PNG/WebP hasta 5 MB, archivos en `/api/uploads/competencias`, con verificación de
contenido real por magic bytes y borrado de la anterior). Se sube desde *Datos de la
competencia* en Editar (`components/admin/PortadaCompetencia.tsx`, solo con la competencia ya
creada) y se muestra en las tarjetas del admin y en el Resumen. Al eliminar la competencia
también se borra su archivo.

**Foto por ejercicio** (restaurada 27-09-2026): el modelo `wods.imagen_url` y el endpoint
`POST /competencias/wod-imagen` seguían existiendo pero el formulario ya no tenía el control
de subida (código muerto). Se restauró con `components/admin/ImagenWod.tsx` dentro de cada
WOD del formulario (vista previa + subida inmediata + quitar); la URL viaja como `imagen_url`
al guardar y se ve en el panel del juez, el leaderboard y el Resumen.

### 4.3b Formulario de competencia en 3 niveles (`CompetenciaForm.tsx`)
`GET/POST /admin/competencias/nuevo` y edición usan `pages/admin/CompetenciaForm.tsx`
(reemplaza a `CompetenciaEditorPage`, que se conserva sin uso):
- **Nivel 1**: datos de la competencia (nombre, estado, participación, flujo, publicación,
  duración/time cap en min, rondas globales, desempate, categorías) + lista de WODs con índice
  de orden (subir/bajar) y botón marrón **+ Añadir**.
- **Nivel 2** (bloque rojo por WOD): nombre/formato (sugerencias AMRAP, EMOM, For Time, Chipper,
  cada una con su descripción bajo el campo), selector **Medición** con los 6 tipos y
  **Puntaje máximo** (puntos del 1er puesto; cada puesto posterior resta 1, según `scoringEngine.ts`).
- **Nivel 3** (bloque verde): una banda horizontal por categoría con sus movimientos
  (nombre, unidad, reps y peso de esa categoría; etiquetas o `GENERAL`); botón amarillo
  **+ Añadir movimiento** arriba a la derecha. El peso es opcional por ejercicio
  (interruptor *Con peso*; apagado = peso corporal, sin columnas de peso). En calorías la
  unidad es Kcal/cal (`unidad_peso` admite `kg/lb/kcal/cal`) y la meta siempre visible.
  En distancia, bloque **Distancia por categoría** (meta por división en la unidad elegida).
  El orden sale de la posición en la lista; cada bloque se titula **Ejercicio N**.
- Serializa al `esquema` canónico (`modalidad`, `movimientos[].reps/peso` por
  división): `GENERAL` es la clave `General` y el formato vive en el nombre; `peso`/`max_load` guarda
  intentos, `distancia` guarda `distancia_meta` informativa por división (número único
  o matriz `{división: distancia}`, sin scorecard; el juez la ve en su lista), y
  `time_trial_splits`
  guarda segmentos vacíos.
- Lógica pura extraída a `utils/competenciaFormMapper.ts` (tipos UI, `esquemaDesdeUI`,
  con tests) y fila de movimiento a `components/admin/MovimientoRow.tsx` (con tests);
  la subida de archivos usa el hook compartido `useSubidaImagen.ts`.
- Guarda con `POST/PUT /api/competencias` (cabecera `X-Evento-Id` automática) y navega al listado.
  Al guardar valida obligatorios (nombre, nombre y puntaje de cada ejercicio, nombre de cada
  movimiento si hay varios) y resalta en rojo el cuadro pendiente con desplazamiento al primero.
  Los numéricos se autoseleccionan al enfocar (sin ceros pegados). El selector **WOD desempate**
  solo aparece con política *WOD designado* (al cambiar de política se limpia el designado).

### 4.4 Asignaciones juez–atleta
Vínculo 1:1 por competencia, opcionalmente acotado a un WOD (`wod_id` null = todos los WODs).
Una nueva asignación sobrescribe la anterior del mismo atleta en ese ámbito.

### 4.5 Resultados y puntuación
El juez registra según el tipo: cronómetro (tiempo + penalización por no-reps), conteo por movimiento
(scorecard), intentos de peso, distancia, calorías manuales o splits HYROX. Estados: finalizado,
capado (no terminó antes del tope → cuenta por reps) y DNF/abandono. Cada puesto resta un punto
respecto al anterior desde el `puntaje_maximo` del WOD. El admin puede resetear mediciones
(quedan en historial).
Con `tipo_flujo=en_serie` el scorecard es secuencial (`ContadorSerie.tsx`): un ejercicio a la vez
en orden, con rondas X/N y avance bloqueado hasta completar el objetivo del paso; con
`estaciones_simultaneas` conserva la cuadrícula completa (`ContadorEsquema.tsx`). El `detalle`
guardado es el mismo en ambos modos.
- **Calorías siempre manuales** (27-09-2026): sin esquema el juez teclea el total quemado (kcal,
  campo validado > 0); con esquema cada ejercicio de calorías es campo numérico manual en Serie
  y cuadrícula (ya no hay contador +1 para calorías). Resumen: *"Teclea las cal de cada ejercicio"*.
- **Movimientos por tiempo** (27-09-2026): la línea verde muestra MM:SS en minutos con barra de
  progreso; al cumplirse el tiempo se anota solo y se avanza al siguiente ejercicio (también en
  AMRAP, donde antes seguía corriendo); el campo manual muestra su equivalencia en minutos.
- **Ronda visible y botones grandes** (27-09-2026): insignia grande `Ronda X/Y` y botones −/+
  de 80 px en Serie.
- **Cronómetro aislado** (27-09-2026): `components/judge/CronometroView.tsx` con estado propio
  (el tick ~10/s ya no re-renderiza la página); la página lee el valor en firme por ref al enviar
  y recibe solo transiciones. Misma UI y mismo flujo (tope, cuenta atrás, penalizaciones).
- **Registro congelado** (27-09-2026): además de la pausa, el heat `capado` o `finalizado`
  congela conteos, cronos y campos (lo anotado se conserva y **sí se puede enviar**; el servidor
  decide con 409). Antes solo la pausa congelaba y el mini-crono seguía 1 s tras el cap.
- **Re-lock al reconectar** (27-09-2026): el servidor libera bloqueos en `disconnect`, así que el
  juez re-registra su lock en cada `connect` con ACK; si otro juez lo tomó en la ventana sin
  conexión, avisa en pantalla. `lock-participant` acepta callback `{ok}` (opcional, compatible).

### 4.6 Clasificación en vivo
Leaderboard por Competencia y acumulado del evento, emitido por WebSocket (`broadcastLeaderboard`,
con firma anti-duplicados y throttle por socket) y visible en pantallas públicas sin sesión.
El menú **Clasificación** del juez lleva a `/clasificacion` (sus competencias con enlace directo
al leaderboard; antes apuntaba a la portada). `getParticipantPosition` usa la misma `policy` que
el leaderboard principal (con NONE, misma marca = mismo puesto/puntos).
Tarjetas estilo app de eventos: píldora **En vivo** con punto pulsante, insignia de fecha sobre
la portada y grupos En curso / Próximas / Pasadas (eventos) y En curso / Programadas /
Finalizadas plegadas (competencias del admin).

### 4.7 Carga masiva
*Admin → Carga masiva*: importa atletas y jueces desde CSV (`tipo,nombre,apellidos,cedula,box,…`),
con plantillas descargables. Los jueces se crean con contraseña temporal de un solo uso.

### 4.8 Informe final y exportación
*Admin → Informe final* (`/admin/informe`): clasificación general, detalle por Competencia (marca, puntos,
estado y juez), jueces con sus atletas asignados y lista de atletas.
- **CSV**: un archivo por secciones, con BOM para Excel; también hay botón CSV por Competencia en Resultados.
- **PDF**: vista de impresión en hoja clara (el navegador la guarda como PDF).

### 4.9 Arranque sincronizado, time cap, emergencias y beeps
El admin arma cada competencia desde su tarjeta (*Competencias → Arranque sincronizado*) en 4 modos: directo,
cuenta regresiva, manual por juez (offline) y programado por hora exacta. El backend fija un `t0`
futuro en su reloj y lo difunde por Socket.IO (`competencia:start`) a la sala de la competencia; cada juez mide su
offset y programa el arranque contra ese instante. Comandos de emergencia: **pausa global**
(congela y al reanudar desplaza `t0`), **finalizar** y **abortar** (relojes a 00:00).
Resiliencia: offset continuo, re-acople automático al reconectar, vigilancia de deriva y botón
"Re-sincronizar". Al vencer `duracion_minutos` el reloj se congela y la medición pasa a **capado**
(solo reps). Beeps sintetizados con `AudioContext`: 3-2-1 grave (440 Hz/0.1 s), arranque agudo
largo (880 Hz/0.6 s) y cap sostenido (990 Hz/1.5 s). Historial en tabla `arranques`; store
`stores/competenciaStartStore.ts`, banner `components/judge/CompetenciaStartBanner.tsx`.

**Pausa global de emergencia (24-09-2026)**: el admin la dispara ante cualquier novedad y congela
todo el heat sin perder lo anotado; al reanudar sigue desde el segundo exacto de la pausa, y para
resetear usa *Abortar* (relojes a 00:00; los resultados ya guardados no se borran) o el reseteo
individual por atleta en *Resultados* (`POST /results/reset`).
- **Admin** (`components/admin/ArranqueControl.tsx`): pausar/reanudar/finalizar/abortar piden
  confirmación previa (ninguna sale por un toque accidental) con el efecto explicado.
- **Juez** (`pages/judge/JuezMedicionPage.tsx`): al entrar en pausa se detiene su cronómetro local
  y quedan deshabilitados cronómetro, conteos de reps/calorías, scorecard por movimiento, intentos
  de peso, segmentos, no-reps, vueltas, desempate, campo de distancia y todos los botones de envío,
  con aviso *"Heat en pausa… nada de lo anotado se ha perdido"*.
- **Servidor** (`controllers/resultController.ts`): `POST /results` devuelve **409** si el último
  arranque de la competencia está `pausado` o `finalizado`, así que ni online ni por sincronización
  offline entra ningún registro durante la pausa.

### 4.10 Heats globales por categoría y cronograma
*Admin → Heats* (`/admin/heats`): series estables por categoría (heat + carril fijos por atleta
para todo el evento) con capacidad configurable, reparto automático alfabético/aleatorio o armado
manual (serie vacía + mover con dropdown, quitar, renumeración), y cronograma por competencia automático
(`Hora_Heat_N = anterior + duración_de_la_competencia + transición`) o manual (timepicker por serie). Tablas
`heats`, `heat_participantes` (carril único por heat, un heat por atleta) y `heat_horarios` (hora por
serie y prueba).

## 5. Modelo de datos (tablas principales)

`usuarios`, `boxes`, `eventos`, `evento_usuarios`, `categorias`, `participantes`,
`competencias` (con `rondas`, `duracion_minutos`, `divisiones`, `tiebreak_policy`,
`imagen_url` + índices `idx_competencias_evento_estado`),
`eventos` (con `imagen_url`), `wods` (`esquema` JSON), `competencia_categorias`,
`asignaciones`, `resultados` (`detalle` JSON, `capado`,
`abandono`, `desempate`, + índice `idx_resultados_wod_participante`),
`participantes` (+ índice `idx_participantes_evento`),
`resultado_splits`, `arranques`, `heats`,
`heat_participantes`, `heat_horarios`, `audit_log`, `result_history`.

El esquema es código: `backend/src/db/schema.ts` (`SCHEMA_STATEMENTS` + `MIGRATIONS` + `RAW_MIGRATIONS`)
se aplica solo al arrancar, de forma idempotente, en local y en Docker. El bucle de `MIGRATIONS`
tolera fallos (no aborta el arranque; reintenta sin `AFTER` ante columnas base legacy inexistentes).
El paso `migrarPruebasLegacy` (en `bootstrap.ts`) muda filas del esquema anterior
(`wods`→`competencias`, `circuitos`→`wods`), normaliza el enum `tiebreak_policy` heredado del
contenedor, permite NULL en `fecha_inicio/fin` legacy y elimina el contenedor fantasma
*Competencia inicial*; es idempotente (reutiliza por nombre+evento y borra el origen tras mudar).

## 6. Estructura de carpetas

```
proyecto-evento/
├── backend/src/
│   ├── routes/ controllers/ services/ models/ middleware/
│   ├── db/ (schema.ts, bootstrap.ts, guard.ts) — esquema y semillas
│   ├── sockets/ (leaderboard en vivo)  types/ (medición guiada)
│   └── index.ts (monta /api/* y /api/uploads)
├── frontend/src/
│   ├── pages/admin/ (panel, Competencias, jueces, atletas, asignaciones,
│   │                 resultados, carga masiva, informe final)
│   ├── pages/judge/ (Competencias, wods, medición, clasificación)  pages/public/ (portada, evento, leaderboards)
│   ├── components/ (layout, ui, judge [CronometroView], admin [ResumenCompetencia,
│   │   PortadaCompetencia, ImagenWod, MovimientoRow], eventos, help)
│   ├── utils/export.ts (CSV + datos del informe)  utils/juezMedicion.ts (lógica pura del juez:
│   │   valor bruto, detalle, división, rondas, formato y tiempos, formatearCrono)
│   │   utils/competenciaFormMapper.ts (tipos UI + serialización a esquema canónico)
│   │   utils/unidadesMedicion.ts (formatoCrono, unidadParaTipo)  api/client.ts  stores/ hooks/
│   │   hooks/useSubidaImagen.ts (máquina de subida compartida: portadas + validación)
├── docs/ (DEPLOY_DOKPLOY, GUIA_VIDEOS_AYUDA, AUDITORIA_HARDENING)  ejemplos/  docker-compose.yml  start.bat  restart.bat
└── MEMORIA.md (este archivo)
```

## 7. Puesta en marcha

**Local** (Node 18+ y MySQL 8): `cp backend/.env.example backend/.env`, editar credenciales y ejecutar
`start.bat` (instala, levanta ambos servidores y abre el navegador). El backend crea el esquema y el
admin inicial solo; la primera vez muestra sus credenciales. App en `http://localhost:5173`
(Vite proxea `/api` y `/socket.io` al backend en `:3001`).

**Producción**: `docker-compose up` (MySQL + backend + frontend/nginx en el puerto 80). Solo el
frontend queda expuesto; `/api` y `/socket.io` se redirigen al backend por red interna. Las portadas
persisten en el volumen `backend_uploads`.

## 8. Seguridad, rendimiento y calidad de código (19-09-2026)

Revisión completa con 4 agentes especializados (OWASP, Clean Code, QA, DevOps).
**24 fixes aplicados**, TypeScript compila limpio en ambos lados.

### 8.1 Seguridad (OWASP)
- **JWT exclusivamente en HttpOnly cookie**: eliminado `localStorage` del frontend; el token
  ya no es accesible por JavaScript, cerrando el vector XSS → account takeover.
- **SameSite=strict** en cookies de sesión para prevenir CSRF.
- **Rate limiting diferenciado**: auth endpoints (login, registro, reset) con límite estricto
  (20/min), endpoints generales con 300/min. Los stores de rate limit tienen cleanup periódico
  y límite de 100K entradas para prevenir memory leaks.
- **Validación de `JWT_SECRET`** al startup (mínimo 32 caracteres, rechaza patrones débiles).
- **`trust proxy` validado** (rango 0-4) para evitar IP spoofing.
- **UPLOADS_DIR validado** al startup para prevenir path traversal.
- **`Retry-After` header** en respuestas 503 del health check.
- **Helmet CSP** configurado en producción (`same-site` policy).

### 8.2 Bugs críticos corregidos (QA)
- **`setupSocketHandlers(io)` movido** dentro de `start()` después de `connectDB()` — evita
  que los handlers de socket accedan a la DB no inicializada.
- **`process.on('unhandledRejection')` y `uncaughtException`** registrados — previene
  muerte silenciosa del proceso Node.js.
- **401 selectivo**: el frontend solo limpia la sesión en 401 de endpoints protegidos;
  `/auth/login`, `/auth/me` y `/api/participant` no disparan limpieza.
- **Graceful shutdown con timeout de 30s** para drenar conexiones en vuelo.
- **`verificarToken` retorna objeto nuevo** en vez de mutar el payload JWT decodificado.

### 8.3 Rendimiento (DevOps)
- **Code splitting** con `React.lazy` en las 30+ páginas de `App.tsx`; solo se descarga
  el código de la página visitada.
- **Vite `manualChunks`**: vendor separado en `vendor-react`, `vendor-socket`, `vendor-ui`.
- **Eliminado doble fetch** en `getLeaderboard()` — reutiliza resultados de `calcularPuntuaciones()`.
- **Batch query** en `getParticipantPosition()` — O(n) en vez de O(n²).
- **Nginx upstream keepalive** (32 conexiones) + `gzip_proxied any` para API JSON.
- **Socket.IO `maxHttpBufferSize`** reducido de 1MB a 64KB.
- **Docker npm cache mounts** en ambos Dockerfiles para builds más rápidos.

### 8.4 Calidad de código (Clean Code)
- **`passwordField` compartido** en auth routes (DRY — antes duplicado 3 veces).
- **`toProfileDTO()`** en authService (DRY — antes construido 3 veces).
- **`ventanasSocket` cleanup** periódico cada 30s (memory leak fix).
- **Backend memory** aumentado a 768M para soportar leaderboard con competencias grandes.
- **Healthcheck real** en docker-compose para el backend (verifica HTTP 200, no solo proceso).
- **Puerto backend configurable** via `BACKEND_PORT` en `.env`.

### 8.5 Archivos modificados
| Archivo | Cambios |
|---------|---------|
| `backend/src/index.ts` | Socket.IO buffer 64KB, trust proxy validado, Helmet CSP, setupSocketHandlers post-DB, unhandledRejection, graceful shutdown 30s, UPLOADS_DIR validation, Retry-After, cache 1d uploads |
| `backend/src/middleware/auth.ts` | verificarToken sin mutar payload, import type limpio |
| `backend/src/middleware/rateLimiter.ts` | interval cleanup, max 100K entries, ventanasSocket cleanup |
| `backend/src/controllers/authController.ts` | SameSite=strict cookies |
| `backend/src/routes/auth.ts` | passwordField compartido |
| `backend/src/services/authService.ts` | toProfileDTO() |
| `backend/src/services/scoringEngine.ts` | Eliminado doble fetch, batch query en getParticipantPosition |
| `frontend/src/api/client.ts` | JWT solo HttpOnly cookie, sin localStorage |
| `frontend/src/contexts/AuthContext.tsx` | Sin setToken/getToken |
| `frontend/src/contexts/SocketContext.tsx` | Sin getToken en auth |
| `frontend/src/App.tsx` | React.lazy + Suspense |
| `frontend/vite.config.ts` | manualChunks |
| `frontend/nginx.conf` | upstream keepalive, gzip_proxied |
| `docker-compose.yml` | Backend healthcheck, memory 768M, PORT configurable |
| `backend/Dockerfile` | npm cache mount |
| `frontend/Dockerfile` | npm cache mount |

### 8.6 Auditoría integral multiagente → 9.5/10 (27-09-2026)
Dos prompts (`Proyecto-Competencia-Documentacion`: auditoría >9/10 + hardening sin
regresiones) ejecutados con 4 agentes en paralelo (OWASP, Clean Code, QA, DevOps):
7.05 → **9.5/10**. Tres oleadas aplicadas, todo verificado con suites en verde y `tsc`
limpio, sin cambios de contrato API/WebSocket, esquema (salvo `imagen_url` aditiva) ni
reglas deportivas. Backend 204 → **244 tests** (16 suites), frontend 102 → **142 tests**
(19 archivos).
- **Seguridad**: socket acepta JWT por cookie HttpOnly (el lock de jueces estaba roto sin
  ella); `mensajeSeguro` ampliado (`dup_entry`, `foreign key`, `deadlock`…) y extendido a
  competencia/result/category (confirmado que `ER_DUP_ENTRY` se fugaba); magic bytes reales
  en las 3 subidas + `utils/archivos.ts` unificado (borrado seguro anti-traversal, robusto
  en Windows); throttles en `lock`/`unlock`/`join-competencia`; refresh con vida absoluta
  de 7 días (`origenMs`, con grandfathering); `CORS_ORIGIN='*'` prohibido en producción;
  bypass legacy auditado con `log.warn` (sin restringir, para no romper datos sin evento).
- **QA**: suites `errores400` (23: Zod body/params, cota anti-DoS de `detalle`, JSON roto,
  404 JSON, 409 duplicado/pausa, uploads, 429+`Retry-After`, throttles, traversal),
  `useOfflineSync` (9: 400/422/403/404/409-duplicado se descartan; 409-pausa/429/red/500
  se conservan), `concurrencia` (tx en `programarArranque` y portada), `asyncHandler`,
  `leaderboardPolicy` (convergencia NONE), socket ACK/re-lock/cookie, `refreshToken`,
  `competenciaFormMapper` (11), `MovimientoRow` (5), `CronometroView` (4),
  `useSubidaImagen` (7), `unidadesMedicion`.
- **Clean Code/DevOps**: `programarArranque` y portada en transacción; `getParticipantPosition`
  con `policy`; `as any` de runtime tipados; `sanitize.ts` muerto eliminado; `ErrorBoundary`
  reporta a `POST /api/errores` en prod; sin `eslint-disable` injustificados; índices
  compuestos en `CREATE TABLE`; MySQL `read_only`+`cap_drop`, healthchecks con puerto
  dinámico y password explícito, `no-cache` en `/` de nginx.
- Pendiente consciente (no bugs): descomposición total del JSX de `CompetenciaForm`,
  restricción del fail-open legacy (decisión de producto), invariante `BACKEND_PORT`/nginx.

## 9. Historial de cambios recientes

- **Oleadas juez + admin + auditoría 9.5 + despliegue (27-09-2026, commit `be5b29e` en
  `origin/main` de `Brinis813/New-Proyecto-Competence`)**:
  1. Juez: calorías manuales, tiempo en MM:SS con auto-avance, ronda grande, botones ± de
     80 px, `CronometroView` aislado, congelado en capado/finalizado, re-lock con ACK,
     menú Clasificación → `/clasificacion`.
  2. Admin: modal Resumen por tarjeta, tarjetas agrupadas por estado (curso/programadas/
     finalizadas plegadas), foto por WOD restaurada, **portada por competencia** (columna
     `imagen_url` + endpoints + subida en Editar + tarjetas/resumen).
  3. Auditoría multiagente completa hasta **9.5/10** (ver §8.6).
  4. Despliegue: el servidor usaba otra historia (`dev-joel`, sin `main`); el repo de las
     oleadas es `Brinis813/New-Proyecto-Competence` (rama `main`) con el proyecto anidado
     en `proyecto-competencia-dev-joel/proyecto-competencia-dev-joel/`. Publicar con clon
     fresco + `.env` copiado a mano (no va en git) + `docker compose -p proyecto-competencia
     up -d --build` (el `-p` reutiliza volúmenes y conserva la BD). El clone en servidor
     exige token (PAT con scope `repo`) como contraseña: la contraseña de GitHub ya no vale
     para git. `docker compose down` sin `-v` no borra datos.

- **Cobertura de tests + refactor del juez + auditoría hardening (24-09-2026, sin commit)**:
  1. **Cobertura backend 151 → 188 tests** (12 suites verdes): nuevo
     `src/__tests__/resultService.coverage.test.ts` (7 tests: `getResultsByCompetencia`,
     flags de `saveResult`, `resetResult` sin juez, `saveSplits`, `getSplits`) y
     `src/__tests__/competenciaService.coverage.test.ts` (30 tests: `etiquetaCategoria`,
     `sanearDivisionesSalida`, get/create/update/assign/remove/queries). `resultService.ts`
     71 % → **100 %**, `competenciaService.ts` 9 % → **88 %**. `tsc --noEmit` limpio.
  2. **Cobertura frontend 43 → 101 tests** (13 archivos verdes): `leaderboardStore.test.ts`
     (8 tests, store 0 % → 100 %), `JuezCompetenciasPage.test.tsx` (5 tests, página → 100 %),
     `JuezWodsPage.test.tsx` (7 tests, página → 98 %), `juezMedicion.test.ts` (32 tests,
     módulo → 100 %) y `JuezMedicionPage.test.tsx` (6 tests con mocks pesados, página
     0 % → 44 %). `tsc --noEmit` limpio.
  3. **Refactor sin cambio de comportamiento**: lógica pura del juez extraída de
     `JuezMedicionPage.tsx` a `frontend/src/utils/juezMedicion.ts`
     (`PENALIZACION_NO_REP_SEG`, `formatoTope`, `tiempoAms`, `resolverDivision`,
     `rondasEfectivasMedicion`, `mejorPesoDeIntentos`, `construirMovObjetivo`,
     `construirValorBruto` con sus 8 ramas, `construirDetalle`); la página solo consume el
     módulo. Quirk documentado: `tiempoAms('xx')` devuelve `0`, no `null` (se conserva).
  4. **Auditoría hardening con 4 agentes** (seguridad, arquitectura, QA, rendimiento) en modo
     solo-lectura: puntuaciones 7.0 / 7.1 / 6.0 / 6.5 → proyectada unificada **8.7/10**.
     Informe completo en `docs/AUDITORIA_HARDENING.md` (hallazgos BOLA, atomicidad de
     splits/asignaciones, `await` fuera de `try` en `arranqueController`, worker a 100 Hz,
     N+1 en leaderboard). Nada aplicado todavía: el top-3 pendiente es (1) `await` dentro
     del `try` en arranque, (2) guards BOLA cross-evento, (3) atomicidad de escritura.
     Condicionales con aprobación explícita: índice `Resultado` y rama `time_trial_splits`.

- **Pausa global de emergencia + fix 403 del arranque (24-09-2026, sin commit)**:
  1. **Pausa real ante novedades**: el admin pausa desde la tarjeta de la competencia y se congelan
     cronómetros y registro de todos los jueces (reps, pesos, tiempos, envíos) sin perder lo anotado;
     reanudar sigue desde el segundo de la pausa y abortar resetea a 00:00. Confirmación previa en las
     4 acciones (`ArranqueControl.tsx`); juez con controles deshabilitados y aviso
     (`JuezMedicionPage.tsx`, `IntentosPeso.tsx`, `ContadorSegmentos.tsx` con cronómetro congelado);
     `POST /results` → 409 en pausa/finalizado (`resultController.ts` + `Arranque` en el mock de
     `api.integration.test.ts`, con 2 tests nuevos: 151 backend + 43 frontend en verde).
  2. **Fix 403 "No administras este evento"** en `GET /api/competencias/:id/arranque`
     (`routes/competencias.ts`): faltaba `resolverEvento`, así que `req.alcance` quedaba indefinido y
     `puedeEditar()` denegaba siempre; la precarga del estado por tarjeta fallaba en las competencias
     8, 9 y 11 de producción. Requiere redeploy en Dokploy para verse en `dev01.jhubs.org`.

- **Auditoría completa + hardening (20-09-2026)**: sesión masiva de auditoría con 6 rondas de
  los 4 agentes especializados (OWASP, Clean Code, QA, DevOps). Se partió de 6.4/10 y se alcanzó
  **9.35/10**. Se aplicaron los siguientes cambios:

  **Seguridad (OWASP 9.5/10):**
  - Token JWT eliminado del body de respuesta (antes era CRITICAL)
  - JWT reducido de 24h a 4h con endpoint `/auth/refresh` y auto-refresh cada 3h
  - Zod validation en los 6 eventos WebSocket
  - Rate limiting en 3 capas (global 300/min, auth 20/min, por rol)
  - Contenedores con defense-in-depth: read_only + cap_drop ALL + no-new-privileges + pids_limit
  - Nginx como usuario no-root (`USER nginx`)
  - Stack traces solo en modo desarrollo (`import.meta.env.DEV`)

  **Testing (QA 9.0/10):**
  - De 0 a **192 tests** (149 backend + 43 frontend) en 18 archivos
  - Unit tests: userService (13), competenciaService (6), authService (7), resultService (9), heatService (13), eventoService (12)
  - Integration tests: api.integration.test.ts (24 tests con supertest)
  - Socket.IO integration: socket.integration.test.ts (28 tests con servidor real)
  - Frontend tests: LoginPage (8), ProtectedRoute (5), ErrorBoundary (5), EventosPage (5), ResultadosPage (5), AdminDashboard (5), HeatsPage (5), AsignacionesPage (5)
  - Coverage thresholds: jest 70% global, vitest 50% global
  - Scripts de test con --coverage en ambos lados
  - Smoke tests E2E en CI con token real extraído del login
  - Coverage reports subidos como artifacts en CI (retención 14 días)

  **DevOps (9.3/10):**
  - nginx.conf: listen cambiado de 80 a 8080 (corrige conflicto con cap_drop)
  - Frontend Dockerfile: EXPOSE 8080, USER nginx, permisos diferenciados
  - MySQL backup sidecar: read_only + cap_drop + tmpfs + healthcheck + log rotation
  - docker-compose.yml: stop_grace_period 35s, log rotation en todos los servicios
  - docker-compose.yml: pids_limit en los 4 contenedores (mysql:200, backup:50, backend:200, frontend:100)
  - CI: coverage artifacts upload, failure log capture, frontend test step
  - Healthcheck del backend usa variable de entorno (no hardcodeada)

  **Clean Code (9.6/10):**
  - scoringEngine.ts (818 líneas) dividido en 6 módulos: scoring/types.ts, scoring/parse.ts, scoring/ranking.ts, scoring/leaderboard.ts, scoring/eventoLeaderboard.ts, scoring/index.ts
  - CompetenciaEditorPage.tsx (1032 líneas) eliminado (código muerto)
  - mensajeSeguro + idDeRuta extraídos a controllers/helpers.ts
  - Multer error handler extraído a middleware/handleMulterError.ts
  - console.error reemplazado por log.error en 3 controladores
  - `as any` reducido de 39 a 7
  - @types/multer movido a devDependencies

- **Auditoría de seguridad + rendimiento (19-09-2026)**: revisión con 4 agentes especializados
  (OWASP, Clean Code, QA, DevOps). 24 fixes: JWT a HttpOnly cookies, SameSite=strict,
  code splitting, batch queries, Nginx keepalive, graceful shutdown, rate limiter hardening,
  Docker healthchecks y npm cache mounts.

- **Re-auditoría y segunda ronda de mejoras (19-09-2026)**: tras la primera ronda de 24 fixes,
  se ejecutaron 4 agentes de auditoría de nuevo (OWASP, Clean Code, QA, DevOps), cada uno
  puntuando 7.5/10. Se implementaron 5 mejoras adicionales para alcanzar 8.5+:
  1. **Leaderboard cache 2s** en `scoringEngine.ts` — cache in-memory con TTL de 2s que evita
     queries repetitivas en ráfagas de lecturas simultáneas; invalidado automáticamente al persistir
     resultados.
  2. **CATCH ER_DUP_ENTRY** en `resultController.ts` — manejo específico de race condition entre
     el check previo y el INSERT (UNIQUE constraint `(participante_id, wod_id)` ya existente en schema).
  3. **Dependency checks antes de DELETE** — `deleteCompetencia`, `deleteUsuario` y `deleteParticipante`
     ahora verifican resultados, asignaciones y assignments antes de eliminar; dan error descriptivo
     en vez de CASCADE silencioso.
  4. **`as any` reducido de 39 → 11** — 28 casts eliminados usando tipos de modelos (`Competencia`,
     `Wod`, `Evento`, `Participante`, `Usuario`) y `Record<string, unknown>` para `toJSON()`.
     Los 11 restantes son aceptables (raw SQL, `.get()` de asociaciones, delete de props internas).
  5. **ErrorBoundary** en `frontend/src/components/ErrorBoundary.tsx` — captura errores de React,
     muestra UI de recuperación con botones de recargar/inicio; envuelve las rutas en `App.tsx`.

- **Refinamientos del formulario (18-09-2026)**: bandas horizontales por categoría en el Nivel 3
  (título **Ejercicio N** en grande); descripciones bajo el formato (AMRAP/EMOM/For Time/Chipper);
  autoselección de numéricos; resaltado en rojo de obligatorios con scroll; peso opcional
  (*Con peso*; en calorías la unidad es Kcal/cal y `unidad_peso` admite `kg/lb/kcal/cal`);
  **Distancia por categoría** (`distancia_meta` número o matriz, visible para el juez);
  selector **WOD desempate** solo con política *WOD designado* (limpia al cambiar).
- **Formulario 3 niveles + Zod dedicado (18-09-2026)**: `CompetenciaForm.tsx` (marrón +Añadir WOD,
  bloque rojo por WOD, matriz verde movimientos×categorías, amarillo +Añadir movimiento) en
  crear/editar; `backend/src/schemas/wod.ts` + `competencia.ts` (6 mediciones, sin negativos,
  peso siempre con reps, sin movimientos duplicados) usados por las rutas; el servicio normaliza
  `time_trial_splits`→`tiempo`+modalidad y todo sigue en transacción. Corregido `CompetenciaCategoria`
  (apuntaba a la tabla inexistente `evento_categorias`) y normalizada la columna legacy
  `wods.nombre` a NULL.
- **Arranque resiliente + migración de pruebas legacy (18-09-2026)**: `MIGRATIONS` ya no tumba el
  arranque ante tablas legacy (p. ej. `wods` sin `tiempo_estimado_duracion` impedía crear `eventos.box_id`
  y dejaba al backend caído: `/api/eventos/publicas` en 500 y `/socket.io` sin conexión). Nuevo paso
  `migrarPruebasLegacy` que rescata pruebas/ejercicios del esquema anterior y columnas faltantes en
  `competencias`/`wods` legacy. Los controladores públicos (`/eventos/publicas`, `/competencias/public`)
  registran el error en consola en vez de tragarlo; eliminado el montaje duplicado de `/api/eventos`.
- **Portada con encuadre garantizado (18-09-2026)**: componente `PortadaImagen` (marco 16:9 fijo,
  imagen entera + fondo difuminado, al estilo Boxpodium/Wodreps) usado en tarjetas, página pública
  del evento, vista previa del editor e informe final.
- **Sin foto por ejercicio en el formulario (18-09-2026)**: retirado el bloque *Foto del ejercicio*
  de crear/editar competencia; el campo y las fotos existentes se conservan.
- **Renombre global Evento / Competencia / WOD**: la prueba (antes WOD) es competencia, el ejercicio (antes circuito) es WOD y el contenedor es evento. Tablas, columnas, API (`/api/eventos`, `/api/competencias`), sockets (`competencia:start`), rutas y etiquetas. Migración automática idempotente al arrancar.
- **Rondas a nivel de competencia** (antes por WOD): campo único en la competencia, migración automática de competencias
  antiguas, sincronización en esquemas y cálculo del juez con fallback.
- **Informe final con exportación CSV y PDF** (atletas, jueces, puntuaciones): página `/admin/informe`,
  utilidad `utils/export.ts`, botón CSV por competencia y estilos de impresión.
- **Portada del evento**: subida por admin/superadmin, visible en tarjetas, página pública e
  informe; servida en `/api/uploads` con volumen Docker y límite de 5 MB (nginx 8 MB).
- **Arranque sincronizado + time cap + emergencias + beeps**: 4 modos, pausa/reanudar/abortar,
  re-sincronización por offset, capado automático y audio sintetizado (ver §4.9).
- **Despliegue dev-competencia + fixes de compose (22-09-2026, commits `dd85c83` y `d0500fb`
  en `dev-joel`)**: el `git pull` estaba bien; fallaba `docker compose up`. 5 fixes en
  `docker-compose.yml`: 1) nombres `mysql`/`mysql-backup` intercambiados en local (ciclo
  `mysql -> mysql`), se restauraron del git; 2) `cap_drop`+`no-new-privileges` tumbaban
  mysqld 8.0.46 (`setgid: Operation not permitted`), comentados en `mysql`; 3) healthcheck
  del backend con `.catch()` sobre `http.get()` (nunca es promesa) → `.on('error', ...)`;
  4) healthcheck del backup usaba `pgrep`, ausente en la imagen → `kill -0 1`;
  5) frontend nginx como `USER nginx` con `read_only` + tmpfs de root
  (`mkdir client_temp Permission denied`) → `read_only` off y tmpfs con
  `uid=101,gid=101`. `backend/Dockerfile`: fuera `npm cache clean` redundante (el cache
  mount ya lo maneja).
- **Superadmin operativo (22-09-2026, solo DB, sin commit)**: usuario `00000000` con
  password definido por el operador (bcrypt cost 12, verificado con `bcrypt.compare`).
  Diseño vigente: "superadmin" = `rol='admin'` + `es_superadmin=1` (alcance total en
  `resolverEvento`/`listarEventos`, menú extra en `AppShell`). El valor literal
  `rol='super_admin'` NO lo reconoce el código: el front cae a `/participante` y deniega
  (pantalla negra sin errores) y el back da 403 en `requireRoles('admin')`. Tras cambiar
  el rol hay que cerrar sesión y reentrar (la cookie guarda el rol anterior).
- **Diagnósticos de producción (22-09-2026)**: `/api/health` devuelve 503 `degraded` por
  `socket.stale` (sin broadcasts de leaderboard en ~1h; es criterio estricto del endpoint,
  no caída). El aviso `wss ... closed before established` en consola es el reintento del
  cliente socket.io y es secundario.
