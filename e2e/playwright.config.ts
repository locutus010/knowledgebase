import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: process.env.KB_URL ?? 'http://localhost:8080',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 1360, height: 860 },
    trace: 'retain-on-failure',
  },
})
