import { Link } from 'react-router'
import { useDerived } from '@/app/hooks'
import { dateShort } from '@/domain/weeks'
import { SiteCode } from '@/ui/Badge'
import { Panel } from '@/ui/Layout'
import { Photo } from '@/ui/Photo'

/** Últimos registos do diário de obra, de todas as obras, com miniaturas. */
export function LatestDiary() {
  const items = useDerived(({ db }) =>
    Object.values(db.diary)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3)
      .map((e) => ({ e, site: db.sites[e.siteId] })),
  )
  if (items.length === 0) return null
  return (
    <Panel tour="latest-diary" title="Diário de obra" description="Últimos registos das obras" bodyClassName="flex flex-col divide-y divide-line-2" flush>
      {items.map(({ e, site }) => (
        <Link key={e.id} to={`/obras/${e.siteId}?tab=diario`} className="flex items-start gap-3 px-4 py-3 hover:bg-cal">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-ink-3">
              {site && <SiteCode code={site.code} color={site.color} />}
              <span>{dateShort(e.date)} · {e.authorName}</span>
            </div>
            <p className="mt-0.5 truncate text-sm font-medium text-ink">{e.title}</p>
          </div>
          {e.photos.length > 0 && (
            <span className="flex shrink-0 gap-1">
              {e.photos.slice(0, 2).map((p, i) => (
                <Photo key={i} photo={p} format="viatura" alt="" sizes="56px" rounded="sm" className="w-14" fallback={null} />
              ))}
            </span>
          )}
        </Link>
      ))}
    </Panel>
  )
}
