import { cn } from '@/lib/cn'

export function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase()
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
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none font-wide',
        size === 'xs' && 'size-5 text-[9px]',
        size === 'sm' && 'size-7 text-[11px]',
        size === 'md' && 'size-9 text-sm',
        size === 'lg' && 'size-14 text-lg',
        ring && 'ring-2 ring-surface',
        className,
      )}
      style={{ background: color }}
    >
      {initials(name)}
    </span>
  )
}
