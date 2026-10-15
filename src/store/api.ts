import type { HHMM } from '@/domain/types'
import type { MCtx } from './mutations'
import type { DemoState, UndoSnapshot } from './types'

/** O que cada grupo de ações recebe da fábrica da store. */
export interface StoreApi {
  set: (fn: (s: DemoState) => void) => void
  get: () => DemoState
  clock: () => HHMM
  mctx: () => MCtx
  snapshot: (label: string) => UndoSnapshot
  syncDelayMs: number
  freshState: () => Pick<DemoState, 'db' | 'session'>
}

export function pushUndo(s: DemoState, snap: UndoSnapshot) {
  s.undoStack.push(snap)
  if (s.undoStack.length > 25) s.undoStack.shift()
}
