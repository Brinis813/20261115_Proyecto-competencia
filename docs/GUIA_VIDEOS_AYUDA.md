# Guía: generar los vídeos y GIFs de la sección de ayuda

## Lo que un agente no puede hacer

Claude Code (yo incluido) **no puede instalar extensiones en tu navegador** ni grabar
la pantalla: no tiene acceso al navegador que tú usas ni a un escritorio con vídeo.
Cualquier extensión de tipo Loom, Screencastify o Awesome Screenshot tienes que
instalarla tú a mano.

La buena noticia es que **no hace falta ninguna extensión**. Playwright graba vídeo
de forma nativa, y eso sí lo puede ejecutar Claude Code de principio a fin: abre la
app, hace login, navega, y deja los `.webm` y los `.gif` en disco. Es además
reproducible: cuando cambie la interfaz, se vuelve a lanzar el script y los vídeos
se regeneran solos, sin volver a grabar nada a mano.

---

## Estado actual

La aplicación **todavía no tiene sección de ayuda**. La navegación (`NAV_ADMIN`,
`NAV_JUEZ`, `NAV_PARTICIPANTE` en `frontend/src/components/layout/AppShell.tsx`) no
incluye ninguna entrada de ayuda, y no existe ninguna página que consuma vídeos.
Lo que sí hay es el manual escrito en `MANUAL_USUARIO.md`.

Por eso el trabajo son dos encargos separados, y conviene pedirlos en este orden:

1. Crear la página de ayuda (con sus rutas y su entrada en el menú).
2. Generar los vídeos/GIFs y enchufarlos en esa página.

---

## Preparación (una sola vez)

```bash
# 1. Levanta la base de datos local y la app
docker compose -p mysql -f docker-compose.local-db.yml up -d
start.bat            # backend + frontend (frontend en http://localhost:5173)

# 2. Instala Playwright y ffmpeg en el proyecto
cd frontend
npm install -D @playwright/test
npx playwright install chromium
```

`ffmpeg` es lo que convierte el `.webm` en `.gif`. En Windows:
`winget install Gyan.FFmpeg` (o `choco install ffmpeg`).

Necesitas además un usuario admin de prueba con datos ya cargados: si grabas sobre
una base vacía los vídeos salen con pantallas en blanco.

---

## Script de grabación

Guárdalo como `frontend/e2e/grabar-ayuda.spec.ts`.

Los selectores son los reales de la app: el componente `Field`
(`frontend/src/components/ui/index.tsx`) pinta un `<label htmlFor>` por cada campo,
así que `getByLabel('Cedula')` y `getByLabel('Contrasena')` funcionan tal cual.

```ts
import { test, expect } from '@playwright/test';

// Ajusta estas credenciales a tu usuario admin de pruebas.
const ADMIN = { cedula: '0000000000', password: 'admin123' };

test.use({
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  viewport: { width: 1280, height: 720 },
  // Un ritmo lento se entiende mucho mejor en un tutorial.
  launchOptions: { slowMo: 400 },
});

async function login(page) {
  await page.goto('http://localhost:5173/login');
  await page.getByLabel('Cedula').fill(ADMIN.cedula);
  await page.getByLabel('Contrasena').fill(ADMIN.password);
  await page.getByRole('button', { name: /entrar|acceder/i }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test('crear una competencia de evento', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Competencias' }).click();
  await page.getByRole('link', { name: /nuevo competencia/i }).click();

  await page.getByLabel('Nombre').fill('Competencia 1 - Funcional');
  await page.getByLabel('Tipo de participacion').selectOption('Duplas');
  await page.getByLabel('Duracion / time cap (min)').fill('20');
  await page.getByLabel('Divisiones / categorias').fill('Rx, Scaled');

  // Un ejercicio con su medición
  await page.getByLabel('Ejercicio').first().fill('500m Row');
  await page.getByLabel('Medicion').first().selectOption('calorías');

  await page.getByRole('button', { name: /crear competencia/i }).click();
  await expect(page).toHaveURL(/\/admin\/competencias$/);
});

test('registrar una medición como juez', async ({ page }) => {
  await login(page);
  await page.goto('http://localhost:5173/juez');
  // ...completa según el flujo que quieras enseñar
});
```

