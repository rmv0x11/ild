import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/ild/' : '/',
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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}));
