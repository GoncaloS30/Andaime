import { expect, test } from '@playwright/test'
import { apiPost, managerWithCompany, run } from './helpers'

/** Fluxos da F8 contra a API real: agenda, dormidas, diário de obra, grelha e totais de horas, livro do RH. */

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function nextMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return iso(d)
}
function lastMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7)
  return iso(d)
}

test('agenda: um evento novo aparece no mês', async ({ page }) => {
  await managerWithCompany(page, 'gestora-agenda', `Agenda F8 ${run}`)
  await page.goto('/agenda')
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible()
  await page.getByRole('button', { name: 'Novo evento' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Título').fill('Reunião de obra E2E')
  await dialog.getByLabel('Dia').fill(iso(new Date()))
  await dialog.getByRole('button', { name: 'Marcar' }).click()
  await expect(page.getByRole('button', { name: /^Reunião de obra E2E/ }).first()).toBeVisible()
})

test('dormidas: quem está longe de casa fica com hotel marcado', async ({ page }) => {
  const orgId = await managerWithCompany(page, 'gestora-dormidas', `Dormidas F8 ${run}`)
  const employee = await apiPost<{ id: string }>(page, `/orgs/${orgId}/employees`, {
    fullName: 'Ana Dormida', category: 'Pedreiro', homeCity: 'Braga', homeLatitude: 41.5503, homeLongitude: -8.42,
  })
  const site = await apiPost<{ id: string }>(page, `/orgs/${orgId}/sites`, {
    name: 'Obra Lyon E2E', country: 'FR', city: 'Lyon', latitude: 45.7485, longitude: 4.8467, status: 'ACTIVE',
  })
  await apiPost(page, `/orgs/${orgId}/lodging/hotels`, { siteId: site.id, name: 'Hôtel E2E', address: 'Rue E2E, Lyon' })
  const monday = nextMonday()
  for (const day of [0, 1, 2]) {
    const d = new Date(`${monday}T12:00:00`)
    d.setDate(d.getDate() + day)
    await apiPost(page, `/orgs/${orgId}/planning/commands`, {
      kind: 'ASSIGN', employeeId: employee.id, siteId: site.id, date: iso(d), start: '08:00', end: '17:00', foreman: true,
    })
  }

  await page.goto(`/dormidas?semana=${monday}`)
  await expect(page.getByRole('heading', { name: 'Dormidas' })).toBeVisible()
  const line = page.getByRole('listitem').filter({ hasText: 'Ana Dormida' })
  await expect(line.getByText('Longe de casa')).toBeVisible()
  await line.getByLabel('Hotel').selectOption({ label: 'Hôtel E2E' })
  await line.getByRole('button', { name: 'Marcar' }).click()
  await expect
    .poll(async () => {
      const board = (await (await page.request.get(`/api/orgs/${orgId}/lodging/week?week=${monday}`)).json()) as { summary: { nights: number } }
      return board.summary.nights
    })
    .toBeGreaterThan(0)
})

test('diário de obra: registo novo na ficha da obra', async ({ page }) => {
  const orgId = await managerWithCompany(page, 'gestora-diario', `Diário F8 ${run}`)
  const site = await apiPost<{ id: string }>(page, `/orgs/${orgId}/sites`, { name: 'Obra Diário E2E', country: 'PT', status: 'ACTIVE' })
  await page.goto(`/obras/${site.id}?separador=diario`)
  await page.getByRole('button', { name: 'Novo registo' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Título').fill('Betonagem da laje E2E')
  await dialog.getByLabel('O que se fez').fill('Betão C30/37, sem incidentes.')
  await dialog.getByRole('button', { name: 'Guardar registo' }).click()
  await expect(page.getByText('Betonagem da laje E2E').first()).toBeVisible()
})

test('horas: grelha da semana corrige o dia, os totais e o livro do RH mostram-se', async ({ page }) => {
  const orgId = await managerWithCompany(page, 'gestora-grelha', `Grelha F8 ${run}`)
  const employee = await apiPost<{ id: string }>(page, `/orgs/${orgId}/employees`, { fullName: 'Ana Grelha', category: 'Pedreiro' })
  const site = await apiPost<{ id: string }>(page, `/orgs/${orgId}/sites`, { name: 'Obra Grelha E2E', country: 'PT', status: 'ACTIVE' })
  const monday = lastMonday()
  await apiPost(page, `/orgs/${orgId}/time-entries`, {
    employeeId: employee.id, siteId: site.id, date: monday, start: '08:00', end: '17:00', reason: 'Registo E2E',
  })

  await page.goto('/horas')
  await page.getByRole('button', { name: 'Semana anterior' }).click()
  await page.getByRole('radio', { name: 'Grelha da semana' }).click()
  const cell = page.getByLabel(/^Ana Grelha, .*: horas$/).first()
  await expect(cell).toHaveValue('8')
  await cell.fill('10')
  await page.getByRole('button', { name: /Guardar alterações/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Motivo').fill('Ficou até mais tarde na betonagem')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('1 dia guardado')).toBeVisible()

  await page.getByRole('radio', { name: 'Totais' }).click()
  await page.getByRole('button', { name: 'Período anterior' }).click()
  await expect(page.getByRole('rowheader', { name: 'Ana Grelha' })).toBeVisible()

  await page.getByRole('radio', { name: 'Livro do RH' }).click()
  await expect(page.getByRole('button', { name: 'Descarregar Excel' })).toBeVisible()
})
