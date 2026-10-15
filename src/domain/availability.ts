import { absenceOn, buildIndex, key, type DBIndex } from './indexes'
import type { Absence, ISODate, Worker } from './types'

export { buildIndex }

export type AvailabilityState = 'livre' | 'parcial' | 'atribuido' | 'ausente' | 'inativo'

export interface Availability {
  state: AvailabilityState
  plannedHours: number
  capacity: number
  absence?: Absence
}

/** Estado de um trabalhador num dia, considerando ausências aprovadas e atribuições. */
export function availability(worker: Worker, date: ISODate, idx: DBIndex): Availability {
  const planned = (idx.byWorkerDate.get(key(worker.id, date)) ?? []).reduce((s, a) => s + a.hours, 0)
  if (worker.status === 'inativo') return { state: 'inativo', plannedHours: planned, capacity: 0 }

  const absence = absenceOn(idx, worker.id, date)
  let capacity = worker.dailyHours
  if (absence) {
    if (absence.type !== 'parcial') return { state: 'ausente', plannedHours: planned, capacity: 0, absence }
    capacity = Math.max(0, worker.dailyHours - (absence.hours ?? 0))
  }

  const state: AvailabilityState =
    planned === 0 ? (absence ? 'parcial' : 'livre') : planned >= capacity ? 'atribuido' : 'parcial'
  return absence ? { state, plannedHours: planned, capacity, absence } : { state, plannedHours: planned, capacity }
}
