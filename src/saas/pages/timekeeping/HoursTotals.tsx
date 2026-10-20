import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button, IconButton } from '@/ui/Button'
import { Segmented, Select } from '@/ui/Field'
import { Panel } from '@/ui/Layout'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { api, errorMessage } from '../../api/http'
import { mondayOf } from '../../api/planning'
import { addDaysIso, minutesToHours, todayIso, useSites } from '../../api/workforce'
import { useActiveOrg } from '../../session'

type Period = 'semana' | 'mes' | 'ano'
type Layout = 'pessoas' | 'obras' | 'obra-pessoa'

interface HoursMatrix {
  from: string
  to: string
  columns: { key: string; label: string; totalMin: number }[]
  lines: { key: string; label: string; cells: Record<string, number>; totalMin: number; approvedMin: number }[]
  totalMin: number
  approvedMin: number
}

/** Intervalo do período que contém `anchor`, e o rótulo para o mostrar. */
function rangeOf(period: Period, anchor: string): { from: string; to: string; label: string } {
  const [y, m] = anchor.split('-').map(Number) as [number, number]
  if (period === 'semana') {
    const from = mondayOf(anchor)
    return { from, to: addDaysIso(from, 6), label: `Semana de ${new Date(`${from}T12:00:00`).toLocaleDateString('pt-PT')}` }
  }
  if (period === 'mes') {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const mm = String(m).padStart(2, '0')
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${last}`, label: new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }) }
  }
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) }
}

function shift(period: Period, anchor: string, step: number): string {
  if (period === 'semana') return addDaysIso(anchor, 7 * step)
  const [y, m] = anchor.split('-').map(Number) as [number, number]
  const d = period === 'mes' ? new Date(Date.UTC(y, m - 1 + step, 1)) : new Date(Date.UTC(y + step, 0, 1))
  return d.toISOString().slice(0, 10)
}

const COLS: Record<Period, string> = { semana: 'day', mes: 'week', ano: 'month' }

/**
 * Totais de horas (vista "Totais" do protótipo V3.1): pessoas ou obras por dia, semana ou mês, e obras × pessoas.
 * Realizadas = registos fechados; a coluna "Aprovadas" mostra quanto disso já está em semanas aprovadas.
 */
export function HoursTotals() {
  const org = useActiveOrg()
  const sites = useSites(org.id)
  const [period, setPeriod] = useState<Period>('semana')
  const [anchor, setAnchor] = useState(todayIso())
  const [layout, setLayout] = useState<Layout>('pessoas')
  const [siteId, setSiteId] = useState('')
  const [byName, setByName] = useState(false)
  const r = rangeOf(period, anchor)
  const rows = layout === 'pessoas' ? 'employee' : 'site'
  const cols = layout === 'obra-pessoa' ? 'employee' : COLS[period]
  const matrix = useQuery({
    queryKey: ['org', org.id, 'reporting', 'hours-matrix', rows, cols, r.from, r.to, siteId],
    queryFn: () =>
      api<HoursMatrix>(`/orgs/${org.id}/reporting/hours/matrix?${new URLSearchParams({ rows, cols, from: r.from, to: r.to, ...(siteId ? { siteId } : {}) })}`),
    placeholderData: keepPreviousData,
  })
  const lines = [...(matrix.data?.lines ?? [])].sort(byName ? (a, b) => a.label.localeCompare(b.label, 'pt') : () => 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Período" value={period} onChange={setPeriod} options={[{ value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }, { value: 'ano', label: 'Ano' }]} />
        <div className="flex items-center gap-1">
          <IconButton label="Período anterior" onClick={() => setAnchor(shift(period, anchor, -1))}><ChevronLeft className="size-4" /></IconButton>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(todayIso())}>{r.label}</Button>
          <IconButton label="Período seguinte" onClick={() => setAnchor(shift(period, anchor, 1))}><ChevronRight className="size-4" /></IconButton>
        </div>
        <Segmented label="Vista" value={layout} onChange={setLayout} options={[{ value: 'pessoas', label: 'Pessoas' }, { value: 'obras', label: 'Obras' }, { value: 'obra-pessoa', label: 'Obras × pessoas' }]} />
        <Select aria-label="Obra" value={siteId} onChange={(e) => setSiteId(e.target.value)} className="h-9 max-w-[240px]">
          <option value="">Todas as obras</option>
          {(sites.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
        </Select>
        <Select aria-label="Ordenar" value={byName ? 'nome' : 'total'} onChange={(e) => setByName(e.target.value === 'nome')} className="h-9 max-w-[180px]">
          <option value="total">Mais horas primeiro</option>
          <option value="nome">Por nome</option>
        </Select>
      </div>

      <Panel flush title="Totais de horas" description={`Realizadas (registos fechados) · ${minutesToHours(matrix.data?.totalMin ?? 0)} no período, ${minutesToHours(matrix.data?.approvedMin ?? 0)} aprovadas`}>
        {matrix.isPending ? (
          <SkeletonRows rows={6} />
        ) : matrix.isError ? (
          <ErrorState onRetry={() => void matrix.refetch()}>{errorMessage(matrix.error)}</ErrorState>
        ) : lines.length === 0 ? (
          <EmptyState compact title="Sem horas neste período">Escolha outro período ou outra obra.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th scope="col" className="sticky left-0 bg-surface px-3 py-2 font-medium">{rows === 'employee' ? 'Pessoa' : 'Obra'}</th>
                  {matrix.data!.columns.map((c) => <th key={c.key} scope="col" className="px-2 py-2 text-right font-medium whitespace-nowrap">{c.label}</th>)}
                  <th scope="col" className="px-3 py-2 text-right font-semibold text-ink">Total</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Aprovadas</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="border-b border-line-2">
                    <th scope="row" className="sticky left-0 max-w-[260px] truncate bg-surface px-3 py-1.5 text-left font-normal">{l.label}</th>
                    {matrix.data!.columns.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 text-right font-mono text-xs tabular">{l.cells[c.key] ? minutesToHours(l.cells[c.key]).replace(' h', '') : <span className="text-ink-4">·</span>}</td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-mono font-semibold tabular">{minutesToHours(l.totalMin)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-3 tabular">{minutesToHours(l.approvedMin)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-semibold">
                  <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left">Total</th>
                  {matrix.data!.columns.map((c) => <td key={c.key} className="px-2 py-2 text-right font-mono text-xs tabular">{minutesToHours(c.totalMin).replace(' h', '')}</td>)}
                  <td className="px-3 py-2 text-right font-mono tabular">{minutesToHours(matrix.data!.totalMin)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-ink-3 tabular">{minutesToHours(matrix.data!.approvedMin)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
