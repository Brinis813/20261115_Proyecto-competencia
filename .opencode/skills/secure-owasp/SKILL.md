---
name: secure-owasp
description: OWASP hardening for JWT cookie, rate-limit, Zod, uploads, CORS, sockets. Use when touching auth, cookies, rateLimiter, uploads, CORS, Helmet, sockets, or auditing BOLA, CSRF, XSS, traversal.
---

# Secure OWASP — Competition Manager

## Reglas de oro
- JWT exclusivamente en cookie HttpOnly (`SameSite=strict`, `secure` en prod). Nunca en `localStorage` ni en body de respuesta.
- JWT 4h + `/auth/refresh` con vida absoluta 7 días (`origenMs`). Auto-refresh frontend cada 3h.
- `JWT_SECRET` mínimo 32 chars, rechazar patrones débiles al startup.
- Rate limiting 3 capas: global 300/min, auth 20/min, por rol. Stores con cleanup periódico y tope 100K entradas. Devolver `Retry-After` en 429/503.
- Validar todo input con Zod: body/params/query + 6 eventos WebSocket. Cota anti-DoS en `detalle` JSON.
- Subidas: JPG/PNG/WebP 5MB, verificación real por magic bytes, `UPLOADS_DIR` validado al startup, borrado seguro vía `utils/archivos.ts` (robusto en Windows).
- Socket acepta JWT por cookie HttpOnly. Throttles en `lock`/`unlock`/`join-competencia`. `maxHttpBufferSize` 64KB.
- `CORS_ORIGIN='*'` prohibido en producción. `trust proxy` validado (0-4).
- Helmet CSP en producción. Stack traces solo en dev (`import.meta.env.DEV`).
- Errores al cliente siempre vía `mensajeSeguro` (cubre `dup_entry`, `foreign key`, `deadlock`). Nunca filtrar SQL ni paths.
- BOLA: todo `:id` debe comprobar evento/box del usuario vía `resolverEvento`/`puedeEditar()`. Revisar cross-evento en cada DELETE/PUT.

## Archivos clave
- `backend/src/middleware/auth.ts`, `rateLimiter.ts`, `evento.ts`, `handleMulterError.ts`
- `backend/src/controllers/helpers.ts`, `authController.ts`, `resultController.ts`
- `backend/src/index.ts` (Helmet, trust proxy, graceful shutdown 30s, unhandledRejection)
- `frontend/src/api/client.ts` (solo cookie, 401 selectivo sin limpiar en `/auth/login`, `/auth/me`)

## Verificación
- Suite `errores400` (23 tests): Zod, cota `detalle`, JSON roto, 404 JSON, 409 duplicado/pausa, 429+`Retry-After`, traversal.
- `tsc --noEmit` limpio en ambos lados antes de dar por hecho.
