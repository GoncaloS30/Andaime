import { ImagePlus, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/ui/Button'
import { errorMessage } from '../../api/http'

interface PhotoControlsProps {
  hasPhoto: boolean
  /** Nome do que a foto mostra, para os nomes acessíveis ("fotografia de Ana Silva"). */
  subject: string
  uploading: boolean
  removing: boolean
  onUpload: (file: File) => Promise<unknown>
  onRemove: () => Promise<unknown>
}

/** Mudar e remover a fotografia (só gestores). JPEG, PNG ou WebP até 5 MB; o servidor confirma o tipo pelo conteúdo. */
export function PhotoControls({ hasPhoto, subject, uploading, removing, onUpload, onRemove }: PhotoControlsProps) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-wrap gap-1">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          if (file.size > 5 * 1024 * 1024) {
            toast.error('A fotografia tem mais de 5 MB.')
            return
          }
          onUpload(file).then(
            () => toast.success('Fotografia atualizada'),
            (error: unknown) => toast.error(errorMessage(error)),
          )
        }}
      />
      <Button size="sm" variant="ghost" icon={<ImagePlus className="size-4" />} loading={uploading} onClick={() => input.current?.click()}>
        <span>
          {hasPhoto ? 'Mudar fotografia' : 'Pôr fotografia'}
          <span className="sr-only"> de {subject}</span>
        </span>
      </Button>
      {hasPhoto && (
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 className="size-4" />}
          loading={removing}
          onClick={() =>
            onRemove().then(
              () => toast.success('Fotografia removida'),
              (error: unknown) => toast.error(errorMessage(error)),
            )
          }
        >
          <span>
            Remover<span className="sr-only"> fotografia de {subject}</span>
          </span>
        </Button>
      )}
    </div>
  )
}
