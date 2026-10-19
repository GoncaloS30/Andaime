import type ExcelJS from 'exceljs'
import { KIND_LABEL, SHEET_DECLARATION, SHEET_HEADER, type SheetRow } from '@/domain/equipment'
import type { ISODate } from '@/domain/types'
import { dateNumeric } from '@/domain/weeks'

/** Folha de entrega de EPI para assinar: a pessoa, o que tem em seu poder e as linhas de assinatura. A4 vertical. */
export interface DeliverySheetInput {
  company: string
  worker: { name: string; number: string; category: string }
  issuedAt: ISODate
  rows: SheetRow[]
}

export async function buildDeliverySheet(input: DeliverySheetInput): Promise<ExcelJS.Workbook> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Andaime (demonstração)'
  const ws = wb.addWorksheet('Folha de entrega', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  ws.columns = [12, 34, 12, 10, 6, 16].map((width) => ({ width }))

  ws.addRow([input.company]).font = { bold: true, size: 12 }
  ws.addRow(['Folha de entrega de EPI, fardamento e ferramentas']).font = { bold: true, size: 14 }
  ws.addRow([])
  ws.addRow(['Trabalhador', input.worker.name])
  ws.addRow(['N.º', input.worker.number])
  ws.addRow(['Categoria', input.worker.category])
  ws.addRow(['Emitida em', dateNumeric(input.issuedAt)])
  for (let r = 4; r <= 7; r++) ws.getCell(r, 1).font = { color: { argb: 'FF5C635E' } }
  ws.addRow([])

  const head = ws.addRow([...SHEET_HEADER])
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF13342A' } }))
  for (const r of input.rows) {
    const row = ws.addRow([new Date(`${r.date}T00:00:00Z`), r.name, KIND_LABEL[r.kind], r.size || '—', r.qty, r.serial || '—'])
    row.getCell(1).numFmt = 'dd/mm/yyyy'
    row.eachCell((c) => (c.border = { bottom: { style: 'thin', color: { argb: 'FFDADCD5' } } }))
  }
  if (!input.rows.length) ws.addRow(['', 'Sem artigos entregues.'])

  ws.addRow([])
  const decl = ws.addRow([SHEET_DECLARATION])
  ws.mergeCells(decl.number, 1, decl.number, 6)
  decl.getCell(1).alignment = { wrapText: true, vertical: 'top' }
  decl.height = 32
  ws.addRow([])
  ws.addRow([])
  ws.addRow(['Assinatura do trabalhador: ______________________________', '', '', 'Data: ___/___/______'])
  ws.addRow([])
  ws.addRow(['Assinatura de quem entrega: ______________________________', '', '', 'Data: ___/___/______'])
  return wb
}
