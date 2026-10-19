import { BookOpen, Camera } from 'lucide-react'
import { useDerived } from '@/app/hooks'
import { dateShort } from '@/domain/weeks'
import { selectForemanScope } from '@/store/selectors'
import { SiteCode } from '@/ui/Badge'
import { Photo } from '@/ui/Photo'

/**
 * O diário de obra visto no telemóvel do encarregado (palco dividido do capítulo 11). Lê o mesmo estado vivo
 * que a ficha da obra ao lado: o registo aparece nos dois sítios ao mesmo tempo.
 */
export function ForemanPhone() {
  const d = useDerived((s) => {
    const fid = s.session.personas.encarregado
    const siteId = selectForemanScope(s).siteIds.find((id) => s.db.sites[id]?.foremanId === fid) ?? selectForemanScope(s).siteIds[0]
    const site = siteId ? s.db.sites[siteId] : undefined
    const entries = Object.values(s.db.diary)
      .filter((e) => e.siteId === siteId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6)
    return { site, entries, name: s.db.workers[fid]?.name ?? '' }
  })
  return (
    <div className="flex h-full flex-col bg-cal">
      <header className="on-dark bg-pinho px-4 pt-4 pb-3 text-white">
        <p className="text-[11px] text-white/60">{d.name} · encarregado</p>
        <h2 className="flex items-center gap-1.5 font-expanded text-base font-semibold"><BookOpen className="size-4 text-lima" aria-hidden /> Diário de obra</h2>
        {d.site && <p className="mt-0.5 truncate text-xs text-white/80">{d.site.code} · {d.site.name}</p>}
      </header>
      <ol className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {d.entries.map((e) => (
          <li key={e.id} className="mb-3 rounded-lg border border-line bg-surface p-3 text-sm">
            <p className="flex items-center gap-2 text-[11px] text-ink-3">
              {d.site && <SiteCode code={d.site.code} color={d.site.color} />}
              {dateShort(e.date)} · {e.createdAt.slice(11, 16)}
            </p>
            <p className="mt-1 font-medium">{e.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{e.text}</p>
            {e.photos.length > 0 && (
              <span className="mt-2 grid grid-cols-3 gap-1">
                {e.photos.slice(0, 3).map((p, i) => <Photo key={i} photo={p} format="viatura" alt={p.alt} sizes="96px" rounded="sm" fallback={null} />)}
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="border-t border-line bg-surface p-3">
        <span className="flex h-11 items-center justify-center gap-2 rounded-md bg-pinho text-sm font-semibold text-white" aria-hidden>
          <Camera className="size-4" /> Novo registo com fotos
        </span>
      </div>
    </div>
  )
}
