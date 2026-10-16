/** Fotos do Andaime: de banco (ficheiros em public/fotos) ou carregadas (IndexedDB). */
export type PhotoRef =
  | { kind: 'banco'; src: string; credit: string; alt: string; w: number; h: number }
  | { kind: 'carregada'; id: string; alt: string; w: number; h: number }

export type PhotoFormat = 'retrato' | 'capa' | 'viatura' | 'artigo'

export const PHOTO_FORMATS: Record<PhotoFormat, { ratio: number }> = {
  retrato: { ratio: 1 },
  capa: { ratio: 16 / 9 },
  viatura: { ratio: 4 / 3 },
  artigo: { ratio: 1 },
}

/** Largura do tamanho pequeno ("-s") e médio ("-m"), igual à do pipeline (scripts/fotos.mjs). */
export function sizeWidths(ref: Extract<PhotoRef, { kind: 'banco' }>): { s: number; m: number } {
  const cover = ref.src.startsWith('obras/')
  return { s: cover ? 320 : 200, m: cover ? 1280 : 800 }
}

export function photoUrl(ref: PhotoRef, size: 's' | 'm'): string | null {
  return ref.kind === 'banco' ? `/fotos/${ref.src}-${size}.webp` : null
}

export function photoSrcSet(ref: PhotoRef): string | undefined {
  if (ref.kind !== 'banco') return undefined
  const w = sizeWidths(ref)
  return `${photoUrl(ref, 's')} ${w.s}w, ${photoUrl(ref, 'm')} ${w.m}w`
}

/** Medidas que cabem num quadrado de lado `max`, sem deformar nem ampliar. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.round(w * k), h: Math.round(h * k) }
}
