import { defineConfig, devices } from '@playwright/test'

/** E2E contra um build em modo "e2e" (expõe a store em window.__andaime só para verificação). Usa o Edge instalado. */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4823',
    trace: 'retain-on-failure',
    locale: 'pt-PT',
    channel: 'msedge',
    acceptDownloads: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: 'tablet', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 834, height: 1112 } }, grep: /@responsive/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'msedge' }, grep: /@responsive|@mobile/ },
  ],
  webServer: {
    command: 'npx vite build --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4823 --strictPort',
    url: 'http://localhost:4823',
    reuseExistingServer: false,
    timeout: 240_000,
  },
})
