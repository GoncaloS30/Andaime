import { expect, test } from '@playwright/test'
import { apiPost, managerWithCompany, run } from './helpers'

/** Segunda-feira da próxima semana (sempre futura, para poder planear). */
function nextMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('planear uma semana: atribuir, ver o conflito bloqueado, anular e ligar uma viatura', async ({ page }) => {
  const orgId = await managerWithCompany(page, 'gestora-f3', `Planeamento F3 ${run}`)
  const ana = await apiPost<{ id: string }>(page, `/orgs/${orgId}/employees`, { fullName: 'Ana Planeada', category: 'Pedreiro' })
  await apiPost(page, `/orgs/${orgId}/sites`, { name: 'Obra Norte', country: 'PT', code: 'OB-E2E-001' })
  await apiPost(page, `/orgs/${orgId}/sites`, { name: 'Obra Sul', country: 'PT', code: 'OB-E2E-002' })
  const monday = nextMonday()
  const [, m, d] = monday.split('-')

  await page.goto('/planeamento')
  await expect(page.getByRole('heading', { name: 'Planeamento' })).toBeVisible()
  await page.getByRole('button', { name: 'Semana seguinte' }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^${d}/${m}/.* – `) })).toBeVisible()

  // Atribuir a partir da célula.
  await page.getByRole('button', { name: `Atribuir Ana Planeada em ${d}/${m}/${monday.slice(0, 4)}` }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Obra', { exact: true }).selectOption({ label: 'OB-E2E-001 · Obra Norte' })
  await dialog.getByRole('button', { name: 'Atribuir' }).click()
  await expect(page.getByRole('button', { name: /OB-E2E-001 08:00–17:00, 8 h/ })).toBeVisible()

  // Sobreposição noutra obra: o servidor bloqueia e nada é gravado.
  await page.getByRole('button', { name: `Atribuir Ana Planeada em ${d}/${m}/${monday.slice(0, 4)}` }).click()
  await dialog.getByLabel('Obra', { exact: true }).selectOption({ label: 'OB-E2E-002 · Obra Sul' })
  await dialog.getByLabel('Início', { exact: true }).fill('16:00')
  await dialog.getByLabel('Fim', { exact: true }).fill('20:00')
  await dialog.getByRole('button', { name: 'Atribuir' }).click()
  await expect(page.getByText(/sobrepost/i).first()).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.locator('[data-assignment]')).toHaveCount(1)

  // Anular a última alteração.
  await page.getByTitle(/^Anular: /).click()
  await expect(page.locator('[data-assignment]')).toHaveCount(0)

  // Viatura ligada à equipa entra automaticamente nas atribuições.
  const team = await apiPost<{ id: string }>(page, `/orgs/${orgId}/teams`, { name: 'Equipa E2E', color: '#2a78d6' })
  await apiPost(page, `/orgs/${orgId}/teams/${team.id}/members`, { employeeId: ana.id })
  await page.goto('/viaturas')
  await page.getByRole('button', { name: 'Nova viatura' }).click()
  await page.getByRole('dialog').getByLabel('Matrícula').fill('e2-00-ee')
  await page.getByRole('dialog').getByLabel('Lugares').fill('3')
  await page.getByRole('dialog').getByRole('button', { name: 'Criar viatura' }).click()
  await expect(page.getByText('E2-00-EE').first()).toBeVisible()
  await page.goto(`/equipas/${team.id}`)
  await page.getByLabel('Viatura da equipa').selectOption({ label: 'E2-00-EE · 3 lugares' })
  await expect(page.getByText('Viatura da equipa atualizada a partir de hoje')).toBeVisible()

  await page.goto('/planeamento')
  await page.getByRole('button', { name: 'Semana seguinte' }).click()
  await page.getByRole('button', { name: `Atribuir Ana Planeada em ${d}/${m}/${monday.slice(0, 4)}` }).click()
  await dialog.getByLabel('Obra', { exact: true }).selectOption({ label: 'OB-E2E-001 · Obra Norte' })
  await dialog.getByRole('button', { name: 'Atribuir' }).click()
  await expect(page.getByRole('button', { name: /viatura E2-00-EE/ })).toBeVisible()
})
