import { CalendarRange } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Badge } from '@/ui/Badge'
import { Select } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { useAbsenceYear, type YearPeriod, type YearPeriodKind, type YearRow } from '../../api/calendar'
import { errorMessage } from '../../api/http'
import { formatDate, todayIso } from '../../api/workforce'
import { useActiveOrg } from '../../session'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const YEAR_KIND_LABEL: Record<YearPeriodKind, string> = {
  VACATION: 'Férias',
  SICK: 'Doença',
  TRAINING: 'Formação',
  PERSONAL: 'Assunto pessoal',
  LEAVE: 'Licença',
  OTHER: 'Outra',
  ABSENCE: 'Ausência',
}

/** Cor e padrão por tipo: o padrão distingue os tipos sem depender só da cor. */
const KIND_STYLE: Record<YearPeriodKind, { color: string; pattern: string | null }> = {
  VACATION: { color: 'var(--color-ok)', pattern: null },
  SICK: { color: '#7a44b3', pattern: 'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.55) 0 1.5px, transparent 1.5px 5px)' },
  TRAINING: { color: 'var(--color-ambar-ink)', pattern: 'radial-gradient(rgb(255 255 255 / 0.7) 1px, transparent 1.3px) 0 0 / 4px 4px' },
  PERSONAL: { color: 'var(--color-aco)', pattern: 'repeating-linear-gradient(90deg, rgb(255 255 255 / 0.55) 0 1.5px, transparent 1.5px 5px)' },
  LEAVE: { color: '#a8396d', pattern: 'repeating-linear-gradient(0deg, rgb(255 255 255 / 0.55) 0 1.5px, transparent 1.5px 4px)' },
  OTHER: { color: 'var(--color-ink-2)', pattern: 'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.5) 0 1px, transparent 1px 4px), repeating-linear-gradient(135deg, rgb(255 255 255 / 0.5) 0 1px, transparent 1px 4px)' },
  ABSENCE: { color: 'var(--color-ink-2)', pattern: 'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.5) 0 1px, transparent 1px 4px), repeating-linear-gradient(135deg, rgb(255 255 255 / 0.5) 0 1px, transparent 1px 4px)' },
}

function periodStyle(kind: YearPeriodKind, pending: boolean): CSSProperties {
  const { color, pattern } = KIND_STYLE[kind]
  if (pending) {
    // Pedida (por decidir): contorno tracejado e fundo claro, a mesma linguagem "tracejado = planeado" da aplicação.
    return { border: `1.5px dashed ${color}`, background: `color-mix(in oklab, ${color} 16%, white)` }
  }
  return { background: pattern ? `${pattern}, ${color}` : color }
}

const DAY_MS = 86_400_000
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

/** Posição (0–1) do início de um dia no ano. */
function frac(iso: string, year: number) {
  const t0 = Date.UTC(year, 0, 1)
  const t1 = Date.UTC(year + 1, 0, 1)
  return Math.min(1, Math.max(0, (utc(iso) - t0) / (t1 - t0)))
}

const monthDays = (year: number) => MONTHS.map((_, m) => new Date(Date.UTC(year, m + 1, 0)).getUTCDate())

const periodText = (p: YearPeriod) => (p.startsOn === p.endsOn ? formatDate(p.startsOn) : `${formatDate(p.startsOn)} a ${formatDate(p.endsOn)}`)

/**
 * Mapa de férias do ano: uma linha por pessoa, os 12 meses em colunas finas e os períodos desenhados. Aprovada =
 * cheia com o padrão do tipo; pedida = tracejada. Cada período é um botão com nome acessível; a grelha percorre-se
 * por linha com Tab.
 */
