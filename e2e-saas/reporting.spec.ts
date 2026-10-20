import { expect, test } from '@playwright/test'
import { apiPost, managerWithCompany, run } from './helpers'

function nextMonday(): string {
  const value = new Date()
  value.setDate(value.getDate() + ((8 - value.getDay()) % 7 || 7))
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function plusDays(iso: string, days: number) {
  const value = new Date(`${iso}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

test('mapa, relatório e exportação assíncrona usam o planeamento real', async ({ page }) => {
  const orgId = await managerWithCompany(page, 'gestora-f6', `Relatórios F6 ${run}`)
  const employee = await apiPost<{ id: string }>(page, `/orgs/${orgId}/employees`, { fullName: 'Ana Relatório', category: 'Pedreiro' })
  const site = await apiPost<{ id: string }>(page, `/orgs/${orgId}/sites`, { name: 'Obra Relatório', country: 'PT', code: 'OB-E2E-F6' })
  const team = await apiPost<{ id: string }>(page, `/orgs/${orgId}/teams`, { name: 'Equipa Relatório', color: '#2a78d6' })
  await apiPost(page, `/orgs/${orgId}/teams/${team.id}/members`, { employeeId: employee.id })
  const monday = nextMonday()
  await apiPost(page, `/orgs/${orgId}/planning/commands`, {
    kind: 'ASSIGN', employeeId: employee.id, siteId: site.id, date: monday,
    start: '08:00', end: '17:00', foreman: true, note: 'Montagem E2E',
  })

  await page.goto(`/mapas?semana=${monday}`)
  await expect(page.getByRole('heading', { name: 'Mapas semanais' })).toBeVisible()
  await expect(page.locator('main table').getByText('Equipa Relatório').first()).toBeVisible()
  await expect(page.locator('main table').getByText(/OB-E2E-F6/).first()).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar Excel' }).click()
  expect((await download).suggestedFilename()).toMatch(/^mapa-equipa-semana-.*\.xlsx$/)
  await expect(page.getByText('Excel exportado')).toBeVisible()

  await page.goto(`/relatorios?de=${monday}&ate=${plusDays(monday, 6)}`)
  await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible()
  await expect(page.locator('main table').getByText('Equipa Relatório').first()).toBeVisible()
  await expect(page.locator('main table').getByText(/OB-E2E-F6/).first()).toBeVisible()
  await expect(page.getByText('8 h').first()).toBeVisible()
})
