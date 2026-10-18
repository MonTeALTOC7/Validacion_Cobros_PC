import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// La app se publica en GitHub Pages bajo /Validacion_Cobros_PC/ con rutas relativas.
// El build se genera en app/dist y `npm run release` lo copia a la raíz del repositorio.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Explicit release metadata: identical sources must build identically on another day.
    __BUILD_DATE__: JSON.stringify('2026-10-18'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          storage: ['dexie'],
          spreadsheet: ['xlsx'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['icon.svg', 'casur-mark.svg', 'casur-logo.png'],
      manifest: {
        name: 'Conciliador Nómina–Prefactura CASUR',
        short_name: 'Conciliador CASUR',
        description: 'Auditoría semanal de Nómina y Prefactura SIAGRI',
        start_url: './',
        display: 'standalone',
        background_color: '#f4f7f4',
        theme_color: '#0b4f3c',
        lang: 'es',
        scope: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // Los Excel de datos/ se descargan siempre de la red (no-store); no se precachean.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/golden/**/*.test.js'],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