export function AbsenceYearMap() {
  const org = useActiveOrg()
  const today = todayIso()
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const map = useAbsenceYear(org.id, year)
  const [open, setOpen] = useState<{ row: YearRow; period: YearPeriod } | null>(null)
  const years = map.data?.years ?? [year, year + 1]
  const todayX = today.startsWith(String(year)) ? frac(today, year) : null
  const columns = monthDays(year).map((d) => `${d}fr`).join(' ')
  const rows = map.data?.year === year ? map.data.rows : []
  const used = [...new Set(rows.flatMap((r) => r.periods.map((p) => p.kind)))]
  const legend = (Object.keys(YEAR_KIND_LABEL) as YearPeriodKind[]).filter((k) => k === 'VACATION' || used.includes(k))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-ink" htmlFor="mapa-ano">
          Ano
          <Select id="mapa-ano" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-8 w-28">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </label>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2" aria-label="Legenda">
          {legend.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-5 rounded-xs" style={periodStyle(k, false)} />
              {YEAR_KIND_LABEL[k]}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-5 rounded-xs" style={periodStyle('VACATION', true)} />
            Pedida (por decidir)
          </li>
          {todayX !== null && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-0.5 bg-tijolo" />
              Hoje
            </li>
          )}
        </ul>
      </div>
      <p className="text-xs text-ink-3">
        Dias úteis de férias contados só dentro do ano, sem os dias de descanso da política laboral nem os feriados (nacionais e da empresa).
      </p>

      {map.isError ? (
        <ErrorState onRetry={() => void map.refetch()}>{errorMessage(map.error)}</ErrorState>
      ) : map.isPending ? (
        <SkeletonRows rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<CalendarRange />} title="Sem trabalhadores para mostrar" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <caption className="sr-only">
              Mapa de ausências de {year}: uma linha por trabalhador, com os períodos marcados ao longo do ano
            </caption>
            <thead>
              <tr className="border-b border-line text-xs text-ink-3">
                <th scope="col" className="w-56 px-3 py-2 text-left font-semibold">
                  Trabalhador
                </th>
                <th scope="col" className="px-0 py-2">
                  <span className="sr-only">Meses de janeiro a dezembro</span>
                  <span aria-hidden className="grid" style={{ gridTemplateColumns: columns }}>
                    {MONTHS.map((m) => (
                      <span key={m} className="border-l border-line-2 px-1 text-left font-semibold uppercase">
                        {m}
                      </span>
                    ))}
                  </span>
                </th>
                <th scope="col" className="w-28 px-3 py-2 text-right font-semibold">
                  Férias (dias úteis)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} className="border-b border-line-2 last:border-0">
                  <th scope="row" className="truncate px-3 py-1.5 text-left font-normal text-ink">
                    {r.employeeName}
                  </th>
                  <td className="relative h-9 p-0">
                    <span aria-hidden className="absolute inset-0 grid" style={{ gridTemplateColumns: columns }}>
                      {MONTHS.map((m) => (
                        <span key={m} className="border-l border-line-2" />
                      ))}
                    </span>
                    {todayX !== null && <span aria-hidden className="absolute inset-y-0 w-0.5 bg-tijolo" style={{ left: `${todayX * 100}%` }} />}
                    {r.periods.map((p) => {
                      const left = frac(p.from, year)
                      const right = frac(new Date(utc(p.to) + DAY_MS).toISOString().slice(0, 10), year)
                      const pending = p.status === 'REQUESTED'
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setOpen({ row: r, period: p })}
                          aria-label={`${r.employeeName}: ${YEAR_KIND_LABEL[p.kind]} de ${periodText(p)}, ${pending ? 'pedida' : 'aprovada'}${p.kind === 'VACATION' ? `, ${p.workingDays} dias úteis em ${year}` : ''}`}
                          title={`${YEAR_KIND_LABEL[p.kind]} · ${periodText(p)}${pending ? ' · pedida' : ''}`}
                          className="absolute top-2 bottom-2 min-w-1.5 rounded-xs focus-visible:ring-2 focus-visible:ring-pinho focus-visible:ring-offset-1 focus-visible:outline-none"
                          style={{ left: `${left * 100}%`, width: `${Math.max(0.4, (right - left) * 100)}%`, ...periodStyle(p.kind, pending) }}
                        />
                      )
                    })}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular">
                    {r.vacationDays} <span className="text-xs text-ink-3">dias</span>
                    {r.pendingVacationDays > 0 && <span className="block text-xs text-ambar-ink">+{r.pendingVacationDays} pedidos</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <PeriodDialog {...open} year={year} onClose={() => setOpen(null)} />}
    </div>
  )
}

function PeriodDialog({ row, period, year, onClose }: { row: YearRow; period: YearPeriod; year: number; onClose: () => void }) {
  const pending = period.status === 'REQUESTED'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="sm" eyebrow={row.employeeName} title={YEAR_KIND_LABEL[period.kind]} description={periodText(period)}>
      <div className="flex flex-col gap-2 text-sm text-ink-2">
        <p>
          <Badge tone={pending ? 'info' : 'ok'}>{pending ? 'Pedida' : 'Aprovada'}</Badge>
        </p>
        {period.partialMinutes ? (
          <p>Só parte do dia ({period.partialMinutes} min).</p>
        ) : (
          <p>
            {period.workingDays} {period.workingDays === 1 ? 'dia útil' : 'dias úteis'} em {year}
            {(period.from !== period.startsOn || period.to !== period.endsOn) && ' (o período passa a viragem do ano)'}.
          </p>
        )}
        {period.kind === 'ABSENCE' && <p className="text-xs text-ink-3">O tipo desta ausência só é visível para os gestores.</p>}
      </div>
    </Dialog>
  )
}
