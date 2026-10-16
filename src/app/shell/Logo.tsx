import { cn } from '@/lib/cn'

/** Marca: dois prumos e travessas de andaime, com a diagonal de contraventamento. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-7', className)}>
      <rect width="32" height="32" rx="7" fill="#13342a" />
      <path d="M9 7v18M23 7v18M9 12h14M9 20h14M9 12l14 8" stroke="#c8e26a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function Wordmark({ className, onDark }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <LogoMark className={onDark ? 'ring-1 ring-white/15 rounded-[7px]' : undefined} />
      <span className={cn('font-expanded text-[17px] font-bold tracking-tight', onDark ? 'text-white' : 'text-pinho')}>Andaime</span>
    </span>
  )
}
