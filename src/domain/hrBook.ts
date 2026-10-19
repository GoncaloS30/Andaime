import { entryHours } from './hours'
import { ABSENCE_TYPE } from './labels'
import type { DB, ISODate, Settings } from './types'
import { activityCode } from './weeklyMap'
import { addDays, isWeekend } from './weeks'

/**
 * Livro de horas do RH: uma folha por pessoa, no formato que o RH já usa. Um dia de ausência vai ao livro
 * com 0 h e o motivo na coluna "Ausência" — sem ela ninguém distingue esse 0 de um dia por preencher.
 */

export interface HrRow {
  date: ISODate
  hours: number
  /** Ordem da obra no ERP (vazia em dias de ausência). */
  order: string
  activity: string
  absence: string
}

export interface HrSheet {
  workerId: string
  name: string
  number: string
  rows: HrRow[]
}

/** "Nome-Número": o Excel não aceita mais de 31 caracteres nem : \ / ? * [ ]. O número nunca é cortado. */
export function sheetName(name: string, number: string): string {
  const suffix = `-${number}`
  const clean = name.replace(/[:\\/?*[\]]/g, '').replace(/\s+/g, ' ').trim()
  return `${clean.slice(0, 31 - suffix.length).trim()}${suffix}`
}

const VALID = new Set(['submetido', 'revisto', 'aprovado'])

export function hrBookSheets(db: DB, settings: Settings, month: string): HrSheet[] {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const from = `${month}-01`
  const end = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
  const rows = new Map<string, HrRow[]>()
  const push = (workerId: string, r: HrRow) => rows.set(workerId, [...(rows.get(workerId) ?? []), r])
  const worked = new Set<string>()
  for (const e of Object.values(db.entries)) {
    if (!VALID.has(e.status) || e.date < from || e.date > end) continue
    const h = entryHours(e, settings).worked
    worked.add(`${e.workerId}|${e.date}`)
    push(e.workerId, { date: e.date, hours: h, order: db.sites[e.siteId]?.erpOrder ?? '', activity: activityCode(e.date, h, settings.activityCodes), absence: '' })
  }
  for (const a of Object.values(db.absences)) {
    if (a.status !== 'aprovado' || a.end < from || a.start > end) continue
    for (let d = a.start < from ? from : a.start; d <= (a.end > end ? end : a.end); d = addDays(d, 1)) {
      if (isWeekend(d) || worked.has(`${a.workerId}|${d}`)) continue
      push(a.workerId, { date: d, hours: 0, order: '', activity: '', absence: ABSENCE_TYPE[a.type] })
    }
  }
  return [...rows.entries()]
    .map(([workerId, list]) => {
      const w = db.workers[workerId]
      return { workerId, name: sheetName(w?.name ?? workerId, w?.number ?? ''), number: w?.number ?? '', rows: list.sort((a, b) => a.date.localeCompare(b.date)) }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
}

/**
 * Atualizar o livro: o período que se sincroniza é substituído por inteiro e o resto fica como está.
 * Sincronizar duas vezes seguidas dá o mesmo resultado — não duplica linhas nem apaga meses antigos.
 */
export function mergeHrRows(existing: HrRow[], fresh: HrRow[], from: ISODate, to: ISODate): HrRow[] {
  return [...existing.filter((r) => r.date < from || r.date > to), ...fresh].sort((a, b) => a.date.localeCompare(b.date))
}
