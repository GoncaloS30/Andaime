import type { Absence, Assignment, DB, ID, ISODate, TimeEntry } from './types'

/** Índices de leitura rápida sobre o DB. Calculados uma vez por versão do DB. */
export interface DBIndex {
  db: DB
  byWorkerDate: Map<string, Assignment[]>
  bySiteDate: Map<string, Assignment[]>
  byVehicleDate: Map<string, Assignment[]>
  byDate: Map<ISODate, Assignment[]>
  entriesByWorkerDate: Map<string, TimeEntry[]>
  approvedAbsencesByWorker: Map<ID, Absence[]>
}

export const key = (a: string, b: string) => `${a}|${b}`

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k)
  if (list) list.push(v)
  else m.set(k, [v])
}

const cache = new WeakMap<DB, DBIndex>()

export function buildIndex(db: DB): DBIndex {
  const hit = cache.get(db)
  if (hit) return hit
  const idx: DBIndex = {
    db,
    byWorkerDate: new Map(),
    bySiteDate: new Map(),
    byVehicleDate: new Map(),
    byDate: new Map(),
    entriesByWorkerDate: new Map(),
    approvedAbsencesByWorker: new Map(),
  }
  for (const a of Object.values(db.assignments)) {
    push(idx.byWorkerDate, key(a.workerId, a.date), a)
    push(idx.bySiteDate, key(a.siteId, a.date), a)
    push(idx.byDate, a.date, a)
    if (a.vehicleId) push(idx.byVehicleDate, key(a.vehicleId, a.date), a)
  }
  for (const e of Object.values(db.entries)) push(idx.entriesByWorkerDate, key(e.workerId, e.date), e)
  for (const ab of Object.values(db.absences)) {
    if (ab.status === 'aprovado') push(idx.approvedAbsencesByWorker, ab.workerId, ab)
  }
  cache.set(db, idx)
  return idx
}

export function absenceOn(idx: DBIndex, workerId: ID, date: ISODate): Absence | undefined {
  return idx.approvedAbsencesByWorker.get(workerId)?.find((a) => a.start <= date && a.end >= date)
}
