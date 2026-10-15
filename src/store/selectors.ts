import { produce } from 'immer'
import { availability } from '@/domain/availability'
import { detectConflicts, type Conflict } from '@/domain/conflicts'
import { docState } from '@/domain/documents'
import { entryHours } from '@/domain/hours'
import { buildIndex } from '@/domain/indexes'
import { siteMetrics, type SiteMetrics } from '@/domain/siteMetrics'
import type { DB, ID, ISODate, Settings } from '@/domain/types'
import { addDays, weekStart } from '@/domain/weeks'
import type { DemoState, Session, WorkerOp } from './types'
import { applyWorkerOp } from './workerOps'

/** Memo por referência do DB (o immer cria um DB novo a cada alteração). */
function memoByDb<R>(fn: (db: DB, session: Session) => R) {
  const cache = new WeakMap<DB, { today: string; settings: Settings; value: R }>()
  return (s: Pick<DemoState, 'db' | 'session'>): R => {
    const hit = cache.get(s.db)
    if (hit && hit.today === s.session.today && hit.settings === s.session.settings) return hit.value
    const value = fn(s.db, s.session)
    cache.set(s.db, { today: s.session.today, settings: s.session.settings, value })
    return value
  }
}

export function defaultRange(today: ISODate) {
  return { from: today, to: addDays(weekStart(today), 13) }
}

const conflictsDefault = memoByDb((db, session) =>
  detectConflicts(db, defaultRange(session.today), session.today, session.settings),
)

const conflictCache = new WeakMap<DB, Map<string, Conflict[]>>()

export function selectConflicts(s: Pick<DemoState, 'db' | 'session'>, range?: { from: ISODate; to: ISODate }): Conflict[] {
  if (!range) return conflictsDefault(s)
  let m = conflictCache.get(s.db)
  if (!m) conflictCache.set(s.db, (m = new Map()))
  const k = `${range.from}|${range.to}|${s.session.today}`
  let v = m.get(k)
  if (!v) m.set(k, (v = detectConflicts(s.db, range, s.session.today, s.session.settings)))
  return v
}

export const selectAllSiteMetrics = memoByDb((db, session) => {
  const assignments = Object.values(db.assignments)
  const entries = Object.values(db.entries)
  const out: Record<ID, SiteMetrics> = {}
  for (const site of Object.values(db.sites)) out[site.id] = siteMetrics(site, assignments, entries, session.today, session.settings)
  return out
})

export function selectSiteMetrics(s: Pick<DemoState, 'db' | 'session'>, siteId: ID): SiteMetrics {
  return selectAllSiteMetrics(s)[siteId]!
}

const COUNTED = new Set(['submetido', 'revisto', 'aprovado'])

export const selectDashboard = memoByDb((db, session) => {
  const today = session.today
  const ws = weekStart(today)
  const we = addDays(ws, 6)
  const idx = buildIndex(db)
  const workers = Object.values(db.workers).filter((w) => w.status === 'ativo')
  const todays = idx.byDate.get(today) ?? []
  const availableToday = workers.filter((w) => {
    const st = availability(w, today, idx).state
    return st === 'livre' || st === 'parcial'
  }).length
  const absentToday = workers.filter((w) => availability(w, today, idx).state === 'ausente').length

  let plannedWeek = 0
  for (const a of Object.values(db.assignments)) if (a.date >= ws && a.date <= we) plannedWeek += a.hours
  let realizedWeek = 0
  let clockedNow = 0
  for (const e of Object.values(db.entries)) {
    if (e.date === today && e.status === 'aberto') clockedNow++
    if (e.date >= ws && e.date <= we && COUNTED.has(e.status)) realizedWeek += entryHours(e, session.settings).worked
  }
  const entries = Object.values(db.entries)
  const sites = Object.values(db.sites)
  const teamsThisWeek = new Set<ID>()
  const teamsAbroad = new Set<ID>()
  for (const a of Object.values(db.assignments)) {
    if (a.date < ws || a.date > we || !a.teamId) continue
    teamsThisWeek.add(a.teamId)
    if (db.sites[a.siteId]?.country !== 'PT') teamsAbroad.add(a.teamId)
  }
  const vehiclesUnavailable = Object.values(db.vehicles).filter(
    (v) => v.status !== 'operacional' || v.inspectionUntil < today || v.insuranceUntil < today,
  ).length
  const docs = Object.values(db.documents).map((d) => docState(d, today))
  const metrics = selectAllSiteMetrics({ db, session })
  const conflicts = conflictsDefault({ db, session })
  return {
    activeWorkers: workers.length,
    availableToday,
    absentToday,
    workingToday: new Set(todays.map((a) => a.workerId)).size,
    clockedNow,
    sitesInProgress: sites.filter((s) => s.status === 'em_curso').length,
    sitesAbroad: sites.filter((s) => s.status === 'em_curso' && s.country !== 'PT').length,
    sitesAtRisk: sites.filter((s) => s.status === 'em_curso' && ['atencao', 'excede'].includes(metrics[s.id]!.status)).length,
    teamsActive: teamsThisWeek.size,
    teamsAbroad: teamsAbroad.size,
    plannedWeek: Math.round(plannedWeek),
    realizedWeek: Math.round(realizedWeek * 10) / 10,
    pendingReviews: entries.filter((e) => e.status === 'submetido').length,
    pendingApprovals: entries.filter((e) => e.status === 'revisto').length,
    rejectedEntries: entries.filter((e) => e.status === 'rejeitado').length,
    vehiclesUnavailable,
    docsAttention: docs.filter((d) => d === 'a_expirar' || d === 'expirado' || d === 'rejeitado').length,
    docsExpired: docs.filter((d) => d === 'expirado').length,
    absencesPending: Object.values(db.absences).filter((a) => a.status === 'pedido').length,
    openIssues: Object.values(db.issues).filter((i) => i.status === 'aberto').length,
    conflicts: conflicts.length,
    conflictsCritical: conflicts.filter((c) => c.severity === 'critico').length,
  }
})

