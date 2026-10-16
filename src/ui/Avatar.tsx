import type { PhotoRef } from '@/domain/photos'
import { cn } from '@/lib/cn'
import { Photo } from './Photo'

export function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase()
}

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}

function mix(hex: string, toward: [number, number, number], t: number): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return '#' + c.map((v, i) => Math.round(v + (toward[i]! - v) * t).toString(16).padStart(2, '0')).join('')
}

/**
 * Fundo do avatar com contraste ≥ 4,5:1 para as iniciais brancas:
 * escurece a cor (na direção da tinta) só o necessário, mantendo o tom da equipa.
 */
export function avatarBackground(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#24543f'
  let bg = hex
  for (let t = 0.1; 1.05 / (luminance(bg) + 0.05) < 4.5 && t <= 0.6; t += 0.1) bg = mix(hex, [31, 36, 33], t)
  return bg
}

interface AvatarProps {
  name: string
  color?: string
  /** Retrato. Sem foto (ou se falhar) mostra as iniciais. É sempre decorativo: o nome está ao lado. */
  photo?: PhotoRef
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  ring?: boolean
  /** Ponto Lima: em obra hoje. */
  onSite?: boolean
}

const BOX = { xs: 'size-5 text-[9px]', sm: 'size-7 text-[11px]', md: 'size-9 text-sm', lg: 'size-14 text-lg' }

export function Avatar({ name, color = '#24543f', photo, size = 'sm', className, ring, onSite }: AvatarProps) {
  const round = size === 'lg' ? 'rounded-md' : 'rounded-full'
  const letters = (
    <span aria-hidden className="flex size-full items-center justify-center font-semibold select-none font-wide" style={{ background: avatarBackground(color), color: '#ffffff' }}>
      {initials(name)}
    </span>
  )
  return (
    <span className={cn('relative inline-block shrink-0', round, BOX[size], ring && 'ring-2 ring-surface', className)}>
      <Photo photo={photo} format="retrato" alt="" sizes={size === 'lg' ? '56px' : '36px'} rounded={size === 'lg' ? 'md' : 'full'} fallback={letters} className="size-full" />
      {onSite && <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-surface bg-lima" />}
    </span>
  )
}

/** Retratos sobrepostos de uma equipa: até `max`, e o resto como "+N". */
export function PhotoStack({ people, max = 4 }: { people: { id: string; name: string; color?: string; photo?: PhotoRef }[]; max?: number }) {
  const rest = people.length - max
  return (
    <span className="flex -space-x-1.5">
      {people.slice(0, max).map((p) => <Avatar key={p.id} name={p.name} color={p.color} photo={p.photo} size="sm" ring />)}
      {rest > 0 && <span className="relative flex size-7 items-center justify-center rounded-full bg-pinho text-[11px] font-semibold text-lima ring-2 ring-surface">+{rest}</span>}
    </span>
  )
}
