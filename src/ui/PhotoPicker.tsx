import { Camera, ImagePlus, X } from 'lucide-react'
import { useState } from 'react'
import type { PhotoRef } from '@/domain/photos'
import { cn } from '@/lib/cn'
import { photoStore } from '@/lib/photos/photoStore'
import { resizeImage } from '@/lib/photos/resize'
import { uid } from '@/store/helpers'
import { buttonStyles } from './Button'
import { Photo } from './Photo'

interface PhotoPickerProps {
  value: PhotoRef[]
  onChange: (photos: PhotoRef[]) => void
  max: number
  /** Texto alternativo base: "<base> — foto N". */
  altBase: string
  /** No telemóvel, abrir a câmara traseira diretamente. */
  camera?: boolean
}

/** Várias fotos de uma vez: reduzidas no navegador, guardadas no IndexedDB, com pré-visualização e remoção. */
export function PhotoPicker({ value, onChange, max, altBase, camera }: PhotoPickerProps) {
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const room = max - value.length

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    const list = [...files].slice(0, room)
    if (files.length > room) setError(`Só cabem mais ${room} ${room === 1 ? 'foto' : 'fotos'} (máximo ${max}).`)
    setBusy(list.length)
    const added: PhotoRef[] = []
    for (const file of list) {
      try {
        const { blob, w, h } = await resizeImage(file)
        const id = uid('ph')
        await photoStore.put(id, blob)
        added.push({ kind: 'carregada', id, alt: `${altBase} — foto ${value.length + added.length + 1}`, w, h })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não foi possível carregar uma das fotos.')
      }
      setBusy((b) => b - 1)
    }
    onChange([...value, ...added])
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Fotos do registo">
          {value.map((p, i) => (
            <li key={p.kind === 'banco' ? p.src : p.id} className="relative">
              <Photo photo={p} format="viatura" alt={p.alt} sizes="120px" rounded="sm" fallback={null} />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, k) => k !== i))}
                aria-label={`Remover foto ${i + 1}`}
                className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-pinho/85 text-white hover:bg-pinho"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {room > 0 && (
          <label className={cn(buttonStyles('secondary', 'md'), 'cursor-pointer focus-within:ring-2 focus-within:ring-pinho focus-within:ring-offset-1')}>
            {camera ? <Camera className="size-4" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            {camera ? 'Tirar ou escolher fotos' : 'Acrescentar fotos'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              {...(camera ? { capture: 'environment' as const } : {})}
              className="sr-only"
              onChange={(e) => {
                void add(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        )}
        <span className="text-xs text-ink-3">
          {value.length} de {max} fotos
        </span>
        {busy > 0 && <span role="status" className="text-xs text-ink-3">A preparar {busy === 1 ? '1 foto' : `${busy} fotos`}…</span>}
      </div>
      {error && <p role="alert" className="text-xs text-tijolo-ink">{error}</p>}
    </div>
  )
}
