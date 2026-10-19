/** Cópia da demonstração: o estado completo em JSON, opcionalmente com as fotos carregadas (data URLs). */
export const BACKUP_KIND = 'andaime-demo'

export interface Backup<D = unknown, S = unknown> {
  kind: typeof BACKUP_KIND
  version: number
  exportedAt: string
  db: D
  session: S
  /** id da foto → data URL. Só existe quando se escolheu incluir as fotos. */
  photos?: Record<string, string>
}

export function makeBackup<D, S>(state: { db: D; session: S }, version: number, exportedAt: string, photos?: Record<string, string>): Backup<D, S> {
  return { kind: BACKUP_KIND, version, exportedAt, db: state.db, session: state.session, ...(photos ? { photos } : {}) }
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string }

export function parseBackup(text: string, version: number): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'O ficheiro não é uma cópia do Andaime (não é JSON).' }
  }
  const b = raw as Partial<Backup>
  if (!b || typeof b !== 'object' || b.kind !== BACKUP_KIND || typeof b.db !== 'object' || typeof b.session !== 'object' || !b.db || !b.session) {
    return { ok: false, error: 'O ficheiro não é uma cópia do Andaime.' }
  }
  if (b.version !== version) {
    return { ok: false, error: `A cópia é da versão ${b.version} dos dados e esta demonstração usa a versão ${version}. Exporte de novo a partir da mesma versão.` }
  }
  return { ok: true, backup: b as Backup }
}

/** Ids de todas as fotos carregadas referidas no estado (retratos, obras, diário, hotéis…). */
export function uploadedPhotoIds(db: unknown): string[] {
  const ids = new Set<string>()
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) return v.forEach(walk)
    const o = v as Record<string, unknown>
    if (o.kind === 'carregada' && typeof o.id === 'string') ids.add(o.id)
    else Object.values(o).forEach(walk)
  }
  walk(db)
  return [...ids]
}
