import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works from https://<user>.github.io/<repo>/
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), spike: resolve(import.meta.dirname, 'spike/index.html') } },
  },
  worker: { format: 'es' },
});
