import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
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
