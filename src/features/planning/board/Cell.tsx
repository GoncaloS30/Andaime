import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface CellProps {
  id: string
  data: Record<string, unknown>
  children?: ReactNode
  today?: boolean
  weekend?: boolean
  muted?: boolean
  onAdd?: () => void
  addLabel?: string
  className?: string
  /** Horas planeadas e capacidade, para a régua de capacidade. */
  ruler?: { hours: number; capacity: number }
}

/** Célula onde se larga. A régua de 8 marcas mostra a ocupação do dia. */
export function DropCell({ id, data, children, today, weekend, muted, onAdd, addLabel, className, ruler }: CellProps) {
  const { setNodeRef, isOver, active } = useDroppable({ id, data })
  const over = ruler ? ruler.hours > ruler.capacity : false
  return (
    <div
      ref={setNodeRef}
      data-cell={id}
      className={cn(
        'group/cell relative flex min-h-12 flex-col gap-0.5 border-t border-l border-line-2 p-1 pb-2',
        today && 'bg-lima-soft/35',
        weekend && 'bg-line-2/45',
        muted && 'bg-[repeating-linear-gradient(135deg,var(--color-line-2)_0_6px,transparent_6px_12px)]',
        active && 'transition-colors',
        isOver && 'bg-lima/30 ring-2 ring-lima ring-inset',
        className,
      )}
    >
      {children}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          className="mt-auto flex h-5 items-center justify-center rounded-xs text-ink-4 opacity-0 transition-opacity group-hover/cell:opacity-100 hover:bg-line-2 hover:text-ink focus-visible:opacity-100"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      )}
      {ruler && ruler.capacity > 0 && (
        <span aria-hidden className="absolute inset-x-1 bottom-0.5 h-[3px] overflow-hidden rounded-full bg-line-2 ruler-ticks">
          <span
            className={cn('block h-full rounded-full', over ? 'bg-ambar' : 'bg-pinho/55')}
            style={{ width: `${Math.min(100, (ruler.hours / ruler.capacity) * 100)}%` }}
          />
        </span>
      )}
    </div>
  )
}
