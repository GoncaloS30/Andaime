import type { Conflict } from './conflicts'
import { absenceOn, buildIndex, key } from './indexes'
import type { Assignment, DB, ID, ISODate } from './types'
import { addDays, diffDays, eachDay, isWeekend } from './weeks'

export type AssignmentDraft = Omit<Assignment, 'id'>

export interface SkippedDraft {
  workerId: ID
  date: ISODate
  reason: 'ausente' | 'inativo' | 'ja_planeado'
}

export const SKIP_REASON: Record<SkippedDraft['reason'], string> = {
  ausente: 'Ausência aprovada',
  inativo: 'Ficha inativa',
  ja_planeado: 'Já tem trabalho nesse dia',
}

/** Planeia a cópia de uma semana para outra, explicando o que não pode ser copiado. */
export function planCopyWeek(
  db: DB,
  fromWs: ISODate,
  toWs: ISODate,
  opts: { teamIds?: ID[]; workerIds?: ID[] },
): { drafts: AssignmentDraft[]; skipped: SkippedDraft[] } {
  const idx = buildIndex(db)
  const shift = diffDays(fromWs, toWs)
  const end = addDays(fromWs, 6)
  const source = Object.values(db.assignments)
    .filter((a) => a.date >= fromWs && a.date <= end)
    .filter((a) => !opts.teamIds || (a.teamId !== null && opts.teamIds.includes(a.teamId)))
    .filter((a) => !opts.workerIds || opts.workerIds.includes(a.workerId))
    .sort((a, b) => a.workerId.localeCompare(b.workerId) || a.date.localeCompare(b.date) || a.start.localeCompare(b.start))

  const drafts: AssignmentDraft[] = []
  const skipped: SkippedDraft[] = []
  const seen = new Set<string>()
  for (const a of source) {
    const date = addDays(a.date, shift)
    const k = key(a.workerId, date)
    const w = db.workers[a.workerId]
    const skip = (reason: SkippedDraft['reason']) => {
      if (!seen.has(`${k}|skip`)) skipped.push({ workerId: a.workerId, date, reason })
      seen.add(`${k}|skip`)
    }
    if (!w || w.status === 'inativo') {
      skip('inativo')
      continue
    }
    const ab = absenceOn(idx, a.workerId, date)
    if (ab && ab.type !== 'parcial') {
      skip('ausente')
      continue
    }
    if ((idx.byWorkerDate.get(k)?.length ?? 0) > 0) {
      skip('ja_planeado')
      continue
    }
    const { id: _id, ...rest } = a
    drafts.push({ ...rest, date, batchId: null })
  }
  return { drafts, skipped }
}

/** Dias úteis em que a previsão de fim passa o fim contratual (0 se não passa). */
export function delayWorkdays(site: { contractEnd: ISODate; endDate: ISODate }): number {
  return site.endDate > site.contractEnd ? workdaysBetween(addDays(site.contractEnd, 1), site.endDate).length : 0
}

export function workdaysBetween(from: ISODate, to: ISODate, includeWeekends = false): ISODate[] {
  return eachDay(from, to).filter((d) => includeWeekends || !isWeekend(d))
}

export function newConflicts(before: Conflict[], after: Conflict[]): Conflict[] {
  const known = new Set(before.map((c) => c.id))
  return after.filter((c) => !known.has(c.id))
}
