import { Camera, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { PhotoRef } from '@/domain/photos'
import { cn } from '@/lib/cn'
import { photoStore } from '@/lib/photos/photoStore'
import { resizeImage } from '@/lib/photos/resize'
import type { PhotoTarget } from '@/store/actions/photos'
import { uid } from '@/store/helpers'
import { useDemo } from '@/store/store'
import { Button, buttonStyles } from './Button'

interface PhotoUploadProps {
  target: PhotoTarget
  current: PhotoRef | undefined
  /** Texto alternativo da foto nova (p. ex. "Retrato de Rui Fontes"). */
  alt: string
  label?: string
  className?: string
}

/** Carregar (telemóvel ou PC) e remover a foto de um registo. A foto é reduzida no navegador e fica no IndexedDB. */
export function PhotoUpload({ target, current, alt, label = 'Alterar foto', className }: PhotoUploadProps) {
  const setPhoto = useDemo((s) => s.setPhoto)
  const undo = useDemo((s) => s.undo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const { blob, w, h } = await resizeImage(file)
      const id = uid('ph')
      await photoStore.put(id, blob)
      setPhoto(target, { kind: 'carregada', id, alt, w, h })
      toast.success('Foto atualizada', {
        description: photoStore.persistent ? undefined : 'Esta janela não guarda fotos: a foto desaparece quando fechar o separador.',
        action: { label: 'Anular', onClick: () => undo() },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar a foto. Tente outra imagem.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <label className={cn(buttonStyles('secondary', 'sm'), 'cursor-pointer focus-within:ring-2 focus-within:ring-pinho focus-within:ring-offset-1')}>
        <Camera className="size-3.5" aria-hidden />
        {label}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            void pick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
      {current && (
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 className="size-3.5" />}
          onClick={() => {
            setPhoto(target, null)
            toast('Foto removida', { action: { label: 'Anular', onClick: () => undo() } })
          }}
        >
          Remover foto
        </Button>
      )}
      {busy && <span role="status" className="text-xs text-ink-3">A preparar a foto…</span>}
      {error && <span role="alert" className="text-xs text-tijolo-ink">{error}</span>}
    </div>
  )
}
