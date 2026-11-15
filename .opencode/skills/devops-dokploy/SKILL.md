---
name: devops-dokploy
description: Docker Compose + Dokploy deploy with nginx, healthchecks, volumes. Use when touching Dockerfiles, docker-compose.yml, nginx.conf, .env, start.bat, deploy, health, ports, or backups.
---

# DevOps Dokploy — Competition Manager

Topología: MySQL 8 + backend + frontend/nginx (puerto 80/8080). Solo frontend expuesto; `/api` y `/socket.io` por red interna. Portadas en volumen `backend_uploads` servidas en `/api/uploads`.

## Reglas de oro
- `docker compose -p proyecto-competencia up -d --build` — el `-p` reutiliza volúmenes y conserva la BD. `down` sin `-v` no borra datos.
- `.env` se copia a mano en servidor (no va en git). Repo de despliegue: `Brinis813/New-Proyecto-Competence` rama `main`, proyecto anidado en `proyecto-competencia-dev-joel/proyecto-competencia-dev-joel/`. Clon exige PAT con scope `repo`.
- Backend: healthcheck HTTP real (200, con `Retry-After` en 503), `stop_grace_period` 35s, memoria 768M, puerto vía `BACKEND_PORT`.
- Frontend nginx: `upstream keepalive` 32, `gzip_proxied any`, `no-cache` en `/`, `USER nginx`, listen 8080 (evita conflicto con `cap_drop`), `client_max_body_size` 8MB.
- MySQL: backup sidecar con tmpfs + healthcheck + rotación de logs; `pids_limit` (mysql 200, backup 50, backend 200, frontend 100). Ojo: `cap_drop` + `no-new-privileges` tumban mysqld 8.0.46 — dejar comentados en `mysql`.
- Contenedores con `read_only` + `cap_drop ALL` + `no-new-privileges` donde no rompa (frontend necesita tmpfs con `uid=101,gid=101`).
- npm cache mounts en ambos Dockerfiles para builds rápidos. Sin `npm cache clean` redundante.
- `/api/health` puede dar 503 `degraded` por `socket.stale` (sin broadcasts en ~1h) — es criterio estricto, no caída.

## Local
- Requisitos: Node 18+, MySQL 8. `cp backend/.env.example backend/.env`, luego `start.bat` (instala, levanta ambos, abre navegador en `:5173`; Vite proxea `/api` y `/socket.io` a `:3001`).
