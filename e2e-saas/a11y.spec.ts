import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apiPost } from './helpers'

/**
 * Acessibilidade (WCAG 2.1 AA) dos ecrãs reais, com a empresa de demonstração da semente
 * (credenciais locais de infra/.env.example). Falha com violações sérias ou críticas.
 */
const EMAIL = process.env.ANDAIME_SEED_DEMO_OWNER_EMAIL ?? 'demo@andaime.test'
const PASSWORD = process.env.ANDAIME_SEED_DEMO_OWNER_PASSWORD ?? 'demo-local-andaime-2026'
const STATE = join(tmpdir(), `andaime-a11y-${process.pid}.json`)

function previousMonday(): string {
  const date = new Date()
  const sinceMonday = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - sinceMonday - 7)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const PAGES = [
  '/',
  '/planeamento',
  '/trabalhadores',
  '/equipas',
  '/obras',
  '/obras?vista=tabela',
  '/viaturas',
  '/horas',
  '/ausencias',
  '/documentos',
  '/equipamentos',
  '/mapas',
  '/relatorios',
  '/definicoes',
  '/definicoes/equipa',
  '/definicoes/regras',
  '/definicoes/auditoria',
  '/definicoes/conta',
]

async function violations(page: Page, label: string) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
  // Gavetas e diálogos entram com animação de opacidade: analisar só depois de assentarem.
  await page.waitForTimeout(500)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.leaflet-container').analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${label}: ${v.id} — ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`)
}

test.describe('acessibilidade dos ecrãs reais', () => {
  test.beforeAll(async ({ browser }) => {
    // Contexto próprio, sem o estado guardado (ainda não existe).
    const context = await browser.newContext({ storageState: undefined, baseURL: test.info().project.use.baseURL })
    const page = await context.newPage()
    await page.goto('/entrar')
    await page.getByLabel('Email').fill(EMAIL)
    await page.getByLabel('Palavra-passe').fill(PASSWORD)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).not.toHaveURL(/\/entrar/)
    await expect(page.getByRole('navigation').first()).toBeVisible()
    // A análise da gaveta da folha não depende da antiguidade da semente: se a semana anterior estiver vazia,
    // cria um registo manual real e idempotente para essa execução.
    const me = (await (await page.request.get('/api/me')).json()) as { activeOrgId: string }
    const week = previousMonday()
    const sheets = await page.request.get(`/api/orgs/${me.activeOrgId}/timesheets?week=${week}`)
    const rows = (await sheets.json()) as unknown[]
    if (rows.length === 0) {
      const employees = (await (await page.request.get(`/api/orgs/${me.activeOrgId}/employees?status=ACTIVE&size=1`)).json()) as { items: { id: string }[] }
      const sites = (await (await page.request.get(`/api/orgs/${me.activeOrgId}/sites?status=ACTIVE`)).json()) as { id: string }[]
      await apiPost(page, `/orgs/${me.activeOrgId}/time-entries`, {
        employeeId: employees.items[0]!.id,
        siteId: sites[0]!.id,
        date: week,
        start: '08:00',
        end: '16:00',
        breakMin: 60,
        reason: 'Preparação do teste de acessibilidade',
      })
    }
    await context.storageState({ path: STATE })
    await context.close()
  })
  test.use({ storageState: STATE })

  for (const path of PAGES) {
    test(`${path} sem violações sérias`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      // Garante que é o ecrã pedido e não o login (que também tem um título).
      await expect(page).not.toHaveURL(/\/entrar/)
      const found = await violations(page, path)
      expect(found, found.join('\n')).toEqual([])
    })
  }

  test('ficha, diálogo de escala e folha de horas sem violações sérias', async ({ page }) => {
    const found: string[] = []
    await page.goto('/trabalhadores')
    await page.locator('main a[href^="/trabalhadores/"]').first().click()
    await expect(page.getByRole('tab').first()).toBeVisible()
    found.push(...(await violations(page, 'ficha do trabalhador')))
    await page.goto('/planeamento')
    await page.getByRole('button', { name: 'Nova escala' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    found.push(...(await violations(page, 'nova escala')))
    await page.keyboard.press('Escape')
    await page.goto('/horas')
    await page.getByRole('button', { name: 'Semana anterior' }).click()
    await page.locator('tbody tr').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    found.push(...(await violations(page, 'folha de horas')))
    expect(found, found.join('\n')).toEqual([])
  })
})
