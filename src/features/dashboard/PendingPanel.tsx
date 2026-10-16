import { ChevronRight, ClipboardCheck, MessageSquareWarning, Palmtree } from 'lucide-react'
import { Link } from 'react-router'
import { useDerived } from '@/app/hooks'
import { ABSENCE_TYPE } from '@/domain/labels'
import { dateShort } from '@/domain/weeks'
import { Panel } from '@/ui/Layout'

/** Tudo o que está à espera de uma decisão do gestor. */
export function PendingPanel() {
  const d = useDerived(({ db }) => {
    const absences = Object.values(db.absences).filter((a) => a.status === 'pedido').sort((a, b) => a.start.localeCompare(b.start))
    const byTeam = new Map<string, number>()
    for (const e of Object.values(db.entries)) {
      if (e.status !== 'revisto') continue
      const t = db.workers[e.workerId]?.teamId ?? 'sem'
      byTeam.set(t, (byTeam.get(t) ?? 0) + 1)
    }
    const issues = Object.values(db.issues).filter((i) => i.status === 'aberto')
    return { absences, byTeam: [...byTeam.entries()].sort((a, b) => b[1] - a[1]), issues, db }
  })
  const empty = d.absences.length === 0 && d.byTeam.length === 0 && d.issues.length === 0

  return (
    <Panel title="À espera de decisão" id="pendentes" flush>
      {empty && <p className="px-4 py-4 text-sm text-ink-3">Nada por decidir. Os pedidos novos aparecem aqui.</p>}
      <ul className="divide-y divide-line-2">
        {d.absences.map((a) => (
          <li key={a.id}>
            <Link to={`/ausencias?estado=pedido&id=${a.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-cal">
              <Palmtree className="size-4 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{d.db.workers[a.workerId]?.name}</span>
                <span className="block text-xs text-ink-3">
                  {ABSENCE_TYPE[a.type]} · {dateShort(a.start)}
                  {a.end !== a.start && ` a ${dateShort(a.end)}`}
                </span>
              </span>
              <ChevronRight className="size-4 text-ink-4" aria-hidden />
            </Link>
          </li>
        ))}
        {d.byTeam.map(([teamId, n]) => (
          <li key={teamId}>
            <Link to={`/horas?estado=revisto${teamId !== 'sem' ? `&equipa=${teamId}` : ''}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-cal">
              <ClipboardCheck className="size-4 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{d.db.teams[teamId]?.name ?? 'Sem equipa'}</span>
                <span className="block text-xs text-ink-3">{n} registos revistos, por aprovar</span>
              </span>
              <ChevronRight className="size-4 text-ink-4" aria-hidden />
            </Link>
          </li>
        ))}
        {d.issues.map((i) => (
          <li key={i.id}>
            <Link to={`/obras/${i.siteId}?tab=historico`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-cal">
              <MessageSquareWarning className="size-4 shrink-0 text-ambar-ink" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">Problema em {d.db.sites[i.siteId]?.code}</span>
                <span className="line-clamp-1 text-xs text-ink-3">{i.text}</span>
              </span>
              <ChevronRight className="size-4 text-ink-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
