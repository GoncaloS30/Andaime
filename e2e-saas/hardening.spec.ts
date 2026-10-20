import { expect, test } from '@playwright/test'
import { acceptInvitation, apiPost, apiPut, managerWithCompany, run } from './helpers'

test('regras da empresa, ponto sem rede e anonimização de ex-trabalhador', async ({ page, browser }) => {
  const orgId = await managerWithCompany(page, 'gestora-f7', `Endurecimento F7 ${run}`)

  // Política laboral e feriados próprios.
  await page.goto('/definicoes/regras')
  await page.getByLabel('Horas normais por dia').fill('7')
  await page.getByRole('button', { name: 'Guardar política' }).click()
  await expect(page.getByText('Política laboral atualizada a partir de hoje')).toBeVisible()
  await page.getByLabel('Data').fill(`${new Date().getFullYear()}-12-26`)
  await page.getByLabel('Nome', { exact: true }).fill('Dia da empresa')
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('Dia da empresa')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Autorizar acesso' })).toBeDisabled()

  // Ponto sem rede: fica no telemóvel e é enviado quando a rede volta.
  const rui = await apiPost<{ id: string }>(page, `/orgs/${orgId}/employees`, { fullName: 'Rui Sem Rede', category: 'Servente' })
  await apiPost(page, `/orgs/${orgId}/sites`, { name: 'Obra Sem Rede', country: 'PT', code: 'OB-E2E-070', status: 'ACTIVE' })
  const sites = (await (await page.request.get(`/api/orgs/${orgId}/sites`)).json()) as { id: string }[]
  const today = new Date()
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  await apiPost(page, `/orgs/${orgId}/planning/commands`, { kind: 'ASSIGN', employeeId: rui.id, siteId: sites[0]!.id, date: iso, start: '00:30', end: '06:30', foreman: true })
  const email = `trabalhador-f7-${run}@andaime.test`
  await apiPost(page, `/orgs/${orgId}/invitations`, { email, role: 'WORKER' })
  const context = await browser.newContext()
  const worker = await context.newPage()
  await acceptInvitation(worker, 'Rui Sem Rede', email)
  await expect(worker).toHaveURL(/\/app$/)
  const members = (await (await page.request.get(`/api/orgs/${orgId}/members`)).json()) as { id: string; email: string }[]
  await apiPut(page, `/orgs/${orgId}/members/${members.find((m) => m.email === email)!.id}/employee`, { employeeId: rui.id })
  await worker.reload()
  await expect(worker.getByRole('button', { name: 'Registar entrada' })).toBeVisible()

  await context.setOffline(true)
  await worker.getByRole('button', { name: 'Registar entrada' }).click()
  await expect(worker.getByText('1 registo(s) por enviar; seguem quando houver rede.')).toBeVisible()
  await expect(worker.getByText('A trabalhar')).toBeVisible()
  await context.setOffline(false)
  await worker.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(worker.getByText('1 registo(s) feito(s) sem rede enviado(s)')).toBeVisible()
  await expect(worker.getByText(/registo\(s\) por enviar/)).toHaveCount(0)
  await worker.getByRole('button', { name: 'Registar saída' }).click()
  await expect(worker.getByRole('button', { name: 'Registar entrada' })).toBeVisible()

  // Anonimizar um ex-trabalhador arquivado.
  const ex = await apiPost<{ id: string; number: string }>(page, `/orgs/${orgId}/employees`, { fullName: 'Marta Antiga', category: 'Pedreiro', email: 'marta@exemplo.pt' })
  await apiPost(page, `/orgs/${orgId}/employees/${ex.id}/archive`, {})
  await page.goto(`/trabalhadores/${ex.id}`)
  await page.getByRole('button', { name: 'Anonimizar' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Anonimizar' })).toBeDisabled()
  await dialog.getByLabel('Escreva ANONIMIZAR para confirmar').fill('ANONIMIZAR')
  await dialog.getByRole('button', { name: 'Anonimizar' }).click()
  await expect(page.getByRole('heading', { name: `Ex-trabalhador ${ex.number}` })).toBeVisible()
  await expect(page.getByText('marta@exemplo.pt')).toHaveCount(0)
})
