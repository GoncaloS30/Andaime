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
  rounded?: 'none' | 'sm' | 'md' | 'full'
  fallback: ReactNode
  className?: string
}

const ROUND = { none: '', sm: 'rounded-sm', md: 'rounded-md', full: 'rounded-full' }

/** Foto com proporção reservada (sem saltos), tratamento de cor da marca e alternativa se faltar. */
export function Photo({ photo, format, sizes, alt, eager, rounded = 'md', fallback, className }: PhotoProps) {
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
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(url)}
          className="size-full object-cover motion-safe:animate-fade-in"
        />
      ) : (
        <span className="flex size-full items-center justify-center">{fallback}</span>
      )}
    </span>
  )
}
