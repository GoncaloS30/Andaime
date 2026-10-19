import { entryHours } from './hours'
import type { DB, ID, ISODate, Settings } from './types'
import { addDays } from './weeks'

/** Os números de "Como correu a semana": horas por dia, por obra e por pessoa. */
export interface WeekChart {
  days: { date: ISODate; realized: number; planned: number }[]
  sites: { siteId: ID; realized: number; planned: number; limit: number | null }[]
  workers: { workerId: ID; realized: number; extra: number }[]
}

const VALID = new Set(['submetido', 'revisto', 'aprovado'])
const r2 = (n: number) => Math.round(n * 100) / 100

export function weekChart(db: DB, settings: Settings, ws: ISODate): WeekChart {
  const end = addDays(ws, 6)
  const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(ws, i), realized: 0, planned: 0 }))
  const sites = new Map<ID, { siteId: ID; realized: number; planned: number; limit: number | null }>()
  const workers = new Map<ID, { workerId: ID; realized: number; extra: number }>()
  const site = (id: ID) => sites.get(id) ?? sites.set(id, { siteId: id, realized: 0, planned: 0, limit: db.sites[id]?.hourLimit ?? null }).get(id)!
  for (const e of Object.values(db.entries)) {
    if (!VALID.has(e.status) || e.date < ws || e.date > end) continue
    const h = entryHours(e, settings)
    const d = days.find((x) => x.date === e.date)!
    d.realized = r2(d.realized + h.worked)
    const s = site(e.siteId)
    s.realized = r2(s.realized + h.worked)
    const w = workers.get(e.workerId) ?? workers.set(e.workerId, { workerId: e.workerId, realized: 0, extra: 0 }).get(e.workerId)!
    w.realized = r2(w.realized + h.worked)
    w.extra = r2(w.extra + h.extra)
  }
  for (const a of Object.values(db.assignments)) {
    if (a.date < ws || a.date > end) continue
    const d = days.find((x) => x.date === a.date)!
    d.planned = r2(d.planned + a.hours)
    const s = site(a.siteId)
    s.planned = r2(s.planned + a.hours)
  }
  return {
    days,
    sites: [...sites.values()].sort((a, b) => b.realized + b.planned - (a.realized + a.planned)),
    workers: [...workers.values()].sort((a, b) => b.realized - a.realized),
  }
}
