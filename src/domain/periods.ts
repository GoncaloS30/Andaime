import { entryHours } from './hours'
import type { DB, ID, ISODate, Settings } from './types'
import { addDays, dayShort, isoWeek, isWeekend, weekStart } from './weeks'

export type PeriodUnit = 'semana' | 'mes' | 'ano'

export interface PeriodColumn {
  key: string
  label: string
  from: ISODate
  to: ISODate
  /** Sábado e domingo: só aparecem se alguém lá tiver horas. */
  optional: boolean
}

export interface PeriodRange {
  unit: PeriodUnit
  from: ISODate
  to: ISODate
  columns: PeriodColumn[]
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const lastOfMonth = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`

/** O intervalo de um período e as colunas em que se divide: dias da semana, semanas do mês ou meses do ano. */
export function periodRange(unit: PeriodUnit, anchor: ISODate): PeriodRange {
  const [y, m] = anchor.split('-').map(Number) as [number, number]
  if (unit === 'semana') {
    const ws = weekStart(anchor)
    const columns = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(ws, i)
      return { key: d, label: `${dayShort(d)} ${Number(d.slice(8))}`, from: d, to: d, optional: isWeekend(d) }
    })
    return { unit, from: ws, to: addDays(ws, 6), columns }
  }
  if (unit === 'mes') {
    const first = `${y}-${String(m).padStart(2, '0')}-01`
    const last = lastOfMonth(y, m)
    const columns: PeriodColumn[] = []
    for (let w = weekStart(first); w <= last; w = addDays(w, 7)) {
      const from = w < first ? first : w
      const to = addDays(w, 6) > last ? last : addDays(w, 6)
      columns.push({ key: w, label: `Sem. ${isoWeek(w)}`, from, to, optional: false })
    }
    return { unit, from: first, to: last, columns }
  }
  const columns = MONTHS.map((label, i) => ({ key: `${y}-${String(i + 1).padStart(2, '0')}`, label, from: `${y}-${String(i + 1).padStart(2, '0')}-01`, to: lastOfMonth(y, i + 1), optional: false }))
  return { unit, from: `${y}-01-01`, to: `${y}-12-31`, columns }
}

/** O mesmo período, para trás (−1) ou para a frente (+1). */
export function shiftPeriod(unit: PeriodUnit, anchor: ISODate, d: number): ISODate {
  const [y, m] = anchor.split('-').map(Number) as [number, number]
  if (unit === 'semana') return addDays(weekStart(anchor), 7 * d)
  if (unit === 'mes') {
    const t = new Date(Date.UTC(y, m - 1 + d, 1))
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-01`
  }
  return `${y + d}-01-01`
}

const VALID = new Set(['submetido', 'revisto', 'aprovado'])
const round2 = (n: number) => Math.round(n * 100) / 100

export interface HoursTotals {
  workers: { workerId: ID; cells: number[]; total: number }[]
  sites: { siteId: ID; byWorker: Record<ID, number>; total: number }[]
  columnTotals: number[]
  /** Que colunas mostrar: as opcionais (fim de semana) só se tiverem horas. */
  visible: boolean[]
  total: number
}

/** Horas realizadas (submetidas, revistas, aprovadas) repartidas pelas colunas do período, por pessoa e por obra. */
export function hoursTotals(db: DB, settings: Settings, range: PeriodRange, filters: { siteId?: ID | null; workerId?: ID | null }): HoursTotals {
  const byWorker = new Map<ID, number[]>()
  const bySite = new Map<ID, Record<ID, number>>()
  const n = range.columns.length
  for (const e of Object.values(db.entries)) {
    if (!VALID.has(e.status) || e.date < range.from || e.date > range.to) continue
    if (filters.siteId && e.siteId !== filters.siteId) continue
    if (filters.workerId && e.workerId !== filters.workerId) continue
    const col = range.columns.findIndex((c) => e.date >= c.from && e.date <= c.to)
    if (col < 0) continue
    const h = entryHours(e, settings).worked
    const cells = byWorker.get(e.workerId) ?? new Array<number>(n).fill(0)
    cells[col] = round2(cells[col]! + h)
    byWorker.set(e.workerId, cells)
    const s = bySite.get(e.siteId) ?? {}
    s[e.workerId] = round2((s[e.workerId] ?? 0) + h)
    bySite.set(e.siteId, s)
  }
  const name = (id: ID) => db.workers[id]?.name ?? ''
  const workers = [...byWorker.entries()]
    .map(([workerId, cells]) => ({ workerId, cells, total: round2(cells.reduce((a, b) => a + b, 0)) }))
    .sort((a, b) => name(a.workerId).localeCompare(name(b.workerId), 'pt'))
  const sites = [...bySite.entries()]
    .map(([siteId, w]) => ({ siteId, byWorker: w, total: round2(Object.values(w).reduce((a, b) => a + b, 0)) }))
    .sort((a, b) => b.total - a.total)
  const columnTotals = range.columns.map((_, i) => round2(workers.reduce((t, r) => t + r.cells[i]!, 0)))
  return {
    workers,
    sites,
    columnTotals,
    visible: range.columns.map((c, i) => !c.optional || columnTotals[i]! > 0),
    total: round2(columnTotals.reduce((a, b) => a + b, 0)),
  }
}
