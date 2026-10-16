import type ExcelJS from 'exceljs'
import { ENTRY_STATUS } from '@/domain/labels'
import type { EntryStatus } from '@/domain/types'
import type { TimesheetRow, WeeklyMap } from '@/domain/weeklyMap'
import { dateNumeric, dayShort } from '@/domain/weeks'

export type MapTemplate = 'equipa' | 'obra' | 'horas' | 'erp'

export const TEMPLATE_LABEL: Record<MapTemplate, string> = {
  equipa: 'Mapa por equipa',
  obra: 'Mapa por obra',
  horas: 'Folha de horas',
  erp: 'Exportação ERP',
}

export const TEMPLATE_HINT: Record<MapTemplate, string> = {
  equipa: 'O mapa de trabalhos semanal: equipas, trabalhadores, dias, obra, viatura e notas.',
  obra: 'Uma secção por obra com as horas planeadas de cada trabalhador por dia.',
  horas: 'Horas realizadas e válidas da semana, por trabalhador e dia.',
  erp: 'Formato de importação: n.º, data, horas, código de atividade, elemento (obra) e ordem.',
}

interface Input {
  template: MapTemplate
  map: WeeklyMap
  timesheet: TimesheetRow[]
  companyName: string
}

const PINHO = 'FF13342A'
const LIMA = 'FFC8E26A'
const LINE = 'FFDADCD5'
const SOFT = 'FFF5F5F0'

/** Carrega o ExcelJS só quando é preciso (é pesado). */
async function excel() {
  const mod = await import('exceljs')
  return (mod.default ?? mod) as typeof ExcelJS
}

function header(ws: ExcelJS.Worksheet, input: Input, cols: number, title: string) {
  ws.mergeCells(1, 1, 1, cols)
  ws.mergeCells(2, 1, 2, cols)
  const t = ws.getCell(1, 1)
  t.value = `${title} · Semana ${input.map.weekNumber} · ${input.map.label}`
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Arial' }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINHO } }
  t.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 26
  const s = ws.getCell(2, 1)
  s.value = `${input.companyName} · Demonstração · dados fictícios`
  s.font = { size: 9, color: { argb: 'FF13342A' }, name: 'Arial' }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIMA } }
}

function tableHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true, size: 9, color: { argb: 'FF545B56' }, name: 'Arial' }
    c.border = { bottom: { style: 'thin', color: { argb: LINE } } }
    c.alignment = { vertical: 'middle' }
  })
  row.height = 18
}

export async function buildWorkbook(input: Input): Promise<ExcelJS.Workbook> {
  const X = await excel()
  const wb = new X.Workbook()
  wb.creator = 'Andaime (demonstração)'
  wb.created = new Date()

  if (input.template === 'equipa') {
    const ws = wb.addWorksheet('Mapa por equipa', { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 } })
    ws.columns = [{ width: 30 }, { width: 22 }, { width: 34 }, { width: 38 }, { width: 14 }, { width: 13 }, { width: 9 }]
    header(ws, input, 7, 'Mapa de trabalhos')
    const h = ws.addRow(['Equipa / trabalhadores', 'Dias', 'Obra', 'Trabalho', 'Horário', 'Viatura', 'Horas'])
    tableHeader(h)
    for (const g of input.map.groups) {
      const first = ws.addRow([
        g.teamName,
        g.dates.map((d) => dayShort(d)).join(', '),
        `${g.siteCode} — ${g.siteName}`,
        g.notes.join(' · '),
        g.schedule,
        g.vehicles.join(', '),
        g.totalHours,
      ])
      first.font = { bold: true, name: 'Arial', size: 10 }
      first.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }))
      first.getCell(1).border = { left: { style: 'thick', color: { argb: 'FF' + g.teamColor.slice(1).toUpperCase() } } }
      for (const w of g.workers) {
        const r = ws.addRow([`   ${w.name}${w.isForeman ? ' (resp.)' : ''}`, Object.keys(w.hoursByDate).sort().map((d) => dayShort(d)).join(', '), '', '', '', '', w.total])
        r.font = { name: 'Arial', size: 10 }
      }
      ws.addRow([])
    }
    if (input.map.note) {
      const n = ws.addRow([`Notas gerais da semana: ${input.map.note}`])
      ws.mergeCells(n.number, 1, n.number, 7)
      n.font = { italic: true, name: 'Arial', size: 10 }
    }
    return wb
  }

  if (input.template === 'obra') {
    const ws = wb.addWorksheet('Mapa por obra', { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 } })
    ws.columns = [{ width: 30 }, { width: 16 }, ...input.map.days.map(() => ({ width: 9 })), { width: 10 }]
    const cols = 3 + input.map.days.length
    header(ws, input, cols, 'Mapa por obra')
    const bySite = new Map<string, typeof input.map.groups>()
    for (const g of input.map.groups) bySite.set(g.siteId, [...(bySite.get(g.siteId) ?? []), g])
    for (const groups of bySite.values()) {
      const g0 = groups[0]!
      const sh = ws.addRow([`${g0.siteCode} — ${g0.siteName}`, `${g0.city} · ${g0.clientName}`])
      sh.font = { bold: true, name: 'Arial', size: 11, color: { argb: 'FFFFFFFF' } }
      sh.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINHO } }))
      tableHeader(ws.addRow(['Trabalhador', 'Equipa', ...input.map.days.map((d) => `${dayShort(d)} ${d.slice(8)}`), 'Total']))
      for (const g of groups) {
        for (const w of g.workers) {
          ws.addRow([w.name, g.teamName, ...input.map.days.map((d) => w.hoursByDate[d] ?? ''), w.total]).font = { name: 'Arial', size: 10 }
        }
      }
      ws.addRow([])
    }
    return wb
  }

  if (input.template === 'horas') {
    const ws = wb.addWorksheet('Folha de horas')
    ws.columns = [{ width: 10 }, { width: 28 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 14 }]
    header(ws, input, 8, 'Folha de horas')
    tableHeader(ws.addRow(['N.º', 'Trabalhador', 'Data', 'Obra', 'Horas', 'Normais', 'Extra', 'Estado']))
    for (const r of input.timesheet) {
      ws.addRow([r.workerNumber, r.workerName, dateNumeric(r.date), r.siteCode, r.hours, r.normal, r.extra, ENTRY_STATUS[r.status as EntryStatus]]).font = { name: 'Arial', size: 10 }
    }
    const total = input.timesheet.reduce((s, r) => s + r.hours, 0)
    const t = ws.addRow(['', 'Total', '', '', Math.round(total * 100) / 100])
    t.font = { bold: true, name: 'Arial', size: 10 }
    return wb
  }

  // ERP: folha simples, sem cabeçalho decorativo, pronta a importar.
  const ws = wb.addWorksheet('Exportação ERP')
  ws.columns = [{ width: 12 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 12 }]
  tableHeader(ws.addRow(['Trabalhador', 'Data', 'Total de horas', 'Atividade', 'Elemento', 'Ordem']))
  for (const r of input.timesheet) ws.addRow([r.workerNumber, dateNumeric(r.date), r.hours, r.activityCode, r.siteCode, r.erpOrder])
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  return wb
}

export async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
