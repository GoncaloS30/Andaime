import { Building2 } from 'lucide-react'
import { Link } from 'react-router'
import { SITE_STATUS } from '@/domain/labels'
import type { SiteMetrics } from '@/domain/siteMetrics'
import type { Client, Site, Team, Worker } from '@/domain/types'
import { Badge } from '@/ui/Badge'
import { HoursGauge, HoursStatus } from '@/ui/HoursGauge'
import { Photo } from '@/ui/Photo'
import { CountryTag } from '../shared/Country'

interface SiteCardProps {
  s: Site
  client?: Client
  foreman?: Worker
  teams: Team[]
  m: SiteMetrics
  priority?: boolean
  eager?: boolean
}

/**
 * Obra em cartão: capa com o código, local, estado, equipa e o medidor de horas por baixo.
 * No telemóvel passa a linha compacta com miniatura: cabem mais obras no ecrã e a capa não atrasa a página.
 */
export function SiteCard({ s, client, foreman, teams, m, priority, eager }: SiteCardProps) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-ink-4">
      <Link to={`/obras/${s.id}`} className="flex gap-3 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pinho focus-visible:ring-inset sm:block sm:p-0">
        <div className="relative w-28 shrink-0 sm:w-auto">
          {/* O nome da obra está no título do cartão: a capa é decorativa. */}
          <Photo
            photo={s.photo}
            format="capa"
            alt=""
            rounded="none"
            priority={priority}
            eager={eager}
            sizes="(min-width: 1280px) 440px, (min-width: 640px) 50vw, 112px"
            className="rounded-sm sm:rounded-none"
            fallback={<Building2 className="size-8 text-ink-4" aria-hidden />}
          />
          <span className="absolute bottom-2 left-2 hidden rounded-xs bg-pinho px-1.5 py-0.5 font-mono text-[11px] font-semibold text-lima sm:inline">
            {s.code} · {s.country}
          </span>
        </div>
        <div className="min-w-0 sm:px-3 sm:pt-3">
          <span className="font-mono text-[11px] font-semibold text-ink-3 sm:hidden">{s.code}</span>
          <h2 className="font-semibold text-ink group-hover:underline">{s.name}</h2>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
            <CountryTag country={s.country} />
            <span className="shrink-0">{s.city}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{client?.name}</span>
          </p>
        </div>
      </Link>
      <div className="mt-auto space-y-2 px-3 pb-3 sm:pt-2.5">
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
