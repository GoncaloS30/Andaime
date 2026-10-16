import { useDraggable } from '@dnd-kit/core'
import { AlertOctagon, AlertTriangle, Check, Crown } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { Conflict } from '@/domain/conflicts'
import { formatHours } from '@/domain/hours'
import type { Assignment, Site, TimeEntry } from '@/domain/types'
import { cn } from '@/lib/cn'

interface ChipProps {
  a: Assignment
  site: Site | undefined
  /** Texto principal (por defeito o código da obra). */
  label?: string
  sub?: string
  entry?: TimeEntry
  realizedHours?: number
  conflicts?: Conflict[]
  selected?: boolean
  dimmed?: boolean
  focused?: boolean
  today: string
  onSelect: (id: string, additive: boolean) => void
  onOpen: (id: string) => void
  draggable?: boolean
}

/**
 * Bloco de atribuição. Tracejado = planeado; sólido com ✓ = já tem registo (realizado).
 * Conflito: contorno tijolo/âmbar + ícone (nunca só cor).
 */
export function AssignmentChip({
  a, site, label, sub, entry, realizedHours, conflicts, selected, dimmed, focused, today, onSelect, onOpen, draggable = true,
}: ChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `a:${a.id}`,
    data: { type: 'assignment', id: a.id },
    disabled: !draggable,
  })
  const realized = !!entry && entry.status !== 'rejeitado'
  const past = a.date < today
  const conflict = conflicts?.[0]
  const color = site?.color ?? '#7d847f'
  const text = `${label ?? site?.code ?? 'Obra'}, ${formatHours(a.hours)}, ${a.start}–${a.end}${realized ? ', com registo' : ', planeado'}${conflict ? `. Conflito: ${conflict.title}` : ''}`

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    if (e.shiftKey || e.ctrlKey || e.metaKey) onSelect(a.id, true)
    else onOpen(a.id)
  }
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      onOpen(a.id)
    }
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onKeyDown={(e) => {
        handleKey(e)
        listeners?.onKeyDown?.(e)
      }}
      aria-label={text}
      aria-pressed={selected}
      data-assignment={a.id}
      className={cn(
        'group relative flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-xs border-l-[3px] px-1.5 py-1 text-left',
        'transition-[box-shadow,opacity,transform] duration-(--duration-fast) ease-(--ease-andaime)',
        'focus-visible:outline-2 focus-visible:outline-offset-1',
        realized ? 'bg-[color-mix(in_oklab,var(--chip)_16%,white)]' : 'bg-surface',
        !realized && !past && 'hatch [--hatch:color-mix(in_oklab,var(--chip)_22%,transparent)]',
        past && !realized && 'opacity-60',
        conflict?.severity === 'critico' && 'ring-1 ring-tijolo ring-inset',
        conflict?.severity === 'aviso' && 'ring-1 ring-ambar ring-inset',
        focused && 'animate-pulse-once ring-2 ring-tijolo',
        selected && 'outline-2 outline-pinho',
        isDragging && 'opacity-30',
        dimmed && 'opacity-35',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
      style={{ ['--chip' as string]: color, borderLeftColor: color }}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[11px] leading-tight font-semibold text-ink">{label ?? site?.code.slice(3)}</span>
        <span className="flex items-center gap-1 font-mono text-[10px] leading-tight text-ink-2 tabular">
          {realized && <Check aria-hidden className="size-2.5 shrink-0 text-ok" />}
          {(realized && realizedHours !== undefined ? Math.round(realizedHours * 10) / 10 : a.hours).toLocaleString('pt-PT')}h
          {a.isForeman && <Crown aria-hidden className="size-2.5 shrink-0 text-ambar-ink" />}
          {sub && <span className="truncate font-sans text-ink-3">{sub}</span>}
        </span>
      </span>
      {conflict &&
        (conflict.severity === 'critico' ? (
          <AlertOctagon aria-hidden className="absolute top-0.5 right-0.5 size-2.5 text-tijolo" />
        ) : (
          <AlertTriangle aria-hidden className="absolute top-0.5 right-0.5 size-2.5 text-ambar-ink" />
        ))}
    </button>
  )
}

/** Fantasma durante o arrasto: ligeiramente inclinado, elevado. */
export function ChipGhost({ label, color, hours }: { label: string; color: string; hours?: number }) {
  return (
    <div
      className="flex w-36 rotate-[1.5deg] items-center justify-between rounded-xs border-l-[3px] bg-surface px-2 py-1.5 font-mono text-[11px] font-semibold shadow-e2"
      style={{ borderLeftColor: color }}
    >
      <span className="truncate">{label}</span>
      {hours !== undefined && <span className="text-ink-3">{hours}h</span>}
    </div>
  )
}
