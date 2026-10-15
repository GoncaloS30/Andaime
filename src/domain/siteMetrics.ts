import { entryHours } from './hours'
import type { Assignment, ISODate, Settings, Site, TimeEntry } from './types'

export type SiteHoursStatus = 'normal' | 'atencao' | 'excede' | 'sem_limite'

export interface SiteMetrics {
  limit: number | null
  /** Submetidas + revistas + aprovadas (inclui histórico anterior). */
  realized: number
  /** Subconjunto aprovado pelo gestor. */
  approved: number
  /** Atribuições de hoje em diante ainda sem entrada válida. */
  plannedFuture: number
  /** Limite − realizadas. */
  balance: number | null
  /** Realizadas + planeadas futuras. */
  projection: number
  pctRealized: number
  pctProjection: number
  status: SiteHoursStatus
  /** Horas acima do limite na projeção (0 se dentro). */
  overBy: number
}

export const WARN_AT = 0.85

const COUNTED = new Set(['submetido', 'revisto', 'aprovado'])
const round1 = (n: number) => Math.round(n * 10) / 10

export function siteMetrics(
  site: Site,
  assignments: Assignment[],
  entries: TimeEntry[],
  today: ISODate,
  settings: Settings,
): SiteMetrics {
  let realized = site.baselineRealized
  let approved = site.baselineApproved
  const covered = new Set<string>()

  for (const e of entries) {
    if (e.siteId !== site.id) continue
    if (e.status !== 'rejeitado') covered.add(`${e.workerId}|${e.date}`)
    if (!COUNTED.has(e.status)) continue
    const h = entryHours(e, settings).worked
    realized += h
    if (e.status === 'aprovado') approved += h
  }

  let plannedFuture = 0
  for (const a of assignments) {
    if (a.siteId !== site.id || a.date < today) continue
    if (covered.has(`${a.workerId}|${a.date}`)) continue
    plannedFuture += a.hours
  }

  realized = round1(realized)
  approved = round1(approved)
  plannedFuture = round1(plannedFuture)
  const projection = round1(realized + plannedFuture)
  const limit = site.hourLimit

  if (limit === null || limit <= 0) {
    return {
      limit, realized, approved, plannedFuture, projection,
      balance: null, pctRealized: 0, pctProjection: 0, status: 'sem_limite', overBy: 0,
    }
  }

  const pctRealized = realized / limit
  const pctProjection = projection / limit
  const status: SiteHoursStatus =
    pctProjection > 1 || pctRealized > 1 ? 'excede' : pctProjection >= WARN_AT ? 'atencao' : 'normal'

  return {
    limit, realized, approved, plannedFuture, projection,
    balance: round1(limit - realized),
    pctRealized, pctProjection, status,
    overBy: round1(Math.max(0, projection - limit)),
  }
}
