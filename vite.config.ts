import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import fs from 'node:fs';

export default defineConfig(({ command, mode }) => ({
  // The Capacitor native build (`vite build --mode capacitor`) serves its assets
  // from the WebView root (capacitor://localhost / https://localhost), so it must
  // use base '/', NOT the GitHub Pages subpath '/ild/' (which would 404 every
  // asset inside the app). That mode also loads `.env.capacitor`, which blanks
  // VITE_API_URL → the shipped app is fully offline / local-only (hasApi() is
  // false, AuthContext degrades to guest), satisfying Apple's airplane-mode test.
  base: command === 'build' && mode !== 'capacitor' ? '/ild/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    // Installable PWA + offline service worker. Disabled for the Capacitor
    // build (native shell bundles assets locally and WKWebView has no usable
    // service worker) and for the test run.
    VitePWA({
      disable: mode === 'capacitor' || mode === 'test',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'ild · китайский по карточкам',
        short_name: 'ild',
        description:
          'Интервальные повторения китайских иероглифов: иероглиф → пиньинь с озвучкой → перевод.',
        lang: 'ru',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        categories: ['education'],
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/pwa-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
    {
      name: 'spa-404-fallback',
      apply: 'build',
      closeBundle() {
        const dist = path.resolve(__dirname, 'dist');
        fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['localhost', '127.0.0.1', 'dev', 'ild-dev', 'host.docker.internal'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'dist', '.claude/**'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      reporter: ['text', 'text-summary', 'html'],
    },
  },
}));
