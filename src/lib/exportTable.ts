export interface Column {
  key: string
  label: string
}

type Row = Record<string, string | number | null | undefined>

function cell(v: Row[string]): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'number' ? String(v).replace('.', ',') : v
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV para o Excel em pt-PT: separador ";", vírgula decimal e BOM UTF-8. */
export function toCSV(columns: Column[], rows: Row[]): string {
  const lines = [columns.map((c) => cell(c.label)).join(';'), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(';'))]
  return '﻿' + lines.join('\r\n')
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadCSV(filename: string, columns: Column[], rows: Row[]) {
  download(new Blob([toCSV(columns, rows)], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`)
}

export async function downloadXLSX(filename: string, title: string, columns: Column[], rows: Row[]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(title.slice(0, 31))
  ws.addRow([`${title} · Andaime · demonstração com dados fictícios`]).font = { bold: true }
  const h = ws.addRow(columns.map((c) => c.label))
  h.font = { bold: true }
  for (const r of rows) ws.addRow(columns.map((c) => r[c.key] ?? ''))
  ws.columns.forEach((col) => (col.width = 18))
  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`)
}
