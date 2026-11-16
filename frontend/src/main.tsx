import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * Reporte de errores de frontend (área 1: monitoreo).
 *
 * Sin dependencia de Sentry en el bundle: los fallos se envían a
 * POST /api/errores (throttle 1/min) y el backend los registra en su log
 * estructurado y en Sentry si tiene DSN. Ver `api/client.ts`.
 */
import { reportarErrorFrontend } from './api/client';

window.addEventListener('error', (e) => {
  reportarErrorFrontend(e.error ?? e.message, { fuente: 'window.onerror' });
});
window.addEventListener('unhandledrejection', (e) => {
  reportarErrorFrontend(e.reason, { fuente: 'unhandledrejection' });
});

// En desarrollo se retira cualquier service worker previo: si no, sirve una
// version cacheada del bundle y los cambios no aparecen.
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((registros) => {
    registros.forEach((registro) => registro.unregister());
  });
  caches?.keys().then((claves) => claves.forEach((clave) => caches.delete(clave)));
}

// En produccion el service worker da el modo offline de la PWA.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app funciona igual, solo pierde el modo offline.
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
