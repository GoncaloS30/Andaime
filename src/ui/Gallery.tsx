import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import type { PhotoRef } from '@/domain/photos'
import { Dialog } from './Overlay'
import { IconButton } from './Button'
import { Photo } from './Photo'

interface GalleryProps {
  photos: PhotoRef[]
  index: number | null
  onIndex: (i: number | null) => void
  title: string
}

/** Galeria em diálogo: setas (botões e teclado), contador, Esc fecha e o foco volta a quem a abriu (Radix). */
export function Gallery({ photos, index, onIndex, title }: GalleryProps) {
  const open = index !== null && photos.length > 0
  const i = index ?? 0
  const go = (d: number) => onIndex((i + d + photos.length) % photos.length)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onIndex(null)} size="xl" title={title} description={`Foto ${i + 1} de ${photos.length}`}>
      <div
        className="flex items-center gap-2"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
        }}
      >
        {photos.length > 1 && (
          <IconButton label="Foto anterior" onClick={() => go(-1)}>
            <ChevronLeft className="size-5" />
          </IconButton>
        )}
        <div className="min-w-0 flex-1">
          {open && <Photo key={i} photo={photos[i]} format="viatura" eager sizes="(min-width: 1024px) 900px, 100vw" rounded="sm" fallback={<ImageOff className="size-8 text-ink-4" aria-hidden />} />}
        </div>
        {photos.length > 1 && (
          <IconButton label="Foto seguinte" onClick={() => go(1)}>
            <ChevronRight className="size-5" />
          </IconButton>
        )}
      </div>
    </Dialog>
  )
}
