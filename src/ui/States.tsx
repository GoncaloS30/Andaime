import { AlertTriangle, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

interface EmptyProps {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}

/** Estado vazio: o que é, porque está vazio e como começar. */
export function EmptyState({ icon, title, children, action, className, compact }: EmptyProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-1.5 px-4 py-6' : 'gap-2 px-6 py-12',
        className,
      )}
    >
      {icon && (
        <div className="mb-1 flex size-10 items-center justify-center rounded-full border border-dashed border-ink-4 text-ink-3 [&>svg]:size-5">
          {icon}
        </div>
      )}
      <p className="font-wide text-md font-semibold text-ink">{title}</p>
      {children && <div className="max-w-sm text-sm text-ink-3">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Não foi possível carregar', children, onRetry }: { title?: string; children?: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-tijolo-soft text-tijolo">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <p className="font-wide text-md font-semibold text-ink">{title}</p>
      <div className="max-w-sm text-sm text-ink-3">{children ?? 'A ligação falhou ao obter os dados. Os dados não foram alterados.'}</div>
      {onRetry && (
        <Button className="mt-2" icon={<RotateCcw className="size-4" />} onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-4', className)} />
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="A carregar" className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      ))}
    </div>
  )
}
