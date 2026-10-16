import { useEffect, useState } from 'react'
import { photoUrl, type PhotoRef } from '@/domain/photos'
import { photoStore } from './photoStore'

/** URL a mostrar para uma foto. As carregadas vêm do IndexedDB como object URL, libertado quando já não é preciso. */
export function usePhotoUrl(ref: PhotoRef | undefined): string | null {
  const id = ref?.kind === 'carregada' ? ref.id : null
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    let made: string | null = null
    void photoStore.get(id).then((b) => {
      if (!alive || !b) return
      made = URL.createObjectURL(b)
      setLoaded({ id, url: made })
    })
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [id])
  if (!ref) return null
  if (ref.kind === 'banco') return photoUrl(ref, 'm')
  return loaded?.id === ref.id ? loaded.url : null
}
