import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent' | 'dark'

const tones: Record<Tone, string> = {
  neutral: 'bg-line-2 text-ink-2',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-ambar-soft text-ambar-ink',
  danger: 'bg-tijolo-soft text-tijolo-ink',
  info: 'bg-aco-soft text-aco-ink',
  accent: 'bg-lima-soft text-pinho',
  dark: 'bg-pinho text-white',
}

const dots: Record<Tone, string> = {
  neutral: 'bg-ink-4',
  ok: 'bg-ok',
  warn: 'bg-ambar',
  danger: 'bg-tijolo',
  info: 'bg-aco',
  accent: 'bg-lima-2',
  dark: 'bg-lima',
}

interface BadgeProps {
  tone?: Tone
  children: ReactNode
  dot?: boolean
  icon?: ReactNode
  className?: string
  title?: string
}

/** Estado sempre com texto (e ponto/ícone): nunca só cor. */
export function Badge({ tone = 'neutral', children, dot, icon, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-xs font-semibold whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dots[tone])} />}
      {icon}
      {children}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line bg-surface px-1 font-mono text-[11px] text-ink-3">
      {children}
    </kbd>
  )
}

/** Código de obra com a cor da obra como régua lateral. */
export function SiteCode({ code, color, className }: { code: string; color: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 font-mono text-xs font-medium text-ink-2 tabular', className)}
    >
      <span aria-hidden className="h-3 w-1 rounded-full" style={{ background: color }} />
      {code}
    </span>
  )
}

export function Plate({ plate, className }: { plate: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-xs border border-ink-4/60 bg-surface px-1.5 font-mono text-[11px] font-semibold tracking-wide text-ink',
        className,
      )}
    >
      {plate}
    </span>
  )
}
