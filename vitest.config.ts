import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Pruebas de seguridad. Se ejecutan DENTRO del contenedor (necesitan la base de datos y las
// variables de entorno):   docker exec kijutech_app pnpm test
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // `server-only` lanza error fuera de Next.js; aquí es un archivo vacío.
      'server-only': path.resolve(__dirname, 'tests/mocks/server-only.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Los tests comparten la base de datos de desarrollo: uno detrás de otro.
    fileParallelism: false
  }
});
