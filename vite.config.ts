import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works from https://<user>.github.io/<repo>/
  base: './',
  build: {
    target: 'es2022',
    // cubing.js starts its scramble worker from a bundled entry chunk; Vite's preload helper in that
    // chunk touches `document`, which doesn't exist in a worker. Without it the worker starts.
    modulePreload: false,
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), spike: resolve(import.meta.dirname, 'spike/index.html') } },
  },
  worker: { format: 'es' },
});
