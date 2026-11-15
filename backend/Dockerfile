# Se usa la variante Debian slim en lugar de Alpine porque bcrypt es un modulo
# nativo: sobre glibc instala su binario precompilado, mientras que sobre musl
# tendria que compilarse desde fuente en cada build.

# ---------- Compilacion ----------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Ejecucion ----------
FROM node:20-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# El proceso no corre como root: si alguien logra ejecutar codigo dentro del
# contenedor, no tiene privilegios para modificar la imagen. La carpeta de
# portadas debe pertenecerle para poder guardarlas (persiste con volumen).
RUN mkdir -p /app/uploads/competencias && chown -R node:node /app/uploads
USER node

EXPOSE 3001

# Docker y Dokploy usan este health check para saber cuando el contenedor esta
# listo y para reiniciarlo si deja de responder. El puerto sale de PORT (no
# hardcoded): con BACKEND_PORT distinto de 3001 el probe fijo marcaba
# unhealthy eternamente y Dokploy nunca promovia.
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "const p=process.env.PORT||'3001';fetch('http://127.0.0.1:'+p+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
