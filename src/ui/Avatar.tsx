import { cn } from '@/lib/cn'

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
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  ring?: boolean
}

export function Avatar({ name, color = '#24543f', size = 'sm', className, ring }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none font-wide',
        size === 'xs' && 'size-5 text-[9px]',
        size === 'sm' && 'size-7 text-[11px]',
        size === 'md' && 'size-9 text-sm',
        size === 'lg' && 'size-14 text-lg',
        ring && 'ring-2 ring-surface',
        className,
      )}
      style={{ background: avatarBackground(color), color: '#ffffff' }}
    >
      {initials(name)}
    </span>
  )
}
