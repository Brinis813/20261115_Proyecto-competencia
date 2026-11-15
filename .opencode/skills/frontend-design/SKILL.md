---
name: frontend-design
description: React 18 + Vite + Tailwind UI for admin, judge mobile, and public leaderboards. Use when touching pages/admin, pages/judge, pages/public, CompetenciaForm, PortadaImagen, CronometroView, ContadorSerie, leaderboard, or juez medición.
---

# Frontend Design — Competition Manager

Stack: React 18, Vite, Tailwind, Router 6, axios, Zustand, Socket.IO client. `App.tsx` con `React.lazy` + `Suspense`; `manualChunks` (vendor-react, vendor-socket, vendor-ui).

## Patrones por área
- **Admin `CompetenciaForm.tsx` (3 niveles)**: Nivel 1 datos + lista WODs con orden (subir/bajar, +Añadir marrón). Nivel 2 bloque rojo por WOD (nombre/formato con descripción AMRAP/EMOM/For Time/Chipper, Medición 6 tipos, puntaje máximo). Nivel 3 banda verde por categoría (movimientos nombre/unidad/reps/peso; +Añadir movimiento amarillo). Validar obligatorios, resaltar en rojo + scroll al primero. Numéricos con autoselect al enfocar. Selector WOD desempate solo con política designada.
- **Juez móvil**: `JuezMedicionPage.tsx` delgada — lógica pura en `utils/juezMedicion.ts`. `CronometroView.tsx` con estado propio (tick ~10/s aislado, lectura por ref). `ContadorSerie.tsx` si `en_serie` (secuencial, rondas X/Y, avance bloqueado); `ContadorEsquema.tsx` si estaciones. Calorías siempre manuales. Tiempo en MM:SS con barra y auto-avance. Botones −/+ 80px. Congelar todo en pausa/capado/finalizado (se puede enviar, servidor decide 409). Re-lock al reconectar con ACK.
- **Público**: tarjetas estilo app eventos (píldora En vivo pulsante, insignia fecha sobre portada, grupos En curso/Próximas/Pasadas). `PortadaImagen`: marco 16:9, `object-contain` + fondo difuminado, sin recortes.
- **Imágenes**: hook `useSubidaImagen.ts` para portadas evento/competencia y `ImagenWod.tsx` por ejercicio. JPG/PNG/WebP 5MB.

## Archivos clave
- `frontend/src/pages/admin/CompetenciaForm.tsx`, `utils/competenciaFormMapper.ts`, `components/admin/{MovimientoRow,PortadaCompetencia,ImagenWod,ResumenCompetencia,ArranqueControl}.tsx`
- `frontend/src/pages/judge/JuezMedicionPage.tsx`, `components/judge/{CronometroView,ContadorSerie,ContadorEsquema,CompetenciaStartBanner}.tsx`, `utils/juezMedicion.ts`
- `frontend/src/api/client.ts` (cookie HttpOnly, 401 selectivo), `stores/competenciaStartStore.ts`, `components/ErrorBoundary.tsx` (reporta a `POST /api/errores` en prod)
