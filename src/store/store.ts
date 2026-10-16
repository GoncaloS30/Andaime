import { useStore } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { createStore, type StoreApi as ZStore } from 'zustand/vanilla'
import { createSeed } from '@/data/seed'
import { DEFAULT_SETTINGS, type HHMM, type ISODate } from '@/domain/types'
import { localToday } from '@/domain/weeks'
import { planningActions } from './actions/planning'
import { operationActions } from './actions/operations'
import { photoActions } from './actions/photos'
import { resourceActions } from './actions/resources'
import type { StoreApi } from './api'
import { uid } from './helpers'
import { clearSnapshot, loadSnapshot, persistEnabled, saveSnapshot } from './persistence'
import type { DemoState, Session } from './types'

export interface StoreOptions {
  /** Data "de hoje" da demonstração (por defeito, a do dispositivo). */
  today?: ISODate
  /** Guardar no localStorage (por defeito, segundo a preferência do utilizador). */
  persist?: boolean
  /** Atraso entre operações ao sincronizar a caixa de saída. */
  syncDelayMs?: number
  /** Relógio HH:MM (injetável em testes). */
  clock?: () => HHMM
}

function realClock(): HHMM {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function freshState(today: ISODate): Pick<DemoState, 'db' | 'session'> {
  const { db, personas } = createSeed({ today })
  const session: Session = {
    today,
    role: 'gestor',
    personas: { ...personas },
    online: true,
    outbox: [],
    syncing: false,
    flags: { emptyCompany: false, simulateError: false },
    settings: DEFAULT_SETTINGS,
    seededAt: new Date().toISOString(),
  }
  return { db, session }
}

export function createDemoStore(opts: StoreOptions = {}): ZStore<DemoState> {
  const today = opts.today ?? localToday()
  const clock = opts.clock ?? realClock
  const usePersist = opts.persist ?? persistEnabled()
  const restored = usePersist ? loadSnapshot() : null
  const initial = restored ?? freshState(today)

  const store = createStore<DemoState>()(
    immer((set, get) => {
      const api: StoreApi = {
        set: (fn) => set(fn),
        get,
        clock,
        mctx: () => ({ uid, today: get().session.today, settings: get().session.settings }),
        snapshot: (label) => ({ label, db: get().db }),
        syncDelayMs: opts.syncDelayMs ?? 550,
        freshState: () => freshState(opts.today ?? localToday()),
      }
      return {
        db: initial.db,
        session: { ...initial.session, syncing: false },
        undoStack: [],
        ...planningActions(api),
        ...resourceActions(api),
        ...operationActions(api),
        ...photoActions(api),
      }
    }),
  )

  if (usePersist) {
    store.subscribe((s, prev) => {
      if (s.db !== prev.db || s.session !== prev.session) saveSnapshot(s.db, s.session)
    })
  }
  return store
}

/** Store única da aplicação. */
export const demoStore = createDemoStore()

export function useDemo<T>(selector: (s: DemoState) => T): T {
  return useStore(demoStore, selector)
}

export { clearSnapshot }
