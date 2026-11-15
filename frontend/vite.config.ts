import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // H7: Code splitting — separar vendor en chunks dedicados para mejor cache.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-socket': ['socket.io-client'],
          'vendor-ui': ['lucide-react', 'zod'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Escucha en todas las interfaces para que otros equipos de la red local
    // entren por la IP del host. El backend sigue solo en localhost: /api y
    // /socket.io llegan a el a traves de este proxy.
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            const setCookies = proxyRes.headers['set-cookie'];
            if (setCookies) {
              // Rewrite cookies to work with the proxy origin
              proxyRes.headers['set-cookie'] = setCookies.map((cookie) =>
                cookie
                  .replace(/;\s*Secure/gi, '')
                  .replace(/;\s*SameSite=\w+/gi, '; SameSite=Lax')
              );
            }
          });
        },
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});
