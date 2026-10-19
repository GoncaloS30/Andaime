import type ExcelJS from 'exceljs'
import type { HrSheet } from '@/domain/hrBook'
import type { Settings } from '@/domain/types'

/**
 * Livro de horas do RH em Excel: uma folha por pessoa ("Nome-Número") e a folha "Tabelas" com os códigos de
 * atividade. A coluna Atividade leva a fórmula (com o valor já calculado, para abrir sem recalcular); a coluna
 * Ausência vem no fim, para não mexer em nada do que o RH já tinha.
 */
export const HR_HEADER = ['Data', 'Horas', 'Obra', 'Atividade', 'Ordem', 'Ausência'] as const

export async function buildHrBook(month: string, sheets: HrSheet[], settings: Settings, siteCodeByOrder: Record<string, string>): Promise<ExcelJS.Workbook> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Andaime (demonstração)'
  const tab = wb.addWorksheet('Tabelas')
  tab.addRow(['Atividade', 'Código'])
  tab.addRow(['Normal (até 8 h)', settings.activityCodes.normal])
  tab.addRow(['Até 9 h', settings.activityCodes.ate9])
  tab.addRow(['Extra (> 9 h ou fim de semana)', settings.activityCodes.extra])
  tab.getRow(1).font = { bold: true }
  tab.columns.forEach((c) => (c.width = 28))

  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name)
    const head = ws.addRow([...HR_HEADER])
    head.font = { bold: true }
    sh.rows.forEach((r, i) => {
      const n = i + 2
      const date = new Date(`${r.date}T00:00:00Z`)
      const row = ws.addRow([date, r.hours, r.order ? (siteCodeByOrder[r.order] ?? '') : '', null, r.order, r.absence])
      row.getCell(1).numFmt = 'dd/mm/yyyy'
      // Ausência: sem atividade. Fim de semana ou mais de 9 h: extra; mais de 8 h: até 9 h; senão: normal.
      row.getCell(4).value = r.absence
        ? ''
        : { formula: `IF(OR(WEEKDAY(A${n},2)>5,B${n}>9),Tabelas!$B$4,IF(B${n}>8,Tabelas!$B$3,Tabelas!$B$2))`, result: r.activity }
    })
    ws.columns.forEach((c, i) => (c.width = [12, 8, 12, 10, 12, 22][i]))
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  wb.title = `Livro de horas ${month}`
  return wb
}
