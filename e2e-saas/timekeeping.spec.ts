import { expect, test } from '@playwright/test'
import { acceptInvitation, apiPost, apiPut, managerWithCompany, run } from './helpers'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('o trabalhador pica o ponto na app e o gestor aprova a semana, que fica fechada', async ({ page, browser }) => {
  const orgId = await managerWithCompany(page, 'gestora-f4', `Horas F4 ${run}`)
  const rui = await apiPost<{ id: string }>(page, `/orgs/${orgId}/employees`, { fullName: 'Rui Ponto', category: 'Servente' })
  const site = await apiPost<{ id: string }>(page, `/orgs/${orgId}/sites`, { name: 'Obra Ponto', country: 'PT', code: 'OB-E2E-010', status: 'ACTIVE' })
  await apiPost(page, `/orgs/${orgId}/planning/commands`, {
    kind: 'ASSIGN', employeeId: rui.id, siteId: site.id, date: today(), start: '00:30', end: '06:30', foreman: true,
  })
  const email = `trabalhador-f4-${run}@andaime.test`
  await apiPost(page, `/orgs/${orgId}/invitations`, { email, role: 'WORKER' })

  // O trabalhador entra com a sua conta; o escritório liga a conta à ficha.
  const worker = await (await browser.newContext()).newPage()
  await acceptInvitation(worker, 'Rui Ponto', email)
  await expect(worker).toHaveURL(/\/app$/)
  await expect(worker.getByText('Conta por ligar')).toBeVisible()
  const members = (await (await page.request.get(`/api/orgs/${orgId}/members`)).json()) as { id: string; email: string }[]
  await apiPut(page, `/orgs/${orgId}/members/${members.find((m) => m.email === email)!.id}/employee`, { employeeId: rui.id })

  // Entrada, pausa e saída pela app.
  await worker.reload()
  await expect(worker.getByText('OB-E2E-010 · 00:30–06:30')).toBeVisible()
  await worker.getByRole('button', { name: 'Registar entrada' }).click()
  await expect(worker.getByText('A trabalhar')).toBeVisible()
  await worker.getByRole('button', { name: 'Pausa' }).click()
  await expect(worker.getByText('Em pausa')).toBeVisible()
  await worker.getByRole('button', { name: 'Registar saída' }).click()
  await expect(worker.getByRole('button', { name: 'Registar entrada' })).toBeVisible()

  // O gestor vê a folha, aprova e a semana fica fechada.
  await page.goto('/horas')
  await page.getByRole('button', { name: 'Rui Ponto' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('OB-E2E-010').first()).toBeVisible()
  await drawer.getByRole('button', { name: 'Aprovar' }).click()
  await expect(drawer.getByText('Semana aprovada: os registos estão fechados.')).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Reabrir semana' })).toBeVisible()
  await expect(drawer.getByRole('button', { name: /Corrigir registo/ })).toHaveCount(0)
})
