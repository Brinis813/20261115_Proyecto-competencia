---
name: backend-arch
description: Backend Express + Sequelize + MySQL + Socket.IO for Competition Manager. Use when touching backend/src routes, controllers, services, scoringEngine, schema.ts, bootstrap.ts, X-Evento-Id, competencias, wods, resultados, leaderboard.
---

# Backend Arch — Competition Manager

Stack: Node.js 20, Express 4, Sequelize 6, MySQL 8, Socket.IO, Zod, multer.

## Reglas de oro
- El esquema es código: `backend/src/db/schema.ts` (`SCHEMA_STATEMENTS` + `MIGRATIONS` + `RAW_MIGRATIONS`) se aplica solo al arrancar, idempotente. Nunca crear tablas a mano.
- `X-Evento-Id` viaja en cabecera y se valida en `middleware/evento.ts` contra eventos permitidos del usuario. Es preferencia, nunca permiso.
- Roles: `es_superadmin` = todo; `admin` = su box; `juez` = solo medir asignados; `participante` = solo consultar.
- Resultados: UNIQUE `(participante_id, wod_id)`. Capturar `ER_DUP_ENTRY` → 409, no 500.
- `POST /results` devuelve 409 si el último `arranque` está `pausado` o `finalizado`.
- Puntuación: `puntaje_maximo` del WOD, cada puesto resta 1. Lógica en `services/scoring/` (types, parse, ranking, leaderboard, eventoLeaderboard).

## Archivos clave
- `backend/src/db/schema.ts`, `bootstrap.ts` (incluye `migrarPruebasLegacy`), `guard.ts`
- `backend/src/routes/`, `controllers/`, `services/scoringEngine.ts` + `services/scoring/`
- `backend/src/sockets/` (`broadcastLeaderboard` con firma anti-duplicados + throttle)
- `backend/src/schemas/wod.ts`, `competencia.ts` (Zod, 6 mediciones)
- `backend/src/utils/archivos.ts` (borrado seguro anti-traversal)

## Convenciones
- Transacciones en `programarArranque` y subida de portadas.
- `mensajeSeguro` + `idDeRuta` desde `controllers/helpers.ts` para errores al cliente.
- `log.error`, nunca `console.error` en controladores.
- `as any` solo permitido en raw SQL / `.get()` de asociaciones.
- Rondas a nivel de competencia (`competencias.rondas`); sincronizar a esquemas `for_time`/`amrap`.
- `esquema` JSON canónico: `modalidad`, `movimientos[].reps/peso` por división; `GENERAL` = clave `General`.
