// @vitest-environment node
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { buildHrBook, HR_HEADER } from './hrBookExcel'

describe('livro de horas do RH em Excel', () => {
  it('folha Tabelas e uma folha por pessoa, com fórmula de atividade e coluna Ausência', async () => {
    const wb = await buildHrBook(
      '2026-10',
      [
        {
          workerId: 'w1',
          name: 'Ana-1001',
          number: '1001',
          rows: [
            { date: '2026-10-12', hours: 8, order: '41000274', activity: '800', absence: '' },
            { date: '2026-10-15', hours: 0, order: '', activity: '', absence: 'Férias' },
          ],
        },
      ],
      DEFAULT_SETTINGS,
      { '41000274': 'OB-24-031' },
    )
    const buf = await wb.xlsx.writeBuffer()
    const back = new ExcelJS.Workbook()
    await back.xlsx.load(buf as ArrayBuffer)
    expect(back.worksheets.map((w) => w.name)).toEqual(['Tabelas', 'Ana-1001'])
    const ws = back.getWorksheet('Ana-1001')!
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual([...HR_HEADER])
    const act = ws.getRow(2).getCell(4).value as { formula: string; result: string }
    expect(act.formula).toContain('Tabelas!$B$2')
    expect(act.result).toBe('800')
    expect(ws.getRow(2).getCell(3).value).toBe('OB-24-031')
    expect(ws.getRow(3).getCell(2).value).toBe(0)
    expect(ws.getRow(3).getCell(6).value).toBe('Férias')
  })
})
