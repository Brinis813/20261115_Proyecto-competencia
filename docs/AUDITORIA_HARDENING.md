# Informe de Auditoría — Hardening Competition Manager

- **Fecha:** 2026-09-24
- **Alcance:** aplicación full-stack de gestión de eventos deportivos (CrossFit, HYROX, DECAFIT)
- **Stack:** React 18 + Vite 5 + Tailwind 3.4 + React Router 6 + Zustand 4 + Socket.IO Client 4 + Axios · Node.js + Express 4 + Sequelize 6 + MySQL 8 + Socket.IO 4 + Zod 3 · Docker + docker-compose
- **Modo:** solo-lectura (ningún archivo de código fue modificado durante la auditoría)
- **Metodología:** 4 agentes especialistas en paralelo + consolidación del orquestador

## Baseline verificado (red de seguridad)

- Backend: **188 tests / 12 suites en verde** + `tsc --noEmit` limpio. Coberturas blindadas: `resultService.ts` 100 %, `competenciaService.ts` ~88 %.
- Frontend: **101 tests / 13 archivos en verde** + `tsc --noEmit` limpio. Coberturas blindadas: `leaderboardStore.ts` 100 %, `JuezCompetenciasPage.tsx` 100 %, `JuezWodsPage.tsx` ~98 %, `utils/juezMedicion.ts` 100 % stmts/funcs/lines (96 % branches), `JuezMedicionPage.tsx` ~44 %.
- Quirk documentado y preservado: `tiempoAms('xx')` devuelve `0`, no `null`.
- Los umbrales globales de coverage hoy NO se cumplen (backend 70/60/70/70, frontend 50/40/50/50) por archivos sin tests; no es error de código.

## Restricciones inviolables aplicadas

1. Cero cambios de esquema DB (`wods.esquema` JSON, `resultados.detalle` JSON intactos).
2. Cero cambios de contrato API/WebSocket (rutas, payloads, eventos, status).
3. Mismos outputs deportivos ante mismas entradas (puntuación, `valor_bruto`, `detalle`, tie-breakers).
4. Ningún rename público ni reestructuración sin codemod; la lógica de `utils/juezMedicion.ts` no vuelve al componente.

---

## Agente 1 — Ciberseguridad (OWASP & Secure Coding)

**Puntuación: inicial 7.0/10 → proyectada 8.8/10.**

Base sólida: JWT HttpOnly + SameSite=strict, BOLA cubierto en competencias/resultados, Zod casi total, Helmet + CSP en backend y nginx, Docker no-root, rate-limit en login.

| Sev. | Archivo:línea | Hallazgo | Fix propuesto |
|---|---|---|---|
| ALTO (BOLA) | `backend/src/controllers/participantController.ts:18-36` | `getParticipantResults` no compara `participante.evento_id` contra `req.alcance`. Staff del Evento A lee PII de atletas del Evento B | Añadir `perteneceAlAlcance(req.alcance, participante.evento_id)` → 403 (3 líneas) |
| ALTO (BOLA) | `backend/src/controllers/resultController.ts:196-214` | `getResultsByParticipant` sin restricción de evento para staff | Resolver `evento_id` del participante + `perteneceAlAlcance` antes del service (~5 líneas) |
| ALTO | `backend/src/controllers/userController.ts:82-92,113-123` | Update/delete de jueces sin chequeo de alcance (sus gemelos de participante sí lo tienen) | Replicar el bloque `perteneceAlAlcance` de participante |
| MEDIO | `backend/src/schemas/result.ts:9` | `detalle: z.record(z.any())` sin cota de claves/tamaño | `refine` ≤50 claves + validar `splits` con schema acotado (max 200) |
| MEDIO | `backend/src/controllers/resultController.ts:36` vs `schemas/result.ts:3-12` | `disqualificado` no declarado en el schema (se amputa o entra sin validar) | Añadir `disqualificado: z.boolean().optional()` |
| MEDIO | `backend/src/schemas/wod.ts:149` | `imagen_url` acepta `javascript:…`, `file:…`, URLs externas arbitrarias | `refine` a `/api/uploads/…` o `http(s)://` |
| MEDIO | `backend/src/schemas/wod.ts:43,46,84,102` | `reps/peso/movimientos_por_division/distancia_meta` sin tope de claves (DoS por CPU) | Chequeo de conteo en `superRefine` (≤100) |
| MEDIO | `backend/src/sockets/handlers.ts:150-169` | Locks `lock/unlock/check-participant-lock` sin alcance de evento; juez de A bloquea medición de B (TTL 30 min) | Verificar asignación al WOD/evento antes de lock (mismo patrón que `resultController.ts:22-32`) |
| MEDIO | `docker-compose.yml:14-15,21,51` | `MYSQL_PWD` expone root en `docker inspect`; `cap_drop/security_opt` de mysql comentados | Borrar `MYSQL_PWD`, descomentar `cap_drop` + `no-new-privileges` |
| MEDIO | `backend/src/routes/users.ts:17,41` + `userController.ts:144-164` | CSV sin `fileFilter` ni tope de filas; celdas `=CMD(…)` sin neutralizar (CSV injection) | `fileFilter` CSV + cap 5000 filas + prefijo `'` en celdas `=,+,-,@` |
| BAJO | `backend/src/sockets/handlers.ts:71-73` | Token por `handshake.query.token` (queda en logs de proxy) | Preferir `handshake.auth.token`, query solo como fallback |
| BAJO | `backend/src/sockets/handlers.ts:117-119` | `leave-competencia` con `competenciaId` crudo (room-spoofing) | Mismo `safeParse` de `join`/`request` |
| BAJO | `backend/src/controllers/helpers.ts:16-23` | `idDeRuta` acepta negativos | Rechazar `≤0` con 400 |
| BAJO | `backend/src/routes/errores.ts:17-25` | Buzón público sin desinfectar saltos de línea (log injection) | `transform` que colapsa `\r\n\t` y corta a 500 |
| BAJO | `docker-compose.yml:102` vs `.env.example` | `JWT_EXPIRES_IN` 4h/12h/24h según archivo; cookie fija 24h | Unificar a `4h` y/o derivar `maxAge` |

