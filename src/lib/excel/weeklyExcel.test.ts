// @vitest-environment node
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { createSeed } from '@/data/seed'
import { buildTimesheetRows, buildWeeklyMap } from '@/domain/weeklyMap'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { addDays, weekStart } from '@/domain/weeks'
import { buildWorkbook } from './weeklyExcel'

const TODAY = '2026-10-15'
const { db } = createSeed({ today: TODAY })
const WS = weekStart(TODAY)

async function roundTrip(wb: ExcelJS.Workbook) {
  const buf = await wb.xlsx.writeBuffer()
  const back = new ExcelJS.Workbook()
  await back.xlsx.load(buf)
  return back
}

function allText(ws: ExcelJS.Worksheet) {
  const out: string[] = []
  ws.eachRow((row) => row.eachCell((c) => out.push(String(c.value ?? ''))))
  return out.join(' | ')
}

describe('buildWorkbook', () => {
  it('mapa por equipa: título, equipas, obras e viaturas da semana', async () => {
    const map = buildWeeklyMap(db, WS, {})
    const wb = await roundTrip(await buildWorkbook({ template: 'equipa', map, timesheet: [], companyName: db.company.name }))
    const ws = wb.worksheets[0]!
    expect(ws.name).toBe('Mapa por equipa')
    const text = allText(ws)
    expect(text).toContain('Semana 42')
    expect(text).toContain('Demonstração')
    expect(text).toContain('Estrutura Lisboa')
    expect(text).toContain('OB-24-031')
    expect(text).toContain('AT-41-RQ')
  })

  it('mapa por obra: uma linha por trabalhador com as horas de cada dia', async () => {
    const map = buildWeeklyMap(db, addDays(WS, 7), { siteId: 's1' })
    const wb = await roundTrip(await buildWorkbook({ template: 'obra', map, timesheet: [], companyName: db.company.name }))
    const ws = wb.worksheets[0]!
    const text = allText(ws)
    expect(text).toContain('OB-24-031')
    const worker = map.groups[0]!.workers[0]!
    expect(text).toContain(worker.name)
  })

  it('exportação ERP: número, data, horas, atividade, elemento e ordem', async () => {
    const map = buildWeeklyMap(db, addDays(WS, -7), {})
    const rows = buildTimesheetRows(db, addDays(WS, -7), {}, DEFAULT_SETTINGS)
    const wb = await roundTrip(await buildWorkbook({ template: 'erp', map, timesheet: rows, companyName: db.company.name }))
    const ws = wb.worksheets[0]!
    const header = ws.getRow(1).values as unknown[]
    expect(header.slice(1)).toEqual(['Trabalhador', 'Data', 'Total de horas', 'Atividade', 'Elemento', 'Ordem'])
    expect(ws.rowCount).toBe(rows.length + 1)
    expect(String(ws.getRow(2).getCell(4).value)).toMatch(/^80[012]$/)
  })
})
