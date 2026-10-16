/** Fotos carregadas na demonstração. Ficam no IndexedDB deste navegador; sem ele, só em memória. */
const DB_NAME = 'andaime-fotos'
const STORE = 'fotos'

export interface PhotoStore {
  /** false = as fotos desaparecem ao fechar o separador (sem IndexedDB, p. ex. janela privada). */
  readonly persistent: boolean
  put(id: string, blob: Blob): Promise<void>
  get(id: string): Promise<Blob | null>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

function memoryStore(): PhotoStore {
  const m = new Map<string, Blob>()
  return {
    persistent: false,
    put: async (id, b) => void m.set(id, b),
    get: async (id) => m.get(id) ?? null,
    remove: async (id) => void m.delete(id),
    clear: async () => m.clear(),
  }
}

export function createPhotoStore(idb: IDBFactory | null | undefined = globalThis.indexedDB): PhotoStore {
  if (!idb) return memoryStore()
  // Se a abertura falhar (navegador sem permissão de armazenamento), passa a memória sem perder o que já se guardou.
  let fallback: PhotoStore | null = null
  let opening: Promise<IDBDatabase> | null = null
  const open = () =>
    (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }))
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  const guarded = async <T>(viaIdb: () => Promise<T>, viaMemory: (m: PhotoStore) => Promise<T>): Promise<T> => {
    if (fallback) return viaMemory(fallback)
    try {
      return await viaIdb()
    } catch {
      fallback = memoryStore()
      return viaMemory(fallback)
    }
  }
  return {
    get persistent() {
      return !fallback
    },
    put: (id, b) => guarded(async () => void (await run('readwrite', (s) => s.put(b, id))), (m) => m.put(id, b)),
    get: (id) => guarded(async () => (await run<Blob | undefined>('readonly', (s) => s.get(id))) ?? null, (m) => m.get(id)),
    remove: (id) => guarded(async () => void (await run('readwrite', (s) => s.delete(id))), (m) => m.remove(id)),
    clear: () => guarded(async () => void (await run('readwrite', (s) => s.clear())), (m) => m.clear()),
  }
}

/** Instância da aplicação. */
export const photoStore: PhotoStore = createPhotoStore()
