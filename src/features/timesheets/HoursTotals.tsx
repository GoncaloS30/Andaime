import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useDerived } from '@/app/hooks'
import { formatHours } from '@/domain/hours'
import { hoursTotals, periodRange, shiftPeriod, type PeriodUnit } from '@/domain/periods'
import { dateShort, isoWeek, monthLabel } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { SiteCode } from '@/ui/Badge'
import { IconButton } from '@/ui/Button'
import { Segmented, Select } from '@/ui/Field'
import { Panel } from '@/ui/Layout'
import { EmptyState } from '@/ui/States'

const h = (n: number) => (n ? formatHours(n, '') : '')

/** Horas realizadas por semana, mês ou ano: por colaborador e por obra. Os números batem com os da obra. */
export function HoursTotals() {
  const today = useDemo((s) => s.session.today)
  const settings = useDemo((s) => s.session.settings)
  const [unit, setUnit] = useState<PeriodUnit>('semana')
  const [anchor, setAnchor] = useState(today)
  const [siteId, setSiteId] = useState('')
  const [order, setOrder] = useState<'total' | 'nome'>('total')
  const range = periodRange(unit, anchor)
  const d = useDerived(({ db }) => ({ db, t: hoursTotals(db, settings, range, { siteId: siteId || null }) }), [unit, anchor, siteId])
  const cols = range.columns.map((c, i) => ({ c, i })).filter(({ i }) => d.t.visible[i])
  const workers = [...d.t.workers].sort((a, b) => (order === 'total' ? b.total - a.total : 0))
  const title = unit === 'semana' ? `Semana ${isoWeek(range.from)} · ${dateShort(range.from)}–${dateShort(range.to)}` : unit === 'mes' ? monthLabel(range.from) : range.from.slice(0, 4)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Período" value={unit} onChange={(v) => setUnit(v)} options={[{ value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }, { value: 'ano', label: 'Ano' }]} />
        <div className="flex items-center rounded-md border border-line bg-surface">
          <IconButton label="Período anterior" onClick={() => setAnchor(shiftPeriod(unit, anchor, -1))}><ChevronLeft className="size-4" /></IconButton>
          <span className="min-w-44 border-x border-line px-3 text-center text-sm font-medium first-letter:uppercase">{title}</span>
          <IconButton label="Período seguinte" onClick={() => setAnchor(shiftPeriod(unit, anchor, 1))}><ChevronRight className="size-4" /></IconButton>
        </div>
        <label className="sr-only" htmlFor="ht-site">Obra</label>
        <Select id="ht-site" value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-56">
          <option value="">Todas as obras</option>
          {Object.values(d.db.sites).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
        </Select>
        <Segmented className="ml-auto" label="Ordenar" size="sm" value={order} onChange={setOrder} options={[{ value: 'total', label: 'Mais horas' }, { value: 'nome', label: 'Nome' }]} />
      </div>

      <Panel title="Horas por colaborador" description={`Realizadas (submetidas, revistas e aprovadas) · total ${formatHours(d.t.total)}`} flush>
        {workers.length === 0 ? (
          <EmptyState compact title="Sem horas neste período">Escolha outro período ou outra obra.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-a min-w-[720px]">
              <thead>
                <tr>
                  <th scope="col">Colaborador</th>
                  {cols.map(({ c }) => <th key={c.key} scope="col" className="num font-condensed">{c.label}</th>)}
                  <th scope="col" className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((r) => {
                  const w = d.db.workers[r.workerId]
                  return (
                    <tr key={r.workerId}>
                      <th scope="row" className="font-normal">
                        <Link to={`/trabalhadores/${r.workerId}?tab=horas`} className="flex items-center gap-2 hover:underline">
                          <Avatar name={w?.name ?? '?'} photo={w?.photo} size="xs" />
                          <span className="truncate">{w?.name}</span>
                        </Link>
                      </th>
                      {cols.map(({ c, i }) => <td key={c.key} className={cn('num font-mono tabular', !r.cells[i] && 'text-ink-4')}>{h(r.cells[i]!) || '·'}</td>)}
                      <td className="num font-mono font-semibold tabular">{h(r.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-semibold">
                  <th scope="row" className="text-left">Total</th>
                  {cols.map(({ c, i }) => <td key={c.key} className="num font-mono tabular">{h(d.t.columnTotals[i]!)}</td>)}
                  <td className="num font-mono tabular">{h(d.t.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Horas por obra" description="Quem trabalhou em cada obra no período" flush>
        <ul className="divide-y divide-line-2">
          {d.t.sites.map((s) => {
            const site = d.db.sites[s.siteId]
            const people = Object.entries(s.byWorker).sort((a, b) => b[1] - a[1])
            return (
              <li key={s.siteId} className="grid gap-2 px-4 py-3 md:grid-cols-[16rem_minmax(0,1fr)_6rem] md:items-start">
                <Link to={`/obras/${s.siteId}?tab=horas`} className="min-w-0 hover:underline">
                  {site && <SiteCode code={site.code} color={site.color} />}
                  <span className="block truncate text-sm font-medium">{site?.name}</span>
                </Link>
                <ul className="flex flex-wrap gap-1.5">
                  {people.map(([wid, hrs]) => (
                    <li key={wid} className="flex items-center gap-1 rounded-full border border-line py-0.5 pr-2 pl-0.5 text-xs">
                      <Avatar name={d.db.workers[wid]?.name ?? '?'} photo={d.db.workers[wid]?.photo} size="xs" />
                      {d.db.workers[wid]?.name.split(' ')[0]} <span className="font-mono tabular text-ink-3">{h(hrs)}</span>
                    </li>
                  ))}
                </ul>
                <span className="text-right font-mono text-sm font-semibold tabular">{formatHours(s.total)}</span>
              </li>
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}
