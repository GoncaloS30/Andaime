import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { go, open, state } from './helpers'

test('fluxo 14: 10 h numa célula da grelha recalcula o extra e guarda a correção com motivo', async ({ page }) => {
  await open(page, '/')
  // Um registo submetido da semana anterior à de hoje
  const e = await state<{ id: string; workerId: string; date: string }>(page, "(s) => { const t = new Date(s.session.today + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); const ws = t.toISOString().slice(0, 10); t.setUTCDate(t.getUTCDate() - 7); const prev = t.toISOString().slice(0, 10); const x = Object.values(s.db.entries).find((y) => (y.status === 'submetido' || y.status === 'revisto') && y.clockOut && y.date >= prev && y.date < ws); return { id: x.id, workerId: x.workerId, date: x.date } }")
  const name = await state<string>(page, `(s) => s.db.workers['${e.workerId}'].name`)
  await go(page, '/horas?vista=grelha')
  await page.getByRole('button', { name: 'Semana anterior' }).click()
  const day = Number(e.date.slice(8))
  const cell = page.getByLabel(new RegExp(`^${name}, \\w+ ${day}: horas$`))
  await cell.fill('10')
  await page.getByRole('button', { name: /Guardar alterações/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await dialog.getByLabel('Motivo').fill('Ficou até mais tarde na betonagem')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('1 dia atualizado')).toBeVisible()
  // 10 h trabalhadas: saída − entrada − pausa = 600 min (a entrada do registo mantém-se)
  const worked = await state<number>(page, `(s) => { const x = s.db.entries['${e.id}']; const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); return m(x.clockOut) - m(x.clockIn) - x.breakMinutes }`)
  expect(worked).toBe(600)
  expect(await state<string>(page, `(s) => s.db.entries['${e.id}'].corrections.at(-1).reason`)).toBe('Ficou até mais tarde na betonagem')
})

test('fluxo 13: livro do RH em Excel com ausências a 0 h; OneDrive simulado atualiza sem duplicar', async ({ page }) => {
  await open(page, '/')
  await go(page, '/horas?vista=rh')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descarregar Excel' }).click()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(await (await download).path())
  expect(wb.worksheets[0]!.name).toBe('Tabelas')
  expect(wb.worksheets.length).toBeGreaterThan(5)
  const header = (wb.worksheets[1]!.getRow(1).values as unknown[]).slice(1)
  expect(header).toEqual(['Data', 'Horas', 'Obra', 'Atividade', 'Ordem', 'Ausência'])

  await page.getByRole('button', { name: 'Ligar OneDrive' }).click()
  await page.getByRole('button', { name: /Criar o livro de/ }).click()
  await expect(page.getByText('Livro do mês criado')).toBeVisible()
  await page.getByRole('button', { name: /Atualizar o livro de/ }).click()
  await expect(page.getByText('Livro do mês atualizado')).toBeVisible()
  expect(await state<number>(page, '(s) => Object.keys(s.db.integrations.onedrive.books).length')).toBe(1)
})
