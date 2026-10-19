import type { Absence, DB, ISODate, Worker } from './types'
import { addDays, isWeekend } from './weeks'

/** Dias úteis de um período contados só dentro do ano (uma passagem de ano reparte-se pelos dois). */
export function workdaysInYear(start: ISODate, end: ISODate, year: number): number {
  const from = start < `${year}-01-01` ? `${year}-01-01` : start
  const to = end > `${year}-12-31` ? `${year}-12-31` : end
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1)) if (!isWeekend(d)) n++
  return n
}

export interface YearRow {
  worker: Worker
  /** Ausências aprovadas e pedidas que tocam o ano (as rejeitadas não aparecem). */
  periods: Absence[]
  /** Dias úteis de férias aprovadas no ano. */
  vacationDays: number
  /** Dias úteis de férias pedidas, ainda por decidir. */
  pendingDays: number
}

/** O mapa do ano: uma linha por trabalhador ativo. Quem não tem nada marcado fica com a linha vazia — é isso que se vai lá ver. */
export function yearMap(db: DB, year: number): YearRow[] {
  const first = `${year}-01-01`
  const last = `${year}-12-31`
  const byWorker = new Map<string, Absence[]>()
  for (const a of Object.values(db.absences)) {
    if (a.status === 'rejeitado' || a.end < first || a.start > last) continue
    byWorker.set(a.workerId, [...(byWorker.get(a.workerId) ?? []), a])
  }
  return Object.values(db.workers)
    .filter((w) => w.status === 'ativo')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
    .map((worker) => {
      const periods = (byWorker.get(worker.id) ?? []).sort((a, b) => a.start.localeCompare(b.start))
      const days = (status: Absence['status']) =>
        periods.filter((p) => p.type === 'ferias' && p.status === status).reduce((n, p) => n + workdaysInYear(p.start, p.end, year), 0)
      return { worker, periods, vacationDays: days('aprovado'), pendingDays: days('pedido') }
    })
}

/** Anos do seletor: os que têm ausências, mais o corrente e o seguinte (para marcar as férias do próximo ano). */
export function yearsWithAbsences(db: DB, today: ISODate): number[] {
  const now = Number(today.slice(0, 4))
  const years = new Set<number>([now, now + 1])
  for (const a of Object.values(db.absences)) {
    years.add(Number(a.start.slice(0, 4)))
    years.add(Number(a.end.slice(0, 4)))
  }
  return [...years].sort((a, b) => a - b)
}
