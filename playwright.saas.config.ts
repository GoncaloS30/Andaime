import { defineConfig, devices } from '@playwright/test'

/**
 * E2E de ponta a ponta contra o Andaime real: frontend (Vite) + API Spring Boot + PostgreSQL + Mailpit.
 * Não usa dados simulados. Pré-requisito: infraestrutura e API a correr (ver docs/backend/estado.md):
 *   wsl -d Ubuntu -- docker compose -f infra/compose.yaml up -d postgres mailpit
 *   API em http://localhost:8088 (perfil local)
 */
export default defineConfig({
  testDir: './e2e-saas',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4824',
    trace: 'retain-on-failure',
    locale: 'pt-PT',
    channel: 'msedge',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npx vite --port 4824 --strictPort',
    url: 'http://localhost:4824',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
