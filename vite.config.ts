import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const base = process.env.BASE_URL ?? (process.env.GITHUB_ACTIONS ? '/terralearn/' : '/');

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/types.ts', 'src/main.ts'],
    },
  },
});
