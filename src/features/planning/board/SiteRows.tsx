import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { buildIndex, key } from '@/domain/indexes'
import type { Site } from '@/domain/types'
import { dayShort, isWeekend } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDerived } from '@/app/hooks'
import { selectAllSiteMetrics } from '@/store/selectors'
import { SiteCode } from '@/ui/Badge'
import { HoursStatus } from '@/ui/HoursGauge'
import { usePlanning } from '../PlanningContext'
import { DropCell } from './Cell'
import { AssignmentChip } from './Chip'
import { GRID_COLS } from './DayHeader'
import { CountryTag } from '../../shared/Country'

/** Perspetiva por obra: quem está em cada obra, dia a dia. Larga-se aqui um trabalhador da bandeja. */
export function SiteRows() {
  const ctx = usePlanning()
  const { db, days, query, filterSite } = ctx
  const metrics = useDerived(selectAllSiteMetrics)
  const idx = buildIndex(db)
  const q = query.trim().toLowerCase()
  const sites = Object.values(db.sites)
    .filter((s) => s.status === 'em_curso' || days.some((d) => (idx.bySiteDate.get(key(s.id, d))?.length ?? 0) > 0) || s.status === 'planeada')
    .filter((s) => !filterSite || s.id === filterSite)
    .filter((s) => !q || `${s.code} ${s.name} ${s.city}`.toLowerCase().includes(q))
    .sort((a, b) => a.code.localeCompare(b.code))

  return (
    <>
      {sites.map((s) => (
        <SiteRow key={s.id} s={s} statusEl={<HoursStatus m={metrics[s.id]!} />} />
      ))}
      {sites.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-3">Nenhuma obra corresponde aos filtros.</p>}
    </>
  )
}

function SiteRow({ s, statusEl }: { s: Site; statusEl: ReactNode }) {
    const ctx = usePlanning()
    const { db, days, today } = ctx
    const idx = buildIndex(db)
    const foreman = s.foremanId ? db.workers[s.foremanId] : undefined
    return (
      <div className={cn('grid', GRID_COLS)}>
        <div className="sticky left-0 z-10 flex min-w-0 flex-col justify-center gap-0.5 border-t border-line-2 bg-surface px-3 py-2">
          <SiteCode code={s.code} color={s.color} />
          <Link to={`/obras/${s.id}`} className="truncate text-sm font-semibold text-ink hover:underline">
            {s.name}
          </Link>
          <span className="flex items-center gap-1.5">
            <CountryTag country={s.country} />
            {statusEl}
          </span>
          {foreman && <span className="truncate text-[11px] text-ink-3">Enc.: {foreman.name}</span>}
        </div>
        {days.map((d) => {
          const list = (idx.bySiteDate.get(key(s.id, d)) ?? []).slice().sort((a, b) => {
            const wa = db.workers[a.workerId]
            const wb = db.workers[b.workerId]
            return Number(b.isForeman) - Number(a.isForeman) || (wa?.name ?? '').localeCompare(wb?.name ?? '')
          })
          return (
            <DropCell
              key={d}
              id={`sd:${s.id}:${d}`}
              data={{ type: 'site-day', siteId: s.id, date: d }}
              today={d === today}
              weekend={isWeekend(d)}
              onAdd={() => ctx.add({ siteId: s.id, date: d })}
              addLabel={`Atribuir trabalhador a ${s.code} em ${d}`}
            >
              {list.length > 0 && <span className="px-0.5 text-[10.5px] font-semibold text-ink-3 tabular">{list.length} pessoas</span>}
              {list.map((a) => {
                const w = db.workers[a.workerId]
                const parts = (w?.name ?? '?').split(' ')
                const entry = (idx.entriesByWorkerDate.get(key(a.workerId, d)) ?? []).find((e) => e.siteId === a.siteId && e.status !== 'rejeitado')
                return (
                  <AssignmentChip
                    key={a.id}
                    a={a}
                    site={s}
                    label={`${parts[0]?.[0]}. ${parts[parts.length - 1]}`}
                    entry={entry}
                    conflicts={ctx.conflictsByAssignment.get(a.id)}
                    selected={ctx.selected.has(a.id)}
                    focused={ctx.focusIds.has(a.id) || ctx.recentIds.has(a.id)}
                    today={today}
                    context={`${s.code}, ${dayShort(d)} ${d.slice(8)}`}
                    onSelect={ctx.select}
                    onOpen={ctx.open}
                  />
                )
              })}
            </DropCell>
          )
        })}
      </div>
    )
}