Verificado sano: sin SQL injection (cero raw con interpolación), CORS exacto en prod, uploads con allowlist MIME + anti-traversal, sin secretos `VITE_*`, `mensajeSeguro` sin fugas SQL, login bajo rate-limit 5/15 min.

---

## Agente 2 — Arquitectura & Clean Code

**Puntuación: inicial 7.1/10 → proyectada 8.7/10.**

| Sev. | Archivo:línea | Hallazgo | Fix propuesto |
|---|---|---|---|
| ALTO | `backend/src/controllers/resultController.ts:34-105` | El controlador orquesta 5 queries + 2 reglas de negocio + `saveSplits` fuera de la tx | Extraer `resultService.registrarMedicion(input)`; controlador solo parse→llamar→mapear status |
| ALTO | `competenciaController.ts:106-109,122-128` + `resultController.ts` (7 bloques) | Chequeo Competencia + `perteneceAlAlcance` copiado 7× | Helper `exigirAccesoCompetencia(req,res,id)` en `controllers/helpers.ts` |
| ALTO | `backend/src/services/competenciaService.ts:266-273,585,600` | Servicio acoplado a `fs/path` y Socket.IO | Extraer `services/storageWod.ts` + callback opcional `onCambio` (default = comportamiento actual) |
| MEDIO | `backend/src/routes/competencias.ts:48-82` | Multer + fs + handler inline en el router | Extraer `middleware/uploadWod.ts` |
| MEDIO | `backend/src/services/scoring/leaderboard.ts:101-107` | `Map`/`Set` construido solo para consultar `.size` (código muerto confuso) | Asignación directa de `resultado_id` (−10 líneas, mismo output) |
| MEDIO | `backend/src/services/scoring/ranking.ts:141-162` | DNF/DSQ devuelven `resultado_id: 0` (rompe joins de splits en frontend) | `resultado_id: r.resultado_id ?? 0` |
| MEDIO | `frontend/src/stores/competenciaStartStore.ts:47-48,70-80` | `intervalo`/`versionVista` globales fuera del store (rompe StrictMode/tests) | Campos no-reactivos del store (o `Map<competenciaId,…>`) |
| MEDIO | `JuezWodsPage.tsx:9-27` + 6 páginas más | `formatearCategorias` idéntica ×7; `textoMetaDistancia` invocado 2× en JSX | `utils/formato.ts` + memoizar en `JuezWodsPage` |
| MEDIO | `JuezMedicionPage.tsx:129-183` | Derivaciones puras inline (selección de movimientos, bloqueo, clamp) | Nuevas funciones en `utils/juezMedicion.ts` (sin tocar lo existente) |
| BAJO | `JuezMedicionPage.tsx:301-365` | Orquestación HTTP+WS+timeout inline en el JSX | Extraer `hooks/useBuscarAtleta.ts` con mismos errores literales |
| BAJO | `useSplitTimer.ts` vs `useTimer.ts` | Dos relojes con distinta deriva (interval vs Worker) | `useSplitTimer` delega al `timerWorker` |

