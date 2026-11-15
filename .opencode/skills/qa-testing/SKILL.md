---
name: qa-testing
description: Jest backend + Vitest frontend testing with coverage thresholds. Use when adding tests, touching resultService, competenciaService, scoring, sockets, juezMedicion utils, CompetenciaForm mapper, or running tsc and coverage.
---

# QA Testing — Competition Manager

Estado: backend 244 tests (16 suites), frontend 142 tests (19 archivos). `tsc --noEmit` limpio en ambos lados.

## Comandos
- Backend: `npm test` / `npm test -- --coverage` (threshold global 70%)
- Frontend: `npm test` / `npm test -- --coverage` (threshold global 50%)
- Siempre correr `tsc --noEmit` en el lado tocado antes de cerrar.

## Qué cubrir al cambiar
- `resultService.ts` ~100%: `getResultsByCompetencia`, flags `saveResult`, `resetResult`, `saveSplits`, `getSplits`.
- `competenciaService.ts` ~88%: `etiquetaCategoria`, `sanearDivisionesSalida`, CRUD + assign/remove.
- `scoring/`: convergencia con policy NONE (misma marca = mismo puesto/puntos); `getParticipantPosition` usa la misma `policy` que el leaderboard.
- Sockets: ACK en `lock-participant` (`{ok}` opcional), re-lock al reconectar, `join-competencia`, `competencia:start`.
- Offline sync (`useOfflineSync`): descartar 400/422/403/404/409-duplicado; conservar 409-pausa/429/red/500.
- Frontend puro: `utils/juezMedicion.ts` (valor bruto 8 ramas, detalle, división, rondas, `formatoTope`, `tiempoAms` — quirk: `'xx'` → `0`), `utils/competenciaFormMapper.ts`, `utils/unidadesMedicion.ts`.
- Componentes: `CronometroView` (4 tests), `MovimientoRow` (5), `useSubidaImagen` (7), `ContadorSerie` vs `ContadorEsquema` (mismo `detalle`).

## Convenciones
- Integration API con supertest (`api.integration.test.ts`); sockets con servidor real (`socket.integration.test.ts`).
- Smoke E2E en CI con token real de login; coverage como artifacts (14 días).
- No bajar thresholds para pasar; añadir tests del bug (409 pausa, 403 arranque, ER_DUP_ENTRY).
