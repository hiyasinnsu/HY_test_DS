import { defineConfig } from 'vite';

// Relative asset URLs so the bundle runs from a GitHub Pages project subpath.
// NOTE: kept as plain .mjs (not .ts) because this workspace cannot spawn child
// processes, which Vite needs to transpile a TypeScript config file.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0, sourcemap: false },
  server: { host: true },
});