---

## Agente 3 — QA & Robustez

**Puntuación: inicial 6.0/10 → proyectada 8.5/10.**

| Sev. | Archivo:línea | Hallazgo | Fix propuesto |
|---|---|---|---|
| CRÍTICO | `backend/src/controllers/arranqueController.ts:26-30` (+5 sitios) | `await` fuera del `try` en Express 4 → petición colgada + `unhandledRejection` si MySQL cae en plena final | Mover los `await` dentro del `try` (solo reindentar) |
| ALTO | `schemas/result.ts:3-12` + `middleware/validate.ts:13-14` | `disqualificado` amputado por Zod → nivel DSQ de `ranking.ts:152-162` inalcanzable vía API | Añadir `disqualificado: z.boolean().optional()` (aditivo) |
| ALTO | `resultController.ts:89-105` + `resultService.ts:24-70,132-150` | `saveSplits` en tx separada tras el broadcast → resultado huérfano sin segmentos en HYROX | Pasar `splits` a `saveResult` y persistir dentro de la misma tx |
| ALTO | `scoring/ranking.ts:89-106` + `competenciaService.ts:243-255` | Rama `time_trial_splits` muerta (el tipo llega normalizado a `'tiempo'`) → desempate HYROX por segmento jamás aplicado | Resolver tipo efectivo antes de puntuar — ⚠️ requiere decisión de producto |
| ALTO | `competenciaService.ts:571-582` | `assignCompetencia`: `destroy` + `bulkCreate` sin transacción → jueces sin atletas si falla a mitad | Envolver en `sequelize.transaction()` |
| MEDIO | `sockets/handlers.ts:220-243` | Firma dedup sin `valor_bruto` → correcciones sin cambio de puntos nunca llegan a pantallas | Incluir hash de `valor_bruto` en la firma (solo comparación) |
| MEDIO | `sockets/handlers.ts:48-64` | Locks en memoria por proceso (no existe multi-réplica) | Documentar "1 réplica para jueces" + refrescar TTL en re-`lock`; Redis a largo plazo |
| MEDIO | `JuezMedicionPage.tsx:327-337` | Timeout de lock fail-open (2.5 s → `locked:false`) → dos jueces miden al mismo atleta | Fail-closed con mensaje y no avanzar a `medir` |
| MEDIO | `useOfflineSync.ts:4-19` | `ResultadoPendiente` pierde `disqualificado`/`es_desempate` offline | Añadir ambos campos opcionales al tipo y al POST |
| MEDIO | `JuezMedicionPage.tsx:468-477` + `useOfflineSync.ts:124-131` | Errores 400 encolados y descartados en silencio tras 5 intentos → pérdida silenciosa de medición | No encolar 400: mostrar error y quedarse en `medir` |
| MEDIO | `arranqueService.ts:158-186` | `pausar/reanudar` sin lock de fila → doble desplazamiento de `t0` | `UPDATE … WHERE estado=…` condicional; `affectedRows===0` → error actual |
| BAJO | `scoring/leaderboard.ts:70-72` | Caché invalidada solo si hay actualizaciones (staleness 2 s tras reset) | Invalidar siempre tras save/reset |
| BAJO | `competenciaStartStore.ts:48,254-268` | `versionVista` global + REST que puede pisar snapshot socket más nuevo | Versionar por `competenciaId`, descartar REST obsoleto |

---

## Agente 4 — DevOps & Rendimiento

**Puntuación: inicial 6.5/10 → proyectada 8.5/10.**

