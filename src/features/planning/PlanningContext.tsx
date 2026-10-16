import { createContext, useContext } from 'react'
import type { Conflict } from '@/domain/conflicts'
import type { DB, ID, ISODate } from '@/domain/types'

export interface AddTarget {
  workerId?: ID
  siteId?: ID
  date: ISODate
}

export interface PlanningCtx {
  db: DB
  today: ISODate
  days: ISODate[]
  conflictsByAssignment: Map<ID, Conflict[]>
  focusIds: Set<ID>
  recentIds: Set<ID>
  selected: Set<ID>
  select: (id: ID, additive: boolean) => void
  open: (id: ID) => void
  add: (t: AddTarget) => void
  filterSite: ID | null
  filterTeam: ID | null
  query: string
}

export const PlanningContext = createContext<PlanningCtx | null>(null)

export function usePlanning(): PlanningCtx {
  const ctx = useContext(PlanningContext)
  if (!ctx) throw new Error('PlanningContext em falta')
  return ctx
}
