import { Building2 } from 'lucide-react'
import { Link } from 'react-router'
import { SITE_STATUS } from '@/domain/labels'
import type { SiteMetrics } from '@/domain/siteMetrics'
import type { Client, Site, Team, Worker } from '@/domain/types'
import { Badge } from '@/ui/Badge'
import { HoursGauge, HoursStatus } from '@/ui/HoursGauge'
import { Photo } from '@/ui/Photo'
import { CountryTag } from '../shared/Country'

/** Obra em cartão: capa com o código, local, estado, equipa e o medidor de horas por baixo. */
export function SiteCard({ s, client, foreman, teams, m }: { s: Site; client?: Client; foreman?: Worker; teams: Team[]; m: SiteMetrics }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-ink-4">
      <Link to={`/obras/${s.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pinho focus-visible:ring-inset">
        <div className="relative">
          {/* O nome da obra está no título do cartão: a capa é decorativa. */}
          <Photo photo={s.photo} format="capa" alt="" rounded="none" sizes="(min-width: 1280px) 440px, (min-width: 640px) 50vw, 100vw" fallback={<Building2 className="size-8 text-ink-4" aria-hidden />} />
          <span className="absolute bottom-2 left-2 rounded-xs bg-pinho px-1.5 py-0.5 font-mono text-[11px] font-semibold text-lima">
            {s.code} · {s.country}
          </span>
        </div>
        <div className="px-3 pt-3">
          <h2 className="font-semibold text-ink group-hover:underline">{s.name}</h2>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
            <CountryTag country={s.country} /> {s.city} · <span className="truncate">{client?.name}</span>
          </p>
        </div>
      </Link>
      <div className="mt-auto space-y-2 px-3 pt-2.5 pb-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <Badge tone={s.status === 'em_curso' ? 'ok' : s.status === 'planeada' ? 'info' : 'neutral'} dot>
            {SITE_STATUS[s.status]}
          </Badge>
          <span className="truncate text-ink-3">
            {teams.map((t) => t.name).join(', ') || 'Sem equipa'} · {foreman?.name ?? 'Sem encarregado'}
          </span>
        </div>
        <HoursGauge m={m} size="sm" />
        <HoursStatus m={m} className="block" />
      </div>
    </article>
  )
}
