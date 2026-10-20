import { Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/Button'
import { Field, Textarea } from '@/ui/Field'
import { Panel } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { errorMessage } from '../../api/http'
import { useEntries, useTimesheets, useWeekGrid } from '../../api/timekeeping'
import { addDaysIso, minutesToHours, todayIso } from '../../api/workforce'
import { useActiveOrg } from '../../session'

type Key = `${string}|${string}`
const DAY = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
const toHours = (min: number) => (min ? String(Math.round((min / 60) * 100) / 100).replace('.', ',') : '')
const toMinutes = (v: string) => Math.round(Number(v.replace(',', '.')) * 60)

/**
 * Grelha da semana (porta do protótipo V3.1): uma célula por pessoa e dia com as horas do dia. Muda-se o número e
 * guarda-se tudo com um motivo; o servidor cria, ajusta ou anula o registo e as horas extra saem da política laboral.
 * Semanas aprovadas ficam fechadas.
 */
export function WeekGrid({ week }: { week: string }) {
  const org = useActiveOrg()
  const today = todayIso()
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(week, i))
  const sheets = useTimesheets(org.id, week)
  const entries = useEntries(org.id, week, addDaysIso(week, 6))
  const save = useWeekGrid(org.id)
  const [draft, setDraft] = useState<Record<Key, string>>({})
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  const worked = useMemo(() => {
    const m = new Map<Key, number>()
    for (const e of entries.data ?? []) if (e.status === 'CLOSED' && e.workedMin) m.set(`${e.employeeId}|${e.workDate}`, (m.get(`${e.employeeId}|${e.workDate}`) ?? 0) + e.workedMin)
    return m
  }, [entries.data])

  const changes = (Object.entries(draft) as [Key, string][]).filter(([k, v]) => v.trim() !== '' && toMinutes(v) !== (worked.get(k) ?? 0) || (v.trim() === '' && (worked.get(k) ?? 0) > 0))

  const submit = () => {
    setTouched(true)
    if (!reason.trim()) return
    const cells = changes.map(([k, v]) => {
      const [employeeId, date] = k.split('|') as [string, string]
      return { employeeId, date, minutes: v.trim() === '' ? 0 : toMinutes(v) }
    })
    save.mutate(
      { reason: reason.trim(), cells },
      {
        onSuccess: (r) => {
          toast.success(`${cells.length === 1 ? '1 dia guardado' : `${cells.length} dias guardados`}`, {
            description: `${r.created} criados · ${r.updated} ajustados · ${r.cancelled} anulados. As horas extra foram recalculadas.`,
          })
          setDraft({})
          setReason('')
          setTouched(false)
          setAsking(false)
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  if (sheets.isPending || entries.isPending) return <SkeletonRows rows={6} />
  if (sheets.isError) return <ErrorState onRetry={() => void sheets.refetch()}>{errorMessage(sheets.error)}</ErrorState>
  const rows = [...(sheets.data ?? [])].sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'pt'))

  return (
    <Panel
      flush
      title="Grelha da semana"
      description="Horas totais de cada dia. Alterar cria ou ajusta o registo do dia, com motivo; 0 ou vazio anula-o."
      actions={
        <Button variant="primary" size="sm" disabled={changes.length === 0} onClick={() => setAsking(true)}>
          Guardar alterações{changes.length ? ` (${changes.length})` : ''}
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState compact title="Ninguém com folha nesta semana">Escolha outra semana.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-3">
                <th scope="col" className="sticky left-0 bg-surface px-3 py-2 text-left font-medium">Pessoa</th>
                {days.map((d) => (
                  <th key={d} scope="col" className={cn('px-1 py-2 text-right font-medium capitalize', d === today && 'text-pinho')}>
                    {DAY.format(new Date(`${d}T00:00:00Z`))}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-semibold text-ink">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const locked = s.status === 'APPROVED'
                const total = days.reduce((t, d) => {
                  const k: Key = `${s.employeeId}|${d}`
                  return t + (draft[k] !== undefined ? (draft[k].trim() ? toMinutes(draft[k]) : 0) : (worked.get(k) ?? 0))
                }, 0)
                return (
                  <tr key={s.employeeId} className="border-b border-line-2">
                    <th scope="row" className="sticky left-0 bg-surface px-3 py-1 text-left font-normal">
                      <span className="flex items-center gap-1.5">
                        {locked && <Lock className="size-3 text-ink-4" aria-label="Semana aprovada" />}
                        <span className="truncate">{s.employeeName}</span>
                      </span>
                    </th>
                    {days.map((d) => {
                      const k: Key = `${s.employeeId}|${d}`
                      const value = draft[k] ?? toHours(worked.get(k) ?? 0)
                      const dirty = draft[k] !== undefined && changes.some(([c]) => c === k)
                      return (
                        <td key={d} className="px-1 py-1 text-right">
                          {locked ? (
                            <span className="font-mono text-xs text-ink-2 tabular">{value || '·'}</span>
                          ) : (
                            <input
                              aria-label={`${s.employeeName}, ${DAY.format(new Date(`${d}T00:00:00Z`))}: horas`}
                              inputMode="decimal"
                              value={value}
                              onChange={(e) => setDraft({ ...draft, [k]: e.target.value.replace(/[^\d,.]/g, '') })}
                              className={cn(
                                'h-8 w-14 rounded-sm border bg-surface text-right font-mono text-sm tabular focus:ring-2 focus:ring-pinho focus:outline-none',
                                dirty ? 'border-ambar bg-ambar-soft' : 'border-line-2',
                              )}
                            />
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-1 text-right font-mono font-semibold tabular">{minutesToHours(total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {asking && (
        <Dialog
          open
          onOpenChange={(o) => !o && setAsking(false)}
          size="sm"
          title={`Guardar ${changes.length === 1 ? '1 alteração' : `${changes.length} alterações`}`}
          description="O motivo fica em cada registo alterado, com os valores de antes e de depois."
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAsking(false)}>Cancelar</Button>
              <Button variant="primary" loading={save.isPending} onClick={submit}>Guardar</Button>
            </div>
          }
        >
          <Field label="Motivo" error={touched && !reason.trim() ? 'Indique o motivo (ex.: "Ficou até mais tarde na betonagem").' : null}>
            {(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        </Dialog>
      )}
    </Panel>
  )
}
