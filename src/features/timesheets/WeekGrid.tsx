import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { entryHours, formatHours, splitHours } from '@/domain/hours'
import type { ID } from '@/domain/types'
import { addDays, dayShort, isoWeek, weekDays, weekStart } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { selectForemanScope } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Button, IconButton } from '@/ui/Button'
import { Field, Textarea } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'
import { EmptyState } from '@/ui/States'

type Key = `${string}|${string}`

/**
 * Grelha da semana: uma célula por pessoa e dia com as horas do dia. Muda-se o número, guarda-se com um
 * motivo (fica como correção) e as horas extra saem das regras de sempre. Registos aprovados ficam fechados.
 */
export function WeekGrid({ scope }: { scope: 'gestor' | 'encarregado' }) {
  const today = useDemo((s) => s.session.today)
  const settings = useDemo((s) => s.session.settings)
  const setDayHours = useDemo((s) => s.setDayHours)
  const undo = useDemo((s) => s.undo)
  const [ws, setWs] = useState(weekStart(today))
  const days = weekDays(ws)
  const [draft, setDraft] = useState<Record<Key, string>>({})
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  const data = useDerived(({ db, session }) => {
    const allowed = scope === 'encarregado' ? new Set(selectForemanScope({ db, session }).workerIds) : null
    const ids = new Set<ID>()
    for (const a of Object.values(db.assignments)) if (a.date >= ws && a.date <= addDays(ws, 6)) ids.add(a.workerId)
    for (const e of Object.values(db.entries)) if (e.date >= ws && e.date <= addDays(ws, 6)) ids.add(e.workerId)
    const rows = [...ids].filter((id) => !allowed || allowed.has(id)).map((id) => db.workers[id]!).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'pt'))
    const cell = (wid: ID, d: string) => {
      const e = Object.values(db.entries).find((x) => x.workerId === wid && x.date === d)
      const a = Object.values(db.assignments).find((x) => x.workerId === wid && x.date === d)
      return { e, a, hours: e?.clockOut ? entryHours(e, session.settings).worked : 0, siteId: e?.siteId ?? a?.siteId ?? null }
    }
    return { db, rows, cell }
  }, [ws, scope])

  const changes = Object.entries(draft).filter(([k, v]) => {
    const [wid, d] = k.split('|') as [string, string]
    return v !== '' && Number(v.replace(',', '.')) !== data.cell(wid, d).hours
  })

  const save = () => {
    setTouched(true)
    if (!reason.trim()) return
    let ok = 0
    for (const [k, v] of changes) {
      const [wid, d] = k.split('|') as [string, string]
      const c = data.cell(wid, d)
      const siteId = c.siteId ?? Object.values(data.db.sites)[0]!.id
      try {
        setDayHours({ workerId: wid, date: d, siteId, hours: Number(v.replace(',', '.')), reason })
        ok++
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível guardar uma das células.')
      }
    }
    if (ok) toast.success(`${ok === 1 ? '1 dia atualizado' : `${ok} dias atualizados`}`, { description: 'As horas extra foram recalculadas e a correção ficou registada.', action: { label: 'Anular', onClick: () => undo() } })
    setDraft({})
    setReason('')
    setTouched(false)
    setAsking(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border border-line bg-surface">
          <IconButton label="Semana anterior" onClick={() => { setWs(addDays(ws, -7)); setDraft({}) }}><ChevronLeft className="size-4" /></IconButton>
          <span className="border-x border-line px-3 text-sm font-medium">Semana {isoWeek(ws)}</span>
          <IconButton label="Semana seguinte" onClick={() => { setWs(addDays(ws, 7)); setDraft({}) }}><ChevronRight className="size-4" /></IconButton>
        </div>
        <p className="text-sm text-ink-3">Horas totais do dia. Acima de {settings.dailyNormal} h (e ao fim de semana) contam como extra.</p>
        <Button className="ml-auto" variant="primary" disabled={changes.length === 0} onClick={() => setAsking(true)}>
          Guardar alterações{changes.length ? ` (${changes.length})` : ''}
        </Button>
      </div>
      {data.rows.length === 0 ? (
        <EmptyState title="Ninguém escalado nesta semana">Escolha outra semana.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-a min-w-[860px]">
            <thead>
              <tr>
                <th scope="col">Colaborador</th>
                {days.map((d) => <th key={d} scope="col" className={cn('num font-condensed', d === today && 'text-pinho')}>{dayShort(d)} {Number(d.slice(8))}</th>)}
                <th scope="col" className="num">Total</th>
                <th scope="col" className="num">Extra</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((w) => {
                const vals = days.map((d) => {
                  const k = `${w.id}|${d}` as Key
                  const c = data.cell(w.id, d)
                  const v = draft[k] ?? (c.hours ? String(c.hours).replace('.', ',') : '')
                  return { d, k, c, v, n: Number(v.replace(',', '.')) || 0 }
                })
                const total = vals.reduce((t, x) => t + x.n, 0)
                const extra = vals.reduce((t, x) => t + splitHours(x.d, x.n, settings.dailyNormal).extra, 0)
                return (
                  <tr key={w.id}>
                    <th scope="row" className="font-normal">
                      <span className="flex items-center gap-2"><Avatar name={w.name} photo={w.photo} size="xs" /><span className="truncate">{w.name}</span></span>
                    </th>
                    {vals.map(({ d, k, c, v }) => {
                      const locked = c.e?.status === 'aprovado'
                      const dirty = draft[k] !== undefined && Number(v.replace(',', '.')) !== c.hours
                      return (
                        <td key={d} className="num p-1">
                          {locked ? (
                            <span className="inline-flex items-center gap-1 font-mono text-sm tabular text-ink-2" title="Aprovado: não se altera aqui"><Lock className="size-3 text-ink-4" aria-hidden />{formatHours(c.hours, '')}</span>
                          ) : (
                            <input
                              aria-label={`${w.name}, ${dayShort(d)} ${Number(d.slice(8))}: horas`}
                              inputMode="decimal"
                              value={v}
                              placeholder={c.a ? String(c.a.hours) : ''}
                              onChange={(e) => setDraft({ ...draft, [k]: e.target.value.replace(/[^\d,.]/g, '') })}
                              className={cn('h-8 w-14 rounded-sm border bg-surface text-right font-mono text-sm tabular placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-pinho', dirty ? 'border-ambar bg-ambar-soft' : 'border-line-2')}
                            />
                          )}
                        </td>
                      )
                    })}
                    <td className="num font-mono font-semibold tabular">{formatHours(Math.round(total * 100) / 100, '')}</td>
                    <td className={cn('num font-mono tabular', extra > 0 ? 'text-ambar-ink' : 'text-ink-4')}>{extra ? formatHours(Math.round(extra * 100) / 100, '') : '·'}</td>
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
          footer={<><Button variant="ghost" onClick={() => setAsking(false)}>Cancelar</Button><Button variant="primary" onClick={save}>Guardar</Button></>}
        >
          <Field label="Motivo" error={touched && !reason.trim() ? 'Indique o motivo (ex.: "Ficou até mais tarde na betonagem").' : null}>
            {(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        </Dialog>
      )}
    </div>
  )
}
