import { Link } from 'react-router'
import { useDerived } from '@/app/hooks'
import { formatHours } from '@/domain/hours'
import { selectAllSiteMetrics } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { SiteCode } from '@/ui/Badge'
import { GaugeLegend, HoursGauge, HoursStatus } from '@/ui/HoursGauge'
import { Panel } from '@/ui/Layout'
import { CountryTag } from '../shared/Country'

const RANK = { excede: 0, atencao: 1, normal: 2, sem_limite: 3 }

/** Horas de cada obra face ao limite: a vista que responde "quanto falta?". */
export function SitesHours() {
  const sites = useDemo((s) => s.db.sites)
  const metrics = useDerived(selectAllSiteMetrics)
  const list = Object.values(sites)
    .filter((s) => s.status === 'em_curso')
    .sort((a, b) => RANK[metrics[a.id]!.status] - RANK[metrics[b.id]!.status] || metrics[b.id]!.pctProjection - metrics[a.id]!.pctProjection)

  return (
    <Panel
      id="horas-obras"
      title="Horas por obra"
      description="Realizadas e planeadas face ao limite de cada obra"
      actions={
        <Link to="/obras" className="text-sm font-medium text-pinho hover:underline">
          Todas as obras
        </Link>
      }
      flush
    >
      <ul data-tour="sites-hours">
        {list.map((s) => {
          const m = metrics[s.id]!
          return (
            <li key={s.id} className="border-b border-line-2 last:border-0">
              <Link
                to={`/obras/${s.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-cal sm:grid-cols-[minmax(170px,1.1fr)_minmax(0,2fr)_150px]"
              >
                <span className="min-w-0">
                  <SiteCode code={s.code} color={s.color} />
                  <span className="mt-0.5 block truncate text-sm font-semibold text-ink">{s.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <CountryTag country={s.country} />
                    <span className="truncate text-xs text-ink-3">{s.city}</span>
                  </span>
                </span>
                <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                  <HoursGauge m={m} />
                </span>
                <span className="text-right">
                  <span className="block font-mono text-sm font-medium text-ink tabular">
                    {formatHours(Math.round(m.realized), '')}
                    <span className="text-ink-3"> / {m.limit ? formatHours(m.limit) : '—'}</span>
                  </span>
                  <HoursStatus m={m} />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="border-t border-line-2 px-4 py-2.5">
        <GaugeLegend className="mt-0" />
      </div>
    </Panel>
  )
}
