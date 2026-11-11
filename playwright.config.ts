import { defineConfig, devices } from '@playwright/test';

const porta = Number(process.env.E2E_PORT ?? 3102);
const baseURL = `http://127.0.0.1:${porta}`;
const chromium = { ...devices['Desktop Chrome'] };

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { open: 'never' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
      ]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'pt-PT',
    timezoneId: 'Africa/Maputo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'configuracao',
      testMatch: /auth\.setup\.ts/,
      use: chromium,
    },
    {
      name: 'publico',
      testMatch: /publico\.spec\.ts/,
      use: chromium,
    },
    {
      name: 'paciente',
      testMatch: /paciente\.spec\.ts/,
      dependencies: ['configuracao'],
      use: { ...chromium, storageState: 'tests/e2e/.auth/paciente.json' },
    },
    {
      name: 'medico',
      testMatch: /medico\.spec\.ts/,
      dependencies: ['configuracao'],
      use: { ...chromium, storageState: 'tests/e2e/.auth/medico.json' },
    },
    {
      name: 'secretario',
      testMatch: /secretario\.spec\.ts/,
      dependencies: ['configuracao'],
      use: { ...chromium, storageState: 'tests/e2e/.auth/secretario.json' },
    },
    {
      name: 'admin',
      testMatch: /admin\.spec\.ts/,
      dependencies: ['configuracao'],
      use: { ...chromium, storageState: 'tests/e2e/.auth/admin.json' },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `${baseURL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { ...process.env, E2E_PORT: String(porta) },
  },
});
