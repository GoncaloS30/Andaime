import { useDraggable } from '@dnd-kit/core'
import { Check, Crown, GripVertical } from 'lucide-react'
import { useState } from 'react'
import { availability, type AvailabilityState } from '@/domain/availability'
import { buildIndex } from '@/domain/indexes'
import type { ID } from '@/domain/types'
import { dayShort } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { Avatar } from '@/ui/Avatar'
import { Input } from '@/ui/Field'
import type { Perspective } from './model'
import { usePlanning } from './PlanningContext'

const STATE_DOT: Record<AvailabilityState, string> = {
  livre: 'bg-ok',
  parcial: 'bg-ambar',
  atribuido: 'bg-pinho',
  ausente: 'bg-tijolo',
  inativo: 'bg-ink-4',
}
const STATE_LABEL: Record<AvailabilityState, string> = {
  livre: 'livre',
  parcial: 'parcial',
  atribuido: 'atribuído',
  ausente: 'ausente',
  inativo: 'inativo',
}

function Legend() {
  return (
    <ul className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] text-ink-3" aria-label="Legenda do quadro">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="hatch h-3 w-4 rounded-xs border-l-2 border-pinho [--hatch:rgb(19_52_42/0.25)]" /> Planeado
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="flex h-3 w-4 items-center justify-center rounded-xs border-l-2 border-pinho bg-musgo-soft">
          <Check className="size-2.5 text-ok" />
        </span>
        Com registo
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-4 rounded-xs ring-1 ring-tijolo" /> Conflito
      </li>
      <li className="flex items-center gap-1.5">
        <Crown aria-hidden className="size-3 text-ambar-ink" /> Responsável
      </li>
    </ul>
  )
}

function DraggableSite({ id }: { id: ID }) {
  const { db } = usePlanning()
  const s = db.sites[id]!
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `site:${id}`, data: { type: 'site', siteId: id } })
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        className={cn(
          'flex w-full cursor-grab items-center gap-2 rounded-sm border border-line border-l-[3px] bg-surface px-2 py-1.5 text-left hover:border-ink-4 active:cursor-grabbing',
          isDragging && 'opacity-40',
        )}
        style={{ borderLeftColor: s.color }}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[11px] font-semibold text-ink-2">{s.code}</span>
          <span className="block truncate text-xs text-ink">{s.name}</span>
        </span>
        <GripVertical aria-hidden className="size-3.5 text-ink-4" />
      </button>
    </li>
  )
}

function DraggableWorker({ id, state, hours }: { id: ID; state: AvailabilityState; hours: number }) {
  const { db } = usePlanning()
  const w = db.workers[id]!
  const team = w.teamId ? db.teams[w.teamId] : undefined
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `worker:${id}`, data: { type: 'worker', workerId: id } })
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        className={cn(
          'flex w-full cursor-grab items-center gap-2 rounded-sm border border-line bg-surface px-2 py-1.5 text-left hover:border-ink-4 active:cursor-grabbing',
          isDragging && 'opacity-40',
        )}
      >
        <Avatar name={w.name} size="xs" color={team?.color ?? '#7d847f'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-ink">{w.name}</span>
          <span className="block truncate text-[10.5px] text-ink-3">{w.category}</span>
        </span>
        <span className="flex items-center gap-1 text-[10.5px] text-ink-3">
          <span aria-hidden className={cn('size-1.5 rounded-full', STATE_DOT[state])} />
          {state === 'parcial' ? `${hours}h` : STATE_LABEL[state]}
        </span>
      </button>
    </li>
  )
}

/** Bandeja: o que se arrasta para o quadro depende da perspetiva. */
export function Tray({ perspective }: { perspective: Perspective }) {
  const { db, days, today } = usePlanning()
  const [day, setDay] = useState(days.includes(today) ? today : days[0]!)
  const [q, setQ] = useState('')
  const activeDay = days.includes(day) ? day : days[0]!
  const idx = buildIndex(db)

  return (
    <aside aria-label="Bandeja de planeamento" className="flex w-60 shrink-0 flex-col gap-3 border-r border-line bg-cal/60 p-3">
      <Legend />
      {perspective === 'trabalhadores' && (
        <div className="flex min-h-0 flex-col gap-2">
          <p className="text-xs font-semibold text-ink-2">Obras</p>
          <p className="text-[11px] text-ink-3">Arraste uma obra para o dia de um trabalhador. Também pode usar o + de cada dia.</p>
          <ul className="flex flex-col gap-1.5 overflow-y-auto">
            {Object.values(db.sites)
              .filter((s) => s.status !== 'concluida')
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((s) => (
                <DraggableSite key={s.id} id={s.id} />
              ))}
          </ul>
        </div>
      )}
      {perspective === 'obras' && (
        <div className="flex min-h-0 flex-col gap-2">
          <p className="text-xs font-semibold text-ink-2">Disponibilidade</p>
          <div role="radiogroup" aria-label="Dia" className="grid grid-cols-7 gap-0.5">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={d === activeDay}
                onClick={() => setDay(d)}
                className={cn('rounded-xs py-1 text-[10px] font-semibold uppercase', d === activeDay ? 'bg-pinho text-white' : 'text-ink-3 hover:bg-line-2')}
              >
                {dayShort(d).slice(0, 3)}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="tray-q">
            Pesquisar trabalhadores
          </label>
          <Input id="tray-q" placeholder="Pesquisar" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-sm" />
          <ul className="flex flex-col gap-1.5 overflow-y-auto">
            {Object.values(db.workers)
              .filter((w) => w.status === 'ativo')
              .filter((w) => !q || w.name.toLowerCase().includes(q.toLowerCase()) || w.category.toLowerCase().includes(q.toLowerCase()))
              .map((w) => ({ w, a: availability(w, activeDay, idx) }))
              .filter((x) => x.a.state === 'livre' || x.a.state === 'parcial')
              .sort((a, b) => (a.a.state === b.a.state ? a.w.name.localeCompare(b.w.name) : a.a.state === 'livre' ? -1 : 1))
              .map(({ w, a }) => (
                <DraggableWorker key={w.id} id={w.id} state={a.state} hours={a.capacity - a.plannedHours} />
              ))}
          </ul>
          <p className="text-[11px] text-ink-3">Só aparecem trabalhadores livres ou parcialmente livres no dia escolhido.</p>
        </div>
      )}
      {(perspective === 'equipas' || perspective === 'viaturas') && (
        <p className="text-[11px] text-ink-3">
          {perspective === 'equipas'
            ? 'Clique no dia de uma equipa para mudar a obra ou a viatura de todos os elementos nesse dia.'
            : 'Arraste o dia de uma viatura para outra viatura para trocar. A barra mostra os lugares ocupados.'}
        </p>
      )}
    </aside>
  )
}
