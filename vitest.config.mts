import { defineConfig } from 'vitest/config';
import { urlBaseDados } from './tests/urlBaseDados';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    setupFiles: ['tests/setup.ts'],
    // Cada execucao usa um schema PostgreSQL isolado (base "mediagenda").
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? urlBaseDados('test'),
      SESSION_SECRET: 'mediagenda-test-secret',
    },
    testTimeout: 20_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/types/**'],
      thresholds: {
        lines: 35,
        functions: 30,
        branches: 20,
        statements: 35,
      },
    },
  },
});
