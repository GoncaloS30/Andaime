import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { act, go, open, state } from './helpers'

test('fluxo 16: artigo novo a partir da ficha e folha de entrega em Excel', async ({ page }) => {
  await open(page, '/')
  const w = await state<{ id: string; name: string }>(page, "(s) => { const w = Object.values(s.db.workers).find((x) => x.status === 'ativo' && x.category === 'Pedreiro'); return { id: w.id, name: w.name } }")
  await go(page, `/trabalhadores/${w.id}?tab=equipamentos`)
  await page.getByRole('button', { name: 'Registar entrega' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Artigo').selectOption({ label: '+ Novo artigo no catálogo…' })
  await dialog.getByLabel('Nome').fill('Joelheiras de gel')
  await dialog.getByRole('button', { name: 'Registar entrega' }).click()
  await expect(page.getByText('Entrega registada: Joelheiras de gel')).toBeVisible()
  expect(await state<number>(page, "(s) => Object.values(s.db.equipment).filter((i) => i.name === 'Joelheiras de gel').length")).toBe(1)

  await page.getByRole('button', { name: 'Folha de entrega' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('cell', { name: 'Joelheiras de gel' })).toBeVisible()
  const download = page.waitForEvent('download')
  await sheet.getByRole('button', { name: 'Descarregar Excel' }).click()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await readFile(await (await download).path()))
  const values = wb.worksheets[0]!.getSheetValues().flat().filter((v) => typeof v === 'string')
  expect(values).toContain(w.name)
  expect(values).toContain('Joelheiras de gel')
})

test('fluxo 17: exportar a cópia da demonstração e importá-la de volta', async ({ page }) => {
  await open(page, '/definicoes')
  await expect(page.getByRole('heading', { name: 'Integrações' })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar cópia (JSON)' }).click()
  const file = await (await download).path()
  const before = await state<number>(page, '(s) => Object.keys(s.db.equipment).length')

  // Muda os dados depois da cópia; importar tem de os repor.
  await act(page, "(s) => s.addEquipmentItem({ name: 'Artigo temporário', kind: 'epi', sizeKind: null, stock: 1 })")
  expect(await state<number>(page, '(s) => Object.keys(s.db.equipment).length')).toBe(before + 1)

  await page.locator('#import-backup').setInputFiles(file)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Substituir os dados por esta cópia?')).toBeVisible()
  await dialog.getByRole('button', { name: 'Importar cópia' }).click()
  await expect(page.getByText('Cópia importada')).toBeVisible()
  expect(await state<number>(page, '(s) => Object.keys(s.db.equipment).length')).toBe(before)

  // Um ficheiro que não é cópia é recusado com uma mensagem clara.
  await page.locator('#import-backup').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') })
  await expect(page.getByRole('alert')).toHaveText('O ficheiro não é uma cópia do Andaime.')
})

test('créditos das fotos: uma entrada por foto, com autor e ligação ao original', async ({ page }) => {
  await open(page, '/definicoes')
  await page.getByRole('link', { name: 'Créditos das fotos' }).click()
  await expect(page.getByRole('heading', { name: 'Créditos das fotos' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Original de / }).first()).toHaveAttribute('href', /pexels\.com/)
})
