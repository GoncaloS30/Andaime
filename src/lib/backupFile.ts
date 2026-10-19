import { makeBackup, uploadedPhotoIds } from '@/domain/backup'
import { photoStore } from '@/lib/photos/photoStore'

/** Tamanho total das fotos carregadas que o estado usa (para avisar antes de as incluir na cópia). */
export async function uploadedPhotosSize(db: unknown): Promise<{ count: number; bytes: number }> {
  let bytes = 0
  let count = 0
  for (const id of uploadedPhotoIds(db)) {
    const b = await photoStore.get(id)
    if (b) {
      bytes += b.size
      count++
    }
  }
  return { count, bytes }
}

const toDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })

/** A cópia em JSON, pronta a descarregar. */
export async function backupBlob(state: { db: unknown; session: unknown }, version: number, now: string, includePhotos: boolean): Promise<Blob> {
  let photos: Record<string, string> | undefined
  if (includePhotos) {
    photos = {}
    for (const id of uploadedPhotoIds(state.db)) {
      const b = await photoStore.get(id)
      if (b) photos[id] = await toDataUrl(b)
    }
  }
  return new Blob([JSON.stringify(makeBackup(state, version, now, photos))], { type: 'application/json' })
}

/** Põe no armazenamento de fotos as que vieram na cópia. Devolve quantas ficaram. */
export async function restorePhotos(photos: Record<string, string> | undefined): Promise<number> {
  if (!photos) return 0
  let n = 0
  for (const [id, url] of Object.entries(photos)) {
    try {
      await photoStore.put(id, await (await fetch(url)).blob())
      n++
    } catch {
      /* uma foto estragada não impede o resto da cópia */
    }
  }
  return n
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}