Lánzalo:

```bash
npx playwright test e2e/grabar-ayuda.spec.ts
```

Los vídeos quedan en `test-results/**/video.webm`.

---

## Convertir a GIF

Un `.webm` de 20 s ocupa ~300 KB; el mismo GIF puede irse a 8 MB. Usa la paleta de
dos pasadas para que pese poco y no se vea sucio:

```bash
# 1. Paleta óptima de colores
ffmpeg -i video.webm -vf "fps=12,scale=900:-1:flags=lanczos,palettegen" -y paleta.png

# 2. GIF final usando esa paleta
ffmpeg -i video.webm -i paleta.png \
  -lavfi "fps=12,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse" \
  -y frontend/public/ayuda/crear-competencia.gif
```

**Recomendación:** para la sección de ayuda usa `.webm`/`.mp4` con `<video autoplay
loop muted playsinline>`, no GIF. Pesa entre 5 y 10 veces menos, se ve más nítido y
el usuario puede pausarlo. Deja el GIF solo para lo que tenga que verse en un correo
o en WhatsApp, donde el vídeo no se reproduce solo.

Guarda los archivos en `frontend/public/ayuda/` para que Vite los sirva tal cual
desde `/ayuda/<nombre>.webm`.

---

## Qué pedirle a Claude Code

Copia y pega estos mensajes, en este orden.

### 1. Crear la sección de ayuda

```
Crea una sección de ayuda en la app:

- Página `frontend/src/pages/HelpPage.tsx` con la estructura habitual (AppShell),
  organizada por rol: administrador, juez y participante.
- Ruta `/ayuda` en `App.tsx`, accesible a cualquier usuario con sesión iniciada.
- Entrada "Ayuda" con el icono `HelpCircle` en NAV_ADMIN, NAV_JUEZ y
  NAV_PARTICIPANTE de `AppShell.tsx`.
- Cada apartado: título, explicación corta y un hueco para el vídeo, con un
  componente `<VideoAyuda src="/ayuda/xxx.webm" titulo="..." />` que renderice
  `<video autoplay loop muted playsinline controls>` y muestre un texto de
  respaldo si el archivo aún no existe.
- El contenido de los textos sácalo de MANUAL_USUARIO.md, no lo inventes.

Al terminar comprueba que `npm run build` del frontend pasa sin errores.
```

### 2. Grabar los vídeos

```
Sigue docs/GUIA_VIDEOS_AYUDA.md y genera los vídeos de la sección de ayuda:

1. Instala Playwright y crea `frontend/e2e/grabar-ayuda.spec.ts`.
2. Graba estos flujos, uno por vídeo:
   - Crear una competencia de evento (tipo de participación, duración/time cap,
     ejercicios con sus mediciones)
   - Dar de alta categorías
   - Registrar atletas y asignarlos a un juez
   - Medir un WOD como juez
   - Consultar la clasificación pública
3. Convierte cada uno con ffmpeg y déjalos en `frontend/public/ayuda/`.
4. Enlázalos desde la página de ayuda.

La app tiene que estar levantada en http://localhost:5173 con datos de prueba.
Si algún selector falla, corrígelo mirando el componente real, no lo adivines.
```

---

## Si prefieres grabarlos a mano

| Herramienta | Dónde | Notas |
|---|---|---|
| **Xbox Game Bar** | `Win + G`, ya viene en Windows | Lo más rápido; graba en `.mp4` |
| **ShareX** | `winget install ShareX` | Gratis y libre; exporta a GIF directamente |
| **ScreenToGif** | `winget install NickeManarin.ScreenToGif` | Pensado para GIFs, con editor cuadro a cuadro |
| **Loom** | extensión de Chrome | Cómodo, pero sube el vídeo a su nube |

Grábalos a 1280×720, sin audio, y déjalos igualmente en `frontend/public/ayuda/`.
