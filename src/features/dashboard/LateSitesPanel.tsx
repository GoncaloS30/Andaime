import { Link } from 'react-router'
import { useDerived } from '@/app/hooks'
import { delayWorkdays } from '@/domain/planning'
import { dateShort } from '@/domain/weeks'
import { SiteCode } from '@/ui/Badge'
import { Panel } from '@/ui/Layout'

/** Obras cuja previsão de fim já passou o fim contratual. */
export function LateSitesPanel() {
  const late = useDerived(({ db }) =>
    Object.values(db.sites)
      .filter((s) => s.status !== 'concluida' && delayWorkdays(s) > 0)
      .sort((a, b) => delayWorkdays(b) - delayWorkdays(a)),
  )
  if (late.length === 0) return null
  return (
    <Panel title="Prazos" description="Previsão de fim depois do fim contratual" bodyClassName="flex flex-col gap-2">
      {late.map((s) => (
        <Link key={s.id} to={`/obras/${s.id}`} className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-cal">
          <span className="flex min-w-0 items-center gap-2"><SiteCode code={s.code} color={s.color} /><span className="truncate">{s.name}</span></span>
          <span className="shrink-0 text-ambar-ink">+{delayWorkdays(s)} dias úteis · {dateShort(s.endDate)}</span>
        </Link>
      ))}
    </Panel>
  )
}
