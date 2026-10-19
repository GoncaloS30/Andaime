import { useState } from 'react'
import { useDerived } from '@/app/hooks'
import { ABSENCE_COLOR, ABSENCE_STATUS, ABSENCE_TYPE } from '@/domain/labels'
import type { Absence, AbsenceType } from '@/domain/types'
import { yearMap, yearsWithAbsences } from '@/domain/vacationMap'
import { dateShort } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Select } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Posição (0–1) de uma data no ano, para desenhar os períodos na régua do ano. */
function frac(date: string, year: number) {
  const t0 = Date.UTC(year, 0, 1)
  const t1 = Date.UTC(year + 1, 0, 1)
  return Math.min(1, Math.max(0, (Date.parse(date) - t0) / (t1 - t0)))
}

/**
 * Mapa de férias do ano: uma linha por pessoa, os 12 meses em colunas e os períodos desenhados.
 * Aprovado = cheio; pedido = tracejado (a mesma linguagem planeado/realizado do resto da app).
 */
export function YearMap() {
  const today = useDemo((s) => s.session.today)
  const years = useDerived(({ db }) => yearsWithAbsences(db, today), [today])
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const rows = useDerived(({ db }) => yearMap(db, year), [year])
  const [open, setOpen] = useState<Absence | null>(null)
  const todayX = today.startsWith(String(year)) ? frac(today, year) : null
  const used = [...new Set(rows.flatMap((r) => r.periods.map((p) => p.type)))] as AbsenceType[]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm" htmlFor="ym-year">
          Ano
          <Select id="ym-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </label>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2" aria-label="Legenda">
          {used.map((t) => (
            <li key={t} className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-4 rounded-xs" style={{ background: ABSENCE_COLOR[t] }} />{ABSENCE_TYPE[t]}</li>
          ))}
          <li className="flex items-center gap-1.5"><span aria-hidden className="hatch h-2.5 w-4 rounded-xs border border-ink-3" />Pedido (por decidir)</li>
        </ul>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <caption className="sr-only">Mapa de ausências de {year}: uma linha por trabalhador, com os períodos marcados ao longo do ano</caption>
          <thead>
            <tr className="border-b border-line text-xs text-ink-3">
              <th scope="col" className="w-56 px-3 py-2 text-left font-semibold">Trabalhador</th>
              <th scope="col" className="px-0 py-2">
                <span className="grid grid-cols-12">{MONTHS.map((m) => <span key={m} className="border-l border-line-2 px-1 text-left font-condensed font-semibold uppercase">{m}</span>)}</span>
              </th>
              <th scope="col" className="w-24 px-3 py-2 text-right font-semibold">Férias</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.worker.id} className="border-b border-line-2 last:border-0">
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  <span className="flex items-center gap-2">
                    <Avatar name={r.worker.name} photo={r.worker.photo} size="xs" />
                    <span className="truncate">{r.worker.name}</span>
                  </span>
                </th>
                <td className="relative h-8 p-0">
                  <span aria-hidden className="absolute inset-0 grid grid-cols-12">{MONTHS.map((m) => <span key={m} className="border-l border-line-2" />)}</span>
                  {todayX !== null && <span aria-hidden className="absolute inset-y-0 w-px bg-pinho" style={{ left: `${todayX * 100}%` }} />}
                  {r.periods.map((p) => {
                    const left = frac(p.start, year)
                    const right = frac(p.end > `${year}-12-31` ? `${year + 1}-01-01` : addOne(p.end), year)
                    const pending = p.status === 'pedido'
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setOpen(p)}
                        aria-label={`${ABSENCE_TYPE[p.type]} de ${dateShort(p.start)} a ${dateShort(p.end)}, ${ABSENCE_STATUS[p.status].toLowerCase()}`}
                        className={`absolute top-1.5 bottom-1.5 min-w-1.5 rounded-xs focus-visible:ring-2 focus-visible:ring-pinho focus-visible:ring-offset-1 ${pending ? 'hatch border' : ''}`}
                        style={{ left: `${left * 100}%`, width: `${Math.max(0.4, (right - left) * 100)}%`, ...(pending ? { borderColor: ABSENCE_COLOR[p.type], color: ABSENCE_COLOR[p.type] } : { background: ABSENCE_COLOR[p.type] }) }}
                      />
                    )
                  })}
                </td>
                <td className="px-3 py-1.5 text-right tabular">
                  {r.vacationDays} <span className="text-xs text-ink-3">dias</span>
                  {r.pendingDays > 0 && <span className="block text-xs text-ambar-ink">+{r.pendingDays} pedidos</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <PeriodDialog a={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function addOne(d: string) {
  const t = new Date(Date.parse(d) + 86_400_000)
  return t.toISOString().slice(0, 10)
}

function PeriodDialog({ a, onClose }: { a: Absence; onClose: () => void }) {
  const w = useDemo((s) => s.db.workers[a.workerId])
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="sm" eyebrow={w?.name} title={ABSENCE_TYPE[a.type]} description={`${dateShort(a.start)} a ${dateShort(a.end)} · ${ABSENCE_STATUS[a.status]}`}>
      <p className="text-sm text-ink-2">{a.reason || 'Sem motivo indicado.'}</p>
    </Dialog>
  )
}
