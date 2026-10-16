import type { Conflict } from '@/domain/conflicts'
import { absenceOn, buildIndex, key } from '@/domain/indexes'
import type { Absence, Assignment, DB, ID, ISODate, TimeEntry } from '@/domain/types'
import { addDays, isWeekend } from '@/domain/weeks'

export type Perspective = 'trabalhadores' | 'equipas' | 'obras' | 'viaturas'
export type Scale = 'semana' | 'mes'

export interface Run {
  siteId: ID
  from: ISODate
  to: ISODate
  days: number
  ids: ID[]
}

/** Períodos contínuos na mesma obra (fins de semana sem trabalho não quebram o período). */
export function runs(list: Assignment[]): Run[] {
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  const out: Run[] = []
  for (const a of sorted) {
    const last = out[out.length - 1]
    if (last && last.siteId === a.siteId && last.to === a.date) {
      last.ids.push(a.id)
      continue
    }
    if (last && last.siteId === a.siteId && contiguous(last.to, a.date)) {
      last.to = a.date
      last.days++
      last.ids.push(a.id)
      continue
    }
    out.push({ siteId: a.siteId, from: a.date, to: a.date, days: 1, ids: [a.id] })
  }
  return out
}

function contiguous(prev: ISODate, next: ISODate) {
  for (let d = addDays(prev, 1); d < next; d = addDays(d, 1)) if (!isWeekend(d)) return false
  return true
}

export function conflictIndex(conflicts: Conflict[]): Map<ID, Conflict[]> {
  const m = new Map<ID, Conflict[]>()
  for (const c of conflicts) {
    for (const id of c.assignmentIds) {
      const list = m.get(id) ?? []
      list.push(c)
      m.set(id, list)
    }
  }
  for (const list of m.values()) list.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critico' ? -1 : 1))
  return m
}

export interface CellInfo {
  assignments: Assignment[]
  entries: TimeEntry[]
  absence: Absence | undefined
}

/** Leitura rápida de uma célula trabalhador × dia. */
export function cellOf(db: DB, workerId: ID, date: ISODate): CellInfo {
  const idx = buildIndex(db)
  return {
    assignments: (idx.byWorkerDate.get(key(workerId, date)) ?? []).slice().sort((a, b) => a.start.localeCompare(b.start)),
    entries: idx.entriesByWorkerDate.get(key(workerId, date)) ?? [],
    absence: absenceOn(idx, workerId, date),
  }
}