| Sev. | Archivo:línea | Hallazgo (costo) | Fix propuesto |
|---|---|---|---|
| CRÍTICO | `workers/timerWorker.ts:11-15` + `hooks/useTimer.ts` | Tick 10 ms → **100 setState/s** en página de ~1000 líneas | Throttle a 50 ms (el valor guardado no cambia: sale de `tiempoFinalMs` al enviar) |
| CRÍTICO | `scoring/leaderboard.ts:37-39,62-67` | SELECT sin `attributes` + N `UPDATE` individuales (~150-400 ms p50 por recálculo) | Atributos acotados + 1 bulk update + `Map` en vez de `.find` |
| ALTO | `scoring/leaderboard.ts:28-31,84-99` | Competencia y WOD leídos 2× (~6 queries por carga) | Pasar lo ya leído a `calcularPuntuaciones` + atributos (6→4 queries, mismo JSON) |
| ALTO | `resultService.ts:19` + `resultController.ts:40-44` | `Wod.findByPk` duplicado + SELECT dentro de la tx (ventana de lock más larga) | Pasar `wod` como arg opcional; SELECT fuera de la tx |
| ALTO | `models/Resultado.ts` (ausencia de `indexes`) | Sin índice en `wod_id` ni unique `(participante_id,wod_id)` | `indexes` aditivos — ⚠️ excepción DDL a aprobar explícitamente |
| MEDIO | `scoring/eventoLeaderboard.ts:26-50` | Filtro de categoría en memoria tras traer todo (~300-800 ms p50) | Push-down de categoría al `where` |
| MEDIO | `competenciaStartStore.ts:70-79,254-268` | Tick 10 Hz + vigilancia REST sin jitter (thundering herd al reconectar) | Tick 250 ms en background + jitter + retry con backoff |
| MEDIO | `JuezMedicionPage.tsx` | Cero `useMemo` × 100 renders/s | Memoizar derivados puros + `React.memo` en hijos |
| BAJO | `sockets/handlers.ts:218` | `lastEmitted` sin evicción (fuga lenta) | LRU cap 200 |
| BAJO | `hooks/useLiveLeaderboard.ts:26-68` | Doble carga HTTP+WS por visita | `AbortController` si el socket entrega primero |
| BAJO | `frontend/Dockerfile`, `nginx.conf` | `COPY . .` invalida caché; gzip sin nivel; estáticos sin `expires` | Copias por capas, `gzip_comp_level 5`, `expires 30d` |

---

## Decisión del orquestador (refactor unificado)

**Aceptado tal cual** (sin conflictos entre agentes): fixes de `arranqueController`, guards BOLA + `exigirAccesoCompetencia()`, `disqualificado` en schema + paridad offline, splits en la tx de `saveResult`, tx en `assignCompetencia`, `registrarMedicion()`, `storageWod.ts`, `uploadWod.ts`, `utils/formato.ts`, `resultado_id` preservado, firma broadcast con `valor_bruto`, fail-closed en lock, no encolar 400s, `UPDATE … WHERE estado`, worker 50 ms, bulk update + atributos + `Map`, `useMemo`/`memo`, LRU, jitter, `AbortController`, afinado Docker/nginx.

**Aceptado con condición:** índice `Resultado` (requiere OK explícito por ser DDL) y rama `time_trial_splits` (requiere decisión de producto: activarla cambia podios HYROX empatados — exige test golden previo).

**Rechazado/diferido:** default fail-closed de `filtroEvento` (rompería leaderboard público), eliminar `Bearer` (lo necesita el handshake WS), Redis, WAF/DAST, réplica de lectura.

**Puntuación final proyectada: 8.7/10** (Seg 8.8 · Arq 8.7 · QA 8.5 · Perf 8.5). El tramo a 10 exige Redis, réplica de lectura y DAST/WAF, fuera del alcance mínimo.

## Plan de acción (top-3)

1. **Armar/pausar sin colgados** (CRÍTICO, ~15 min): `await` dentro del `try` en `arranqueController.ts` (6 bloques, reindentado). Test: `findByPk` rechazado → 5xx JSON, nunca timeout. Rollback: revert.
2. **Cerrar BOLA cross-evento** (ALTO, ~1 h): `perteneceAlAlcance` en `participantController.ts:18-36`, `resultController.ts:196-214`, `userController.ts:82-92,113-123` (vía `exigirAccesoCompetencia()`). Tests 403/200. Rollback: revert por controlador.
3. **Atomicidad de escritura** (~1 h): splits en la tx de `saveResult` + tx en `assignCompetencia`. Test: fallo inducido → cero huérfanos, cero broadcast. Rollback: revert, sin migración.

Runner-up consensuado (A1+A3): `disqualificado` en schema + paridad offline — aditivo, desbloquea la regla DSQ.
