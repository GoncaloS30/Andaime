import { useDraggable } from '@dnd-kit/core'
import { AlertOctagon, AlertTriangle, Check, Crown } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { Conflict } from '@/domain/conflicts'
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
  /** Contexto para leitores de ecrã (ex.: trabalhador e dia). */
  context?: string
  /** Código discreto quando é a obra habitual da equipa (destaca as exceções). */
  muteCode?: boolean
  /** Mostra a pega para alterar o período arrastando (perspetiva por trabalhador). */
  resizable?: boolean
}

/**
 * Bloco de atribuição. Tracejado = planeado; sólido com ✓ = já tem registo (realizado).
 * Conflito: contorno tijolo/âmbar + ícone (nunca só cor).
 */
export function AssignmentChip({
  a, site, label, sub, entry, realizedHours, conflicts, selected, dimmed, focused, today, onSelect, onOpen, draggable = true, context, muteCode, resizable,
}: ChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `a:${a.id}`,
    data: { type: 'assignment', id: a.id },
    disabled: !draggable,
  })
  const {
    attributes: hAttributes,
    listeners: hListeners,
    setNodeRef: hRef,
    isDragging: hDragging,
  } = useDraggable({ id: `r:${a.id}`, data: { type: 'resize', id: a.id }, disabled: !resizable })
  // Realizado só com saída registada; com entrada e sem saída está a decorrer.
  const realized = !!entry && entry.status !== 'rejeitado' && !!entry.clockOut
  const live = !!entry && entry.status === 'aberto' && !entry.clockOut
  const past = a.date < today
  const conflict = conflicts?.[0]
  const color = site?.color ?? '#7d847f'
  const shown = realized && realizedHours !== undefined ? Math.round(realizedHours * 10) / 10 : a.hours
  const text = `${context ? `${context}: ` : ''}${label ?? site?.code.slice(3) ?? 'Obra'} ${shown.toLocaleString('pt-PT')}h, ${a.start}–${a.end}${realized ? ', com registo' : live ? ', a decorrer' : ', planeado'}${conflict ? `. Conflito: ${conflict.title}` : ''}`

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
    <div className="group/chip relative">
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
        realized ? 'bg-[color-mix(in_oklab,var(--chip)_16%,white)]' : past ? 'bg-line-2' : 'bg-surface',
        !realized && !past && 'hatch [--hatch:color-mix(in_oklab,var(--chip)_22%,transparent)]',
        conflict?.severity === 'critico' && 'ring-1 ring-tijolo ring-inset',
        conflict?.severity === 'aviso' && 'ring-1 ring-ambar ring-inset',
        focused && 'animate-pulse-once ring-2 ring-tijolo',
        selected && 'outline-2 outline-pinho',
        isDragging && 'opacity-30',
        dimmed && 'border-l-line bg-line-2 [--chip:var(--color-line)]',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
      style={{ ['--chip' as string]: color, borderLeftColor: color }}
    >
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate font-mono text-[11px] leading-tight', muteCode ? 'font-normal text-ink-2' : 'font-semibold text-ink')}>{label ?? site?.code.slice(3)}</span>{' '}
        <span className="flex items-center gap-1 font-mono text-[10px] leading-tight text-ink-2 tabular">
          {realized && <Check aria-hidden className="size-2.5 shrink-0 text-ok" />}
          {live && <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-ok motion-reduce:animate-none" />}
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
    {resizable && (
      <button
        ref={hRef}
        type="button"
        {...hAttributes}
        {...hListeners}
        aria-label={`Alterar período: arraste até ao último dia${context ? ` (${context})` : ''}`}
        data-resize={a.id}
        className={cn(
          'absolute inset-y-0 -right-1 z-10 w-2.5 cursor-ew-resize rounded-r-xs opacity-0 transition-opacity',
          'group-hover/chip:opacity-100 focus-visible:opacity-100',
          'after:absolute after:inset-y-1.5 after:left-1/2 after:w-[3px] after:-translate-x-1/2 after:rounded-full after:bg-pinho/70',
          hDragging && 'opacity-100',
        )}
      />
    )}
    </div>
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
