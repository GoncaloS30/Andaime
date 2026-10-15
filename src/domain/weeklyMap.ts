import { entryHours } from './hours'
import type { Assignment, DB, ID, ISODate, Settings } from './types'
import { addDays, isWeekend, isoWeek, weekDays, weekLabel } from './weeks'

export interface MapFilters {
  teamId?: ID
  siteId?: ID
  workerId?: ID
  clientId?: ID
}

export interface MapWorkerRow {
  workerId: ID
  name: string
  number: string
  category: string
  isForeman: boolean
  hoursByDate: Record<ISODate, number>
  total: number
}

export interface MapGroup {
  key: string
  teamId: ID | null
  teamName: string
  teamColor: string
  siteId: ID
  siteCode: string
  siteName: string
  clientName: string
  city: string
  country: string
  dates: ISODate[]
  schedule: string
  vehicles: string[]
  foremanName: string | null
  workers: MapWorkerRow[]
  totalHours: number
  notes: string[]
}

export interface WeeklyMap {
  weekStart: ISODate
  weekNumber: number
  label: string
  days: ISODate[]
  groups: MapGroup[]
  totals: { hours: number; workers: number; sites: number; vehicles: number }
  note: string
}

const uniq = <T>(xs: T[]) => [...new Set(xs)]

function matches(db: DB, a: Assignment, f: MapFilters) {
  if (f.teamId && a.teamId !== f.teamId) return false
  if (f.siteId && a.siteId !== f.siteId) return false
  if (f.workerId && a.workerId !== f.workerId) return false
  if (f.clientId && db.sites[a.siteId]?.clientId !== f.clientId) return false
  return true
}

/** Mapa semanal no formato "por equipa e obra" (herdado do mapa de trabalhos em papel). */
export function buildWeeklyMap(db: DB, weekStart: ISODate, filters: MapFilters): WeeklyMap {
  const end = addDays(weekStart, 6)
  const list = Object.values(db.assignments).filter(
    (a) => a.date >= weekStart && a.date <= end && matches(db, a, filters),
  )

  const groups = new Map<string, Assignment[]>()
  for (const a of list) {
    const k = `${a.teamId ?? 'sem'}|${a.siteId}`
    groups.set(k, [...(groups.get(k) ?? []), a])
  }

  const out: MapGroup[] = []
  for (const [k, items] of groups) {
    const first = items[0]!
    const team = first.teamId ? db.teams[first.teamId] : undefined
    const site = db.sites[first.siteId]
    const client = site ? db.clients[site.clientId] : undefined
    const schedules = uniq(items.map((a) => `${a.start}–${a.end}`))
    const workerIds = uniq(items.map((a) => a.workerId))
    const workers: MapWorkerRow[] = workerIds.map((wid) => {
      const w = db.workers[wid]
      const mine = items.filter((a) => a.workerId === wid)
      const hoursByDate: Record<ISODate, number> = {}
      for (const a of mine) hoursByDate[a.date] = (hoursByDate[a.date] ?? 0) + a.hours
      return {
        workerId: wid,
        name: w?.name ?? 'Trabalhador removido',
        number: w?.number ?? '',
        category: w?.category ?? '',
        isForeman: mine.some((a) => a.isForeman) || (!!team && team.foremanId === wid),
        hoursByDate,
        total: mine.reduce((s, a) => s + a.hours, 0),
      }
    })
    workers.sort((a, b) => Number(b.isForeman) - Number(a.isForeman) || a.name.localeCompare(b.name))
    const foreman = workers.find((w) => w.isForeman)
    out.push({
      key: k,
      teamId: first.teamId,
      teamName: team?.name ?? 'Sem equipa',
      teamColor: team?.color ?? '#9aa09b',
      siteId: first.siteId,
      siteCode: site?.code ?? '—',
      siteName: site?.name ?? 'Obra removida',
      clientName: client?.name ?? '',
      city: site?.city ?? '',
      country: site?.country ?? '',
      dates: uniq(items.map((a) => a.date)).sort(),
      schedule: schedules.length === 1 ? schedules[0]! : 'Horário variável',
      vehicles: uniq(items.map((a) => a.vehicleId).filter((v): v is ID => !!v))
        .map((vid) => db.vehicles[vid]?.plate ?? '')
        .filter(Boolean),
      foremanName: foreman?.name ?? null,
      workers,
      totalHours: items.reduce((s, a) => s + a.hours, 0),
      notes: uniq(items.map((a) => a.note.trim()).filter(Boolean)),
    })
  }
  out.sort((a, b) => a.teamName.localeCompare(b.teamName) || a.siteCode.localeCompare(b.siteCode))

  return {
    weekStart,
    weekNumber: isoWeek(weekStart),
    label: weekLabel(weekStart),
    days: weekDays(weekStart),
    groups: out,
    totals: {
      hours: list.reduce((s, a) => s + a.hours, 0),
      workers: uniq(list.map((a) => a.workerId)).length,
      sites: uniq(list.map((a) => a.siteId)).length,
      vehicles: uniq(list.map((a) => a.vehicleId).filter(Boolean)).length,
    },
    note: db.weekNotes[weekStart]?.text ?? '',
  }
}

/** Código de atividade ERP: até ao normal diário, até 9 h, acima disso (e fins de semana) extra. */
export function activityCode(date: ISODate, hours: number, codes: Settings['activityCodes']): string {
  if (isWeekend(date) || hours > 9) return codes.extra
  if (hours > 8) return codes.ate9
  return codes.normal
}

export interface TimesheetRow {
  workerId: ID
  workerNumber: string
  workerName: string
  date: ISODate
  siteCode: string
  siteName: string
  erpOrder: string
  hours: number
  normal: number
  extra: number
  activityCode: string
  status: string
}

const VALID = new Set(['submetido', 'revisto', 'aprovado'])

/** Linhas por trabalhador e dia com horas realizadas válidas (formato "Folha de horas" / ERP). */
export function buildTimesheetRows(db: DB, weekStart: ISODate, filters: MapFilters, settings: Settings): TimesheetRow[] {
  const end = addDays(weekStart, 6)
  const rows: TimesheetRow[] = []
  for (const e of Object.values(db.entries)) {
    if (e.date < weekStart || e.date > end || !VALID.has(e.status)) continue
    if (filters.workerId && e.workerId !== filters.workerId) continue
    if (filters.siteId && e.siteId !== filters.siteId) continue
    const w = db.workers[e.workerId]
    const s = db.sites[e.siteId]
    if (filters.teamId && w?.teamId !== filters.teamId) continue
    if (filters.clientId && s?.clientId !== filters.clientId) continue
    const h = entryHours(e, settings)
    rows.push({
      workerId: e.workerId,
      workerNumber: w?.number ?? '',
      workerName: w?.name ?? '',
      date: e.date,
      siteCode: s?.code ?? '',
      siteName: s?.name ?? '',
      erpOrder: s?.erpOrder ?? '',
      hours: h.worked,
      normal: h.normal,
      extra: h.extra,
      activityCode: activityCode(e.date, h.worked, settings.activityCodes),
      status: e.status,
    })
  }
  return rows.sort((a, b) => a.workerName.localeCompare(b.workerName) || a.date.localeCompare(b.date))
}
