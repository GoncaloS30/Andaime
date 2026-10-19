import { useDerived } from '@/app/hooks'
import { formatHours } from '@/domain/hours'
import { weekChart } from '@/domain/weekCharts'
import { dayShort, isoWeek } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { SiteCode } from '@/ui/Badge'
import { Panel } from '@/ui/Layout'

const fh = (n: number) => formatHours(Math.round(n * 10) / 10)

/** Barra horizontal: realizadas cheias, planeadas tracejadas (a linguagem planeado/realizado da app). */
function HBar({ realized, planned, max, extra }: { realized: number; planned?: number; max: number; extra?: number }) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / max) * 100))}%`
  return (
    <span className="relative block h-2.5 w-full overflow-hidden rounded-full bg-line-2" aria-hidden>
      {planned !== undefined && planned > 0 && <span className="hatch absolute inset-y-0 left-0 rounded-full border border-pinho/50 text-pinho/60" style={{ width: pct(planned) }} />}
      <span className="absolute inset-y-0 left-0 rounded-full bg-pinho" style={{ width: pct(realized) }} />
      {extra !== undefined && extra > 0 && <span className="absolute inset-y-0 rounded-r-full bg-ambar" style={{ left: pct(realized - extra), width: pct(extra) }} />}
    </span>
  )
}

/** "Como correu a semana": horas por dia, por obra e por pessoa, para ler a semana sem contar números numa tabela. */
export function WeekCharts({ week }: { week: string }) {
  const settings = useDemo((s) => s.session.settings)
  const d = useDerived(({ db }) => ({ db, c: weekChart(db, settings, week) }), [week])
  const { c, db } = d
  const dayMax = Math.max(8, ...c.days.map((x) => Math.max(x.realized, x.planned)))
  const siteMax = Math.max(1, ...c.sites.map((x) => Math.max(x.realized, x.planned)))
  const people = c.workers.slice(0, 8)
  const workerMax = Math.max(1, ...people.map((x) => x.realized))
  if (!c.days.some((x) => x.realized || x.planned)) return null

  return (
    <section aria-label={`Como correu a semana ${isoWeek(week)}`} className="no-print mt-4 grid gap-4 lg:grid-cols-3">
      <Panel title="Horas por dia" description="Cheio: realizadas · tracejado: planeadas">
        <div className="flex h-36 items-end gap-2" role="img" aria-label={c.days.map((x) => `${dayShort(x.date)}: ${fh(x.realized)} realizadas de ${fh(x.planned)} planeadas`).join('; ')}>
          {c.days.map((x) => (
            <div key={x.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${dayShort(x.date)}: ${fh(x.realized)} realizadas · ${fh(x.planned)} planeadas`}>
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <span className="w-2.5 rounded-t-[4px] bg-pinho" style={{ height: `${(x.realized / dayMax) * 100}%` }} />
                <span className="hatch w-2.5 rounded-t-[4px] border border-pinho/50 text-pinho/60" style={{ height: `${(x.planned / dayMax) * 100}%` }} />
              </div>
              <span className="text-[11px] text-ink-3 uppercase">{dayShort(x.date)}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Horas por obra" description="Realizadas face ao planeado da semana">
        <ul className="flex flex-col gap-2">
          {c.sites.map((s) => {
            const site = db.sites[s.siteId]
            return (
              <li key={s.siteId}>
                <span className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                  {site && <SiteCode code={site.code} color={site.color} />}
                  <span className="font-mono tabular text-ink-2">{fh(s.realized)} / {fh(s.planned)}</span>
                </span>
                <HBar realized={s.realized} planned={s.planned} max={siteMax} />
              </li>
            )
          })}
        </ul>
      </Panel>
      <Panel title="Horas por pessoa" description="Âmbar: horas extra">
        <ul className="flex flex-col gap-2">
          {people.map((w) => (
            <li key={w.workerId}>
              <span className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{db.workers[w.workerId]?.name}</span>
                <span className="font-mono tabular text-ink-2">{fh(w.realized)}{w.extra ? ` · ${fh(w.extra)} extra` : ''}</span>
              </span>
              <HBar realized={w.realized} max={workerMax} extra={w.extra} />
            </li>
          ))}
          {c.workers.length > people.length && <li className="text-xs text-ink-3">+ {c.workers.length - people.length} pessoas com menos horas</li>}
        </ul>
      </Panel>
      <details className="lg:col-span-3">
        <summary className="cursor-pointer text-sm font-medium text-pinho">Ver os números em tabela</summary>
        <table className="table-a mt-2 max-w-xl">
          <thead><tr><th scope="col">Dia</th><th scope="col" className="num">Realizadas</th><th scope="col" className="num">Planeadas</th></tr></thead>
          <tbody>{c.days.map((x) => <tr key={x.date}><td>{dayShort(x.date)} {Number(x.date.slice(8))}</td><td className="num tabular">{fh(x.realized)}</td><td className="num tabular">{fh(x.planned)}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  )
}