export type DashboardKpis = ReturnType<typeof selectDashboard>

/** DB do trabalhador com as operações pendentes já aplicadas (o que ele vê no telemóvel). */
const projectionCache = new WeakMap<DB, { outbox: WorkerOp[]; value: DB }>()
export function projectedDb(s: Pick<DemoState, 'db' | 'session'>): DB {
  if (s.session.outbox.length === 0) return s.db
  const hit = projectionCache.get(s.db)
  if (hit && hit.outbox === s.session.outbox) return hit.value
  let n = 0
  const ctx = { uid: (p: string) => `${p}-pend-${++n}`, today: s.session.today, settings: s.session.settings }
  const value = produce(s.db, (d) => {
    for (const op of s.session.outbox) {
      try {
        applyWorkerOp(d, op, ctx)
      } catch {
        /* operação inválida fica pendente e é mostrada como erro ao sincronizar */
      }
    }
  })
  projectionCache.set(s.db, { outbox: s.session.outbox, value })
  return value
}

export function selectWorkerView(s: Pick<DemoState, 'db' | 'session'>) {
  const db = projectedDb(s)
  const today = s.session.today
  const wid = s.session.personas.trabalhador
  const worker = db.workers[wid]
  const todayAssignments = Object.values(db.assignments)
    .filter((a) => a.workerId === wid && a.date === today)
    .sort((a, b) => a.start.localeCompare(b.start))
  const todayEntries = Object.values(db.entries).filter((e) => e.workerId === wid && e.date === today)
  const todayEntry = todayEntries.find((e) => e.status === 'aberto') ?? todayEntries[0]
  const upcoming = Object.values(db.assignments)
    .filter((a) => a.workerId === wid && a.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))
  return {
    db,
    worker,
    todayAssignments,
    todayEntry,
    upcoming,
    pending: s.session.outbox.length,
  }
}

/** Âmbito do encarregado: equipas que lidera, obras que gere e trabalhadores dessas equipas. */
export const scopeCache = new WeakMap<DB, Map<ID, { teamIds: ID[]; siteIds: ID[]; workerIds: ID[] }>>()
export function selectForemanScope(s: Pick<DemoState, 'db' | 'session'>, foremanId?: ID) {
  const id = foremanId ?? s.session.personas.encarregado
  let m = scopeCache.get(s.db)
  if (!m) scopeCache.set(s.db, (m = new Map()))
  const hit = m.get(id)
  if (hit) return hit
  const teams = Object.values(s.db.teams).filter((t) => t.foremanId === id)
  const siteIds = new Set<ID>(Object.values(s.db.sites).filter((x) => x.foremanId === id).map((x) => x.id))
  for (const t of teams) if (t.siteId) siteIds.add(t.siteId)
  const workerIds = new Set<ID>(teams.flatMap((t) => t.memberIds))
  const ws = weekStart(s.session.today)
  for (const a of Object.values(s.db.assignments)) {
    if (siteIds.has(a.siteId) && a.date >= ws && a.date <= addDays(ws, 13)) workerIds.add(a.workerId)
  }
  const v = { teamIds: teams.map((t) => t.id), siteIds: [...siteIds], workerIds: [...workerIds] }
  m.set(id, v)
  return v
}

export function selectNotifications(s: Pick<DemoState, 'db' | 'session'>) {
  const role = s.session.role
  const persona = s.session.personas[role]
  return s.db.notifications.filter((n) => n.role === role && (n.personaId === null || n.personaId === persona))
}
