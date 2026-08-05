import { defineConfig, devices } from '@playwright/test';

/**
 * Test end-to-end.
 *
 * Richiedono un'istanza funzionante con Supabase configurato:
 *   1. copia `.env.example` in `.env.local` e compila le variabili;
 *   2. applica le migrazioni;
 *   3. esegui `npm run test:e2e`.
 *
 * Le credenziali di prova si impostano con E2E_EMAIL / E2E_PASSWORD.
 * Se non sono presenti, i test creano un account temporaneo.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
