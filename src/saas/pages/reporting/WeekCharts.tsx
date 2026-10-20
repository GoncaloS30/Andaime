import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../api/http'
import { useBoard } from '../../api/planning'
import { addDaysIso, minutesToHours } from '../../api/workforce'
import { Panel } from '@/ui/Layout'

interface Matrix {
  columns: { key: string; label: string; totalMin: number }[]
  lines: { key: string; label: string; cells: Record<string, number>; totalMin: number }[]
}

const DAY = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', timeZone: 'UTC' })
const h = (min: number) => minutesToHours(min)

function useMatrix(orgId: string, rows: 'site' | 'employee', from: string, to: string) {
  return useQuery({
    queryKey: ['org', orgId, 'reporting', 'hours-matrix', rows, 'day', from, to, ''],
    queryFn: () => api<Matrix>(`/orgs/${orgId}/reporting/hours/matrix?${new URLSearchParams({ rows, cols: 'day', from, to })}`),
    placeholderData: keepPreviousData,
  })
}

/** Barra horizontal: realizadas cheias sobre planeadas tracejadas (a linguagem planeado/realizado da app). */
function Bar({ realized, planned, max }: { realized: number; planned?: number; max: number }) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / max) * 100))}%`
  return (
    <span className="relative block h-2.5 w-full overflow-hidden rounded-full bg-line-2" aria-hidden>
      {planned ? <span className="hatch absolute inset-y-0 left-0 rounded-full border border-pinho/50" style={{ width: pct(planned) }} /> : null}
      <span className="absolute inset-y-0 left-0 rounded-full bg-pinho" style={{ width: pct(realized) }} />
    </span>
  )
}

/**
 * "Como correu a semana" (protótipo V3.1): horas por dia, por obra e por pessoa. Realizadas = registos fechados
 * (tabela de totais); planeadas = atribuições do planeamento. Há sempre a tabela com os números.
 */
export function WeekCharts({ orgId, week, siteLabel }: { orgId: string; week: string; siteLabel: (id: string) => string }) {
  const to = addDaysIso(week, 6)
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(week, i))
  const bySite = useMatrix(orgId, 'site', week, to)
  const byPerson = useMatrix(orgId, 'employee', week, to)
  const board = useBoard(orgId, week, to)
  const plannedDay = new Map<string, number>()
  const plannedSite = new Map<string, number>()
  for (const a of board.data?.assignments ?? []) {
    plannedDay.set(a.date, (plannedDay.get(a.date) ?? 0) + a.plannedMin)
    plannedSite.set(a.siteId, (plannedSite.get(a.siteId) ?? 0) + a.plannedMin)
  }
  const realizedDay = new Map((bySite.data?.columns ?? []).map((c) => [c.key, c.totalMin]))
  const dayRows = days.map((d) => ({ d, realized: realizedDay.get(d) ?? 0, planned: plannedDay.get(d) ?? 0 }))
  if (!dayRows.some((r) => r.realized || r.planned)) return null
  const dayMax = Math.max(480, ...dayRows.map((r) => Math.max(r.realized, r.planned)))
  const siteIds = new Set([...plannedSite.keys(), ...(bySite.data?.lines ?? []).map((l) => l.key)])
  const sites = [...siteIds].map((id) => ({ id, realized: bySite.data?.lines.find((l) => l.key === id)?.totalMin ?? 0, planned: plannedSite.get(id) ?? 0 }))
    .sort((a, b) => b.realized + b.planned - (a.realized + a.planned))
  const siteMax = Math.max(60, ...sites.map((s) => Math.max(s.realized, s.planned)))
  const people = (byPerson.data?.lines ?? []).slice(0, 8)
  const personMax = Math.max(60, ...people.map((p) => p.totalMin))

  return (
    <section aria-label="Como correu a semana" className="mt-4 grid gap-4 lg:grid-cols-3">
      <Panel title="Horas por dia" description="Cheio: realizadas · tracejado: planeadas">
        <div className="flex h-36 items-end gap-2" role="img" aria-label={dayRows.map((r) => `${DAY.format(new Date(`${r.d}T00:00:00Z`))}: ${h(r.realized)} de ${h(r.planned)}`).join('; ')}>
          {dayRows.map((r) => (
            <div key={r.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${h(r.realized)} realizadas · ${h(r.planned)} planeadas`}>
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <span className="w-2.5 rounded-t-[4px] bg-pinho" style={{ height: `${(r.realized / dayMax) * 100}%` }} />
                <span className="hatch w-2.5 rounded-t-[4px] border border-pinho/50" style={{ height: `${(r.planned / dayMax) * 100}%` }} />
              </div>
              <span className="text-[11px] text-ink-3 capitalize">{DAY.format(new Date(`${r.d}T00:00:00Z`))}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Horas por obra" description="Realizadas face ao planeado da semana">
        <ul className="flex flex-col gap-2">
          {sites.slice(0, 8).map((s) => (
            <li key={s.id}>
              <span className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{siteLabel(s.id)}</span>
                <span className="font-mono text-ink-2 tabular">{h(s.realized)} / {h(s.planned)}</span>
              </span>
              <Bar realized={s.realized} planned={s.planned} max={siteMax} />
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Horas por pessoa" description="Realizadas na semana">
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <li key={p.key}>
              <span className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{p.label}</span>
                <span className="font-mono text-ink-2 tabular">{h(p.totalMin)}</span>
              </span>
              <Bar realized={p.totalMin} max={personMax} />
            </li>
          ))}
          {(byPerson.data?.lines.length ?? 0) > people.length && <li className="text-xs text-ink-3">+ {byPerson.data!.lines.length - people.length} pessoas com menos horas</li>}
        </ul>
      </Panel>
      <details className="lg:col-span-3">
        <summary className="cursor-pointer text-sm font-medium text-pinho">Ver os números em tabela</summary>
        <table className="mt-2 w-full max-w-xl text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3"><th scope="col">Dia</th><th scope="col" className="text-right">Realizadas</th><th scope="col" className="text-right">Planeadas</th></tr>
          </thead>
          <tbody>
            {dayRows.map((r) => (
              <tr key={r.d} className="border-t border-line-2">
                <td className="py-1 capitalize">{DAY.format(new Date(`${r.d}T00:00:00Z`))} {Number(r.d.slice(8))}</td>
                <td className="py-1 text-right font-mono tabular">{h(r.realized)}</td>
                <td className="py-1 text-right font-mono tabular">{h(r.planned)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
