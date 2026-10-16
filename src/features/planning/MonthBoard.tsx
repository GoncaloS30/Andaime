import { useMemo } from 'react'
import { useDerived } from '@/app/hooks'
import { absenceOn, buildIndex, key } from '@/domain/indexes'
import type { Assignment, ID, ISODate } from '@/domain/types'
import { addDays, eachDay, isWeekend, monthLabel, weekStart, weekday } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { selectConflicts } from '@/store/selectors'
import type { Perspective } from './model'

interface Row {
  id: ID
  label: string
  sub?: string
  color?: string
}

/** Vista mensal: barras de período por linha. Clicar num dia abre essa semana. */
export function MonthBoard({ week, perspective, onOpenWeek }: { week: ISODate; perspective: Perspective; onOpenWeek: (d: ISODate) => void }) {
  const ref = addDays(week, 3)
  const monthStart = `${ref.slice(0, 7)}-01`
  const next = new Date(Date.UTC(Number(ref.slice(0, 4)), Number(ref.slice(5, 7)), 1)).toISOString().slice(0, 10)
  const days = eachDay(monthStart, addDays(next, -1))
  const conflicts = useDerived((s) => selectConflicts(s, { from: monthStart, to: days[days.length - 1]! }), [monthStart])
  const { db, today } = useDerived((s) => ({ db: s.db, today: s.session.today }))
  const idx = buildIndex(db)
  const conflictDays = useMemo(() => {
    const set = new Set<string>()
    for (const c of conflicts) for (const id of c.assignmentIds) {
      const a = db.assignments[id]
      if (a) set.add(`${a.workerId}|${a.date}`).add(`${a.siteId}|${a.date}`).add(`${a.teamId}|${a.date}`).add(`${a.vehicleId}|${a.date}`)
    }
    return set
  }, [conflicts, db])

  const rows: Row[] =
    perspective === 'trabalhadores'
      ? Object.values(db.workers).sort((a, b) => (a.teamId ?? 'z').localeCompare(b.teamId ?? 'z') || a.name.localeCompare(b.name)).map((w) => ({ id: w.id, label: w.name, sub: db.teams[w.teamId ?? '']?.name ?? 'Sem equipa', color: db.teams[w.teamId ?? '']?.color }))
      : perspective === 'equipas'
        ? Object.values(db.teams).map((t) => ({ id: t.id, label: t.name, color: t.color }))
        : perspective === 'obras'
          ? Object.values(db.sites).filter((s) => s.status !== 'concluida').map((s) => ({ id: s.id, label: `${s.code} ${s.name}`, color: s.color }))
          : Object.values(db.vehicles).map((v) => ({ id: v.id, label: v.plate, sub: `${v.make} ${v.model}` }))

  const listFor = (rowId: ID, d: ISODate): Assignment[] => {
    if (perspective === 'trabalhadores') return idx.byWorkerDate.get(key(rowId, d)) ?? []
    if (perspective === 'obras') return idx.bySiteDate.get(key(rowId, d)) ?? []
    if (perspective === 'viaturas') return idx.byVehicleDate.get(key(rowId, d)) ?? []
    return (idx.byDate.get(d) ?? []).filter((a) => a.teamId === rowId)
  }
  const maxHeads = Math.max(1, ...Object.values(db.sites).map((s) => Math.max(0, ...days.map((d) => idx.bySiteDate.get(key(s.id, d))?.length ?? 0))))

  return (
    <div className="max-h-[calc(100dvh-15rem)] overflow-auto">
      <table className="border-separate border-spacing-0 text-xs">
        <caption className="sr-only">Planeamento de {monthLabel(monthStart)}</caption>
        <thead className="sticky top-0 z-20 bg-surface">
          <tr>
            <th scope="col" className="sticky left-0 z-10 min-w-48 border-b border-line bg-surface px-3 py-1.5 text-left font-semibold text-ink-3 capitalize">
              {monthLabel(monthStart)}
            </th>
            {days.map((d) => (
              <th
                key={d}
                scope="col"
                className={cn('w-7 min-w-7 border-b border-line py-1 text-center font-condensed font-semibold', weekday(d) === 1 && 'border-l border-l-line', isWeekend(d) && 'bg-line-2/50', d === today ? 'text-pinho' : 'text-ink-3')}
              >
                <button type="button" onClick={() => onOpenWeek(weekStart(d))} className="w-full">
                  <span className="block text-[9px] uppercase">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][weekday(d)]}</span>{' '}
                  <span className={cn('tabular', d === today && 'rounded-xs bg-lima px-0.5')}>{Number(d.slice(8))}</span>
                  <span className="sr-only">: abrir a semana de {d}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="sticky left-0 z-10 border-b border-line-2 bg-surface px-3 py-1 text-left font-normal">
                <span className="flex items-center gap-1.5">
                  {r.color && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />}
                  <span className="truncate text-xs font-medium text-ink">{r.label}</span>
                </span>
                {r.sub && <span className="block truncate text-[10px] text-ink-3">{r.sub}</span>}
              </th>
              {days.map((d) => {
                const list = listFor(r.id, d)
                const absent = perspective === 'trabalhadores' && absenceOn(idx, r.id, d)
                const site = list[0] ? db.sites[list[0].siteId] : undefined
                const heads = perspective === 'obras' ? list.length : 0
                const flagged = conflictDays.has(`${r.id}|${d}`)
                const vehicle = perspective === 'viaturas' ? db.vehicles[r.id] : undefined
                const blocked = vehicle && (vehicle.status !== 'operacional' || vehicle.inspectionUntil < d)
                return (
                  <td
                    key={d}
                    className={cn('relative h-8 border-b border-line-2 p-[2px]', weekday(d) === 1 && 'border-l border-l-line', isWeekend(d) && 'bg-line-2/40', d === today && 'bg-lima-soft/50')}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenWeek(weekStart(d))}
                      className="block h-full w-full rounded-[3px]"
                      aria-label={`${r.label}, ${d}: ${list.length ? `${site?.code}${list.length > 1 ? ` (${list.length})` : ''}` : absent ? 'ausente' : 'sem trabalho'}${flagged ? ', com conflito' : ''}`}
                      style={
                        perspective === 'obras' && heads
                          ? { background: `color-mix(in oklab, ${r.color} ${20 + (heads / maxHeads) * 60}%, white)` }
                          : site
                            ? { background: `color-mix(in oklab, ${site.color} 55%, white)` }
                            : undefined
                      }
                    >
                      {absent && !list.length && <span aria-hidden className="block h-full w-full rounded-[3px] bg-[repeating-linear-gradient(135deg,var(--color-ink-4)_0_1px,transparent_1px_4px)] opacity-60" />}
                      {blocked && !list.length && <span aria-hidden className="block h-full w-full rounded-[3px] bg-tijolo/10" />}
                      {perspective === 'obras' && heads > 0 && <span className="font-mono text-[10px] font-semibold text-ink tabular">{heads}</span>}
                    </button>
                    {flagged && <span aria-hidden className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-tijolo ring-1 ring-surface" />}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
