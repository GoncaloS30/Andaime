import type { DB } from '@/domain/types'
import type { Session } from './types'

/** Aumentar quando a forma do DB ou da semente mudar: dados antigos são substituídos por uma nova semente. */
export const STORE_VERSION = 6
export const STORAGE_KEY = 'andaime:demo'
const PREF_KEY = 'andaime:guardar-localmente'

interface Snapshot {
  version: number
  db: DB
  session: Session
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function persistEnabled(): boolean {
  try {
    return storage()?.getItem(PREF_KEY) !== 'nao'
  } catch {
    return false
  }
}

export function setPersistEnabled(on: boolean) {
  try {
    storage()?.setItem(PREF_KEY, on ? 'sim' : 'nao')
    if (!on) storage()?.removeItem(STORAGE_KEY)
  } catch {
    /* armazenamento bloqueado: a demonstração continua em memória */
  }
}

export function loadSnapshot(): Snapshot | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as Snapshot
    if (snap.version !== STORE_VERSION || !snap.db || !snap.session) return null
    return snap
  } catch {
    return null
  }
}

let timer: ReturnType<typeof setTimeout> | null = null

export function saveSnapshot(db: DB, session: Session) {
  if (!persistEnabled()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      const snap: Snapshot = { version: STORE_VERSION, db, session: { ...session, syncing: false } }
      storage()?.setItem(STORAGE_KEY, JSON.stringify(snap))
    } catch {
      /* quota ou modo privado: ignora */
    }
  }, 400)
}

export function clearSnapshot() {
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    /* ignora */
  }
}
