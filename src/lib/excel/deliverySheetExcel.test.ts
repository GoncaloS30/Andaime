// @vitest-environment node
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { SHEET_HEADER } from '@/domain/equipment'
import { buildDeliverySheet } from './deliverySheetExcel'

describe('folha de entrega de EPI em Excel', () => {
  it('traz a pessoa, uma linha por artigo e as linhas de assinatura', async () => {
    const wb = await buildDeliverySheet({
      company: 'Construções Ribeira Alta, S.A.',
      worker: { name: 'Rui Matos', number: '1023', category: 'Pedreiro' },
      issuedAt: '2026-10-19',
      rows: [
        { deliveryId: 'd1', date: '2026-08-01', name: 'Berbequim', kind: 'ferramenta', size: '', qty: 1, serial: 'BRB-0042' },
        { deliveryId: 'd2', date: '2026-09-10', name: 'Botas de segurança S3', kind: 'epi', size: '43', qty: 1, serial: '' },
      ],
    })
    const back = new ExcelJS.Workbook()
    await back.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    const ws = back.worksheets[0]!
    const text = (r: number) => (ws.getRow(r).values as unknown[]).slice(1).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v))
    const all = ws.getSheetValues().flat().filter((v) => typeof v === 'string') as string[]
    expect(all).toContain('Rui Matos')
    const headRow = ws.getColumn(1).values.findIndex((v) => v === SHEET_HEADER[0])
    expect(text(headRow)).toEqual([...SHEET_HEADER])
    expect(text(headRow + 1)).toEqual(['2026-08-01', 'Berbequim', 'Ferramenta', '—', 1, 'BRB-0042'])
    expect(text(headRow + 2)[1]).toBe('Botas de segurança S3')
    expect(all.some((v) => v.startsWith('Assinatura do trabalhador'))).toBe(true)
    expect(all.some((v) => v.startsWith('Assinatura de quem entrega'))).toBe(true)
  })
})
