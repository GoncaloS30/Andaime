import { expect, test } from '@playwright/test'
import { apiPost, managerWithCompany, run } from './helpers'

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')

function inDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('documentos com ficheiro real, entregas de EPI e ausência aprovada', async ({ page }) => {
  const orgId = await managerWithCompany(page, 'gestora-f5', `Operações F5 ${run}`)
  await apiPost(page, `/orgs/${orgId}/employees`, { fullName: 'Ana Operações', category: 'Pedreiro' })

  // Tornar a aptidão médica obrigatória e carregar o documento a partir da conformidade.
  await page.goto('/documentos')
  await page.getByRole('tab', { name: 'Tipos e exigências' }).click()
  const medical = page.getByRole('listitem').filter({ hasText: 'Ficha de aptidão médica' })
  await medical.getByRole('checkbox', { name: 'Obrigatório em todas as obras' }).click()
  await expect(page.getByText('Exigência atualizada')).toBeVisible()
  await expect(medical.getByRole('checkbox', { name: 'Obrigatório em todas as obras' })).toBeChecked()
  await page.getByRole('tab', { name: 'Conformidade' }).click()
  await page.getByRole('button', { name: 'Ficha de aptidão médica de Ana Operações: Em falta. Carregar' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Válido até').fill(inDays(400))
  await dialog.getByLabel('Ficheiro').setInputFiles({ name: 'aptidao.pdf', mimeType: 'application/pdf', buffer: PDF })
  await dialog.getByRole('button', { name: 'Carregar' }).click()
  await expect(page.getByText('Documento carregado')).toBeVisible()
  await page.getByRole('button', { name: /Ficha de aptidão médica de Ana Operações: Válido/ }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByRole('link', { name: 'Descarregar' })).toHaveAttribute('href', /\/download$/)
  const href = await drawer.getByRole('link', { name: 'Descarregar' }).getAttribute('href')
  const file = await page.request.get(href!)
  expect(file.ok()).toBeTruthy()
  expect(Buffer.from(await file.body()).equals(PDF)).toBeTruthy()
  await drawer.getByRole('button', { name: 'Marcar como verificado' }).click()
  await expect(drawer.getByText(/Verificada por/)).toBeVisible()
  await page.keyboard.press('Escape')

  // Fardamento: entrada e entrega; fica registado com quem está.
  await page.goto('/equipamentos')
  await page.getByRole('button', { name: 'Novo artigo' }).click()
  await page.getByRole('dialog').getByLabel('Nome').fill('Botas E2E')
  await page.getByRole('dialog').getByLabel('Tamanho').fill('42')
  await page.getByRole('dialog').getByRole('button', { name: 'Criar' }).click()
  await page.getByRole('row', { name: /Botas E2E/ }).getByRole('button', { name: 'Entrada' }).click()
  await page.getByRole('dialog').getByLabel('Quantidade').fill('5')
  await page.getByRole('dialog').getByRole('button', { name: 'Registar' }).click()
  await page.getByRole('button', { name: 'Entregar', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Artigo').selectOption({ label: 'Botas E2E (42) · 5 em armazém' })
  await page.getByRole('dialog').getByLabel('Trabalhador').selectOption({ label: 'Ana Operações' })
  await page.getByRole('dialog').getByLabel('Quantidade').fill('2')
  await page.getByRole('dialog').getByRole('button', { name: 'Registar' }).click()
  await expect(page.getByRole('row', { name: /Botas E2E/ })).toContainText('3')
  await page.getByLabel('Trabalhador').selectOption({ label: 'Ana Operações' })
  await expect(page.getByText('2× Botas E2E (42)')).toBeVisible()

  // Ausência registada pelo escritório e aprovada (sem trabalho planeado nesses dias).
  await page.goto('/ausencias')
  await page.getByRole('button', { name: 'Registar ausência' }).click()
  const absence = page.getByRole('dialog')
  await absence.getByLabel('Trabalhador').selectOption({ label: 'Ana Operações' })
  await absence.getByLabel('De').fill(inDays(20))
  await absence.getByLabel('Até').fill(inDays(22))
  await absence.getByRole('button', { name: 'Registar' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Ana Operações' }).getByRole('button', { name: 'Aprovar' }).click()
  await expect(page.getByRole('dialog').getByText('Sem trabalho planeado nesses dias.')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Aprovar' }).click()
  await expect(page.getByText('Ausência aprovada')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Notificações' })).toBeVisible()
})
