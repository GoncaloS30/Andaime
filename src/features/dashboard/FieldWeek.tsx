import { Link } from 'react-router'
import { useDerived } from '@/app/hooks'
import { addDays, dayShort, isWeekend, weekDays, weekStart } from '@/domain/weeks'
import type { ID } from '@/domain/types'
import { cn } from '@/lib/cn'
import { Panel } from '@/ui/Layout'

/** "Onde está cada equipa" nesta semana: equipa × dia, com a obra e o número de pessoas. */
export function FieldWeek() {
  const data = useDerived(({ db, session }) => {
    const ws = weekStart(session.today)
    const days = weekDays(ws)
    const end = addDays(ws, 6)
    const cell = new Map<string, Map<ID, Set<ID>>>()
    for (const a of Object.values(db.assignments)) {
      if (!a.teamId || a.date < ws || a.date > end) continue
      const k = `${a.teamId}|${a.date}`
      const m = cell.get(k) ?? new Map<ID, Set<ID>>()
      m.set(a.siteId, (m.get(a.siteId) ?? new Set()).add(a.workerId))
      cell.set(k, m)
    }
    const teams = Object.values(db.teams).sort((a, b) => a.name.localeCompare(b.name))
    return { days, cell, teams, today: session.today, db }
  })

  return (
    <Panel
      id="no-terreno"
      title="Esta semana no terreno"
      description="Onde está cada equipa, dia a dia"
      actions={
        <Link to="/planeamento?vista=equipas" className="text-sm font-medium text-pinho hover:underline">
          Abrir planeamento
        </Link>
      }
      flush
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Obra de cada equipa por dia desta semana</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface px-4 py-2 text-left text-xs font-semibold text-ink-3">
                Equipa
              </th>
              {data.days.map((d) => (
                <th
                  key={d}
                  scope="col"
                  className={cn(
                    'px-1 py-2 text-center text-xs font-semibold font-condensed',
                    d === data.today ? 'text-pinho' : 'text-ink-3',
                    isWeekend(d) && 'w-14',
                  )}
                >
                  <span className={cn('inline-block rounded-sm px-1.5 py-0.5', d === data.today && 'bg-lima text-pinho')}>
                    {dayShort(d)} {d.slice(8)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.teams.map((t) => (
              <tr key={t.id} className="group">
                <th scope="row" className="sticky left-0 z-10 border-t border-line-2 bg-surface px-4 py-2 text-left font-normal group-hover:bg-cal">
                  <Link to={`/equipas/${t.id}`} className="flex items-center gap-2 hover:underline">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: t.color }} />
                    <span className="truncate text-sm font-medium text-ink">{t.name}</span>
                  </Link>
                </th>
                {data.days.map((d) => {
                  const m = data.cell.get(`${t.id}|${d}`)
                  const entries = m ? [...m.entries()].sort((a, b) => b[1].size - a[1].size) : []
                  return (
                    <td key={d} className={cn('border-t border-line-2 px-1 py-1.5 align-middle', d === data.today && 'bg-lima-soft/40')}>
                      {entries.length === 0 ? (
                        <span className="block text-center text-xs text-ink-4" aria-label="Sem trabalho">
                          ·
                        </span>
                      ) : (
                        <span className="flex flex-col gap-0.5">
                          {entries.slice(0, 2).map(([sid, ws]) => {
                            const s = data.db.sites[sid]
                            return (
                              <span
                                key={sid}
                                title={`${s?.code} ${s?.name}: ${ws.size} pessoas`}
                                className="flex items-center justify-between gap-1 rounded-xs border-l-[3px] bg-line-2 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-ink tabular"
                                style={{ borderLeftColor: s?.color }}
                              >
                                {s?.code.slice(3)}
                                <span className="text-ink-3">{ws.size}</span>
                              </span>
                            )
                          })}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
