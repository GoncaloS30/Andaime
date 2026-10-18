import { useState, type ReactNode } from 'react'
import { PHOTO_FORMATS, photoSrcSet, type PhotoFormat, type PhotoRef } from '@/domain/photos'
import { cn } from '@/lib/cn'
import { usePhotoUrl } from '@/lib/photos/usePhotoUrl'

interface PhotoProps {
  photo: PhotoRef | undefined
  format: PhotoFormat
  sizes?: string
  /** Por defeito, o alt da foto. "" = decorativa (o nome já está ao lado). */
  alt?: string
  eager?: boolean
  /** Foto visível ao abrir a página (candidata a LCP): carrega já e com prioridade alta. */
  priority?: boolean
  rounded?: 'none' | 'sm' | 'md' | 'full'
  fallback: ReactNode
  className?: string
}

const ROUND = { none: '', sm: 'rounded-sm', md: 'rounded-md', full: 'rounded-full' }

/** Foto com proporção reservada (sem saltos), tratamento de cor da marca e alternativa se faltar. */
export function Photo({ photo, format, sizes, alt, eager, priority, rounded = 'md', fallback, className }: PhotoProps) {
  const url = usePhotoUrl(photo)
  const [failed, setFailed] = useState<string | null>(null)
  const show = photo && url && failed !== url
  return (
    <span
      className={cn('photo-grade relative block shrink-0 overflow-hidden bg-line-2', ROUND[rounded], className)}
      style={{ aspectRatio: String(PHOTO_FORMATS[format].ratio) }}
    >
      {show ? (
        <img
          src={url}
          srcSet={photoSrcSet(photo)}
          sizes={sizes}
          alt={alt ?? photo.alt}
          width={photo.w}
          height={photo.h}
          loading={eager || priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          onError={() => setFailed(url)}
          className={cn('size-full object-cover', !priority && 'motion-safe:animate-fade-in')}
        />
      ) : (
        <span className="flex size-full items-center justify-center">{fallback}</span>
      )}
    </span>
  )
}
