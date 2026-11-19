import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    css: false,
    coverage: {
      // La política de cobertura vive en `.coverage-floors.json` y en `scripts/coverage-gate.mjs`:
      // suelo global que solo sube + archivos tocados con >= 80 % de líneas.
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      // Contenido estático y tipos: no hay lógica que probar, medirlos distorsiona el número.
      exclude: ['src/data/**', 'src/types/**', 'src/**/*.d.ts', 'src/__tests__/**'],
    },
  },
});
