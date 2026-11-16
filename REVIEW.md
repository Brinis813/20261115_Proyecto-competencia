# REVIEW.md — qué mira quien revisa este repositorio

Se lee **antes** de cualquier revisión. Se enmienda como la constitución
(`02-DOCS/wiki/sdd/constitution.md`), nunca en silencio.

## Cómo se abre un comentario

La primera línea del resumen es un recuento: `3 hallazgos: 1 bloqueante, 2 menores`. Después, el
detalle. Como mucho **3 comentarios menores** por revisión; el resto se descarta.

## Qué cuenta como fallo aquí

Estos son los defectos que de verdad duelen en este producto. Si aparece uno, es hallazgo; el orden
es de gravedad:

1. **Consulta sin filtro de dueño.** Cualquier lectura o escritura de competencia, wod, heat,
   atleta o resultado que no filtre por evento/competencia. Es fuga entre organizadores.
2. **Medida perdida o duplicada en pista.** En el panel del juez (cola offline, IndexedDB, reintento
   al volver la red, bloqueo de atleta concurrente). El atleta no puede perder un resultado.
3. **Orden de clasificación incorrecto.** Empates, `DNF`, `capado`, penalizaciones o puntuación por
   categoría: si el número que ve el público está mal, el evento se cae.
4. **Migración no idempotente.** Un cambio en `backend/src/db/schema.ts` que falla al ejecutarse dos
   veces o que no puede correr sobre datos existentes.
5. **Secreto o dato personal expuesto.** Contraseñas, `JWT_SECRET`, cédula o fecha de nacimiento en
   el repositorio, en una respuesta pública o en un registro.
6. **Tiempo real sin autenticar.** Evento de Socket.IO que emite o acepta datos sin comprobar sesión
   y sala.
7. **Cambio de comportamiento sin prueba.** Regla 5 de la constitución.

## Qué no se revisa

- `node_modules/`, `dist/`, `coverage/`, `frontend/public/sw.js` generado y `package-lock.json`
  (salvo que cambie sin cambio en `package.json`).
- `ejemplos/` y `docs/superpowers/` son material de apoyo, no código de producción.
- Estilo que el formateador ya decide: no se comenta a mano lo que Prettier arregla solo.

## Rutas que exigen una persona antes de fusionar

Estas rutas no se fusionan sin que una persona las lea y diga sí:

- `backend/src/middleware/auth.ts`, `backend/src/services/authService.ts` — sesión y permisos.
- `backend/src/db/schema.ts` y `backend/src/db/repairs/` — esquema y reparaciones de datos.
- `.github/workflows/` — la puerta del CI.
- `docker-compose.yml`, `Dockerfile`, `frontend/nginx.conf`, `frontend/security-headers.conf` —
  despliegue y cabeceras.
- Cualquier `.env*` o archivo que toque secretos.

Esto informa; para que se **impida** automáticamente hace falta activar `sello` con
`risk.raise` en `.rsc/sello-config.json` (hoy está desactivado).
