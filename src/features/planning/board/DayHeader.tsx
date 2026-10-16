import { dayShort, isWeekend } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { usePlanning } from '../PlanningContext'

export const GRID_COLS = 'grid-cols-[minmax(176px,220px)_repeat(5,minmax(104px,1fr))_repeat(2,minmax(70px,0.62fr))]'

/** Cabeçalho dos dias: hoje em Lima, fim de semana mais estreito. */
export function DayHeader({ label, totals }: { label: string; totals?: Record<string, number> }) {
  const { days, today } = usePlanning()
  return (
    <div className={cn('sticky top-0 z-20 grid border-b border-line bg-surface', GRID_COLS)}>
      <div className="sticky left-0 z-10 flex items-end bg-surface px-3 pb-1.5 text-xs font-semibold text-ink-3">
        {label}
      </div>
      {days.map((d) => (
        <div
         
          key={d}
          aria-label={`${dayShort(d)} ${d.slice(8)}${d === today ? ', hoje' : ''}`}
          className={cn('flex flex-col items-start border-l border-line-2 px-2 py-1.5', isWeekend(d) && 'bg-line-2/45')}
        >
          <span className={cn('font-condensed text-xs font-semibold uppercase tracking-wide', d === today ? 'text-pinho' : 'text-ink-3')}>
            {dayShort(d)}
          </span>
          <span className="flex w-full items-center justify-between gap-1">
            <span
              className={cn(
                'font-expanded text-md leading-none font-semibold tabular',
                d === today ? 'rounded-xs bg-lima px-1 text-pinho' : 'text-ink',
              )}
            >
              {d.slice(8)}
            </span>
            {totals && <span className="font-mono text-[10.5px] text-ink-3 tabular">{totals[d] ?? 0}h</span>}
          </span>
        </div>
      ))}
    </div>
  )
}
