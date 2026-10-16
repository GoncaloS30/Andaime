import { Check, ChevronDown, CornerUpLeft, History, Pencil, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { entryHours, formatHours } from '@/domain/hours'
import { ENTRY_STATUS } from '@/domain/labels'
import type { EntryStatus, ID, TimeEntry } from '@/domain/types'
import { addDays, dateShort, dayShort, isoWeek, weekStart } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Badge, SiteCode } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { EmptyState } from '@/ui/States'
import { CorrectDialog, RejectDialog } from './EntryDialogs'
import { plural } from '@/lib/plural'

export const STATUS_TONE: Record<EntryStatus, 'info' | 'warn' | 'ok' | 'danger' | 'neutral'> = {
  aberto: 'info',
  submetido: 'warn',
  revisto: 'warn',
  aprovado: 'ok',
  rejeitado: 'danger',
}

const SHORT: Record<EntryStatus, [string, string]> = {
  aberto: ['em curso', 'em curso'],
  submetido: ['por rever', 'por rever'],
  revisto: ['por aprovar', 'por aprovar'],
  aprovado: ['aprovado', 'aprovados'],
  rejeitado: ['devolvido', 'devolvidos'],
}

interface Sheet {
  key: string
  workerId: ID
  week: string
  entries: TimeEntry[]
  planned: number
  realized: number
  extra: number
  actionable: ID[]
}

interface Props {
  /** gestor aprova; encarregado revê (e devolve). */
  mode: 'gestor' | 'encarregado'
  status: EntryStatus | 'todas'
  workerIds?: ID[]
  teamId?: string | null
  siteId?: string | null
}

/** Folhas semanais (trabalhador × semana) com aprovação em lote, correção e comparação com o planeado. */
export function SheetList({ mode, status, workerIds, teamId, siteId }: Props) {
  const settings = useDemo((s) => s.session.settings)
  const approve = useDemo((s) => s.approveEntries)
  const review = useDemo((s) => s.reviewEntries)
  const undo = useDemo((s) => s.undo)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [reject, setReject] = useState<ID[] | null>(null)
  const [correct, setCorrect] = useState<ID | null>(null)
  const actionableStatus: EntryStatus[] = mode === 'gestor' ? ['revisto', 'submetido'] : ['submetido']

  const sheets = useDerived(({ db, session }) => {
    const scope = workerIds ? new Set(workerIds) : null
    const map = new Map<string, Sheet>()
    for (const e of Object.values(db.entries)) {
      if (scope && !scope.has(e.workerId)) continue
      if (teamId && db.workers[e.workerId]?.teamId !== teamId) continue
      if (siteId && e.siteId !== siteId) continue
      const k = `${e.workerId}|${weekStart(e.date)}`
      const s = map.get(k) ?? { key: k, workerId: e.workerId, week: weekStart(e.date), entries: [], planned: 0, realized: 0, extra: 0, actionable: [] }
      s.entries.push(e)
      map.set(k, s)
    }
    const out: Sheet[] = []
    for (const s of map.values()) {
      if (status !== 'todas' && !s.entries.some((e) => e.status === status)) continue
      s.entries.sort((a, b) => a.date.localeCompare(b.date))
      const end = addDays(s.week, 6)
      // Planeado comparável: dias já passados, ou hoje se o registo já tem saída.
      const closedToday = s.entries.some((e) => e.date === session.today && e.clockOut)
      s.planned = Object.values(db.assignments)
        .filter((a) => a.workerId === s.workerId && a.date >= s.week && a.date <= end && (a.date < session.today || (a.date === session.today && closedToday)))
        .reduce((x, a) => x + a.hours, 0)
      for (const e of s.entries) {
        if (e.status === 'rejeitado' || !e.clockOut) continue
        const h = entryHours(e, settings)
        s.realized += h.worked
        s.extra += h.extra
      }
      s.actionable = s.entries.filter((e) => actionableStatus.includes(e.status)).map((e) => e.id)
      out.push(s)
    }
    return out.sort((a, b) => b.week.localeCompare(a.week) || (db.workers[a.workerId]?.name ?? '').localeCompare(db.workers[b.workerId]?.name ?? ''))
  }, [status, teamId ?? '', siteId ?? '', workerIds?.join(',') ?? '', mode])
  const db = useDemo((s) => s.db)
  const selectedIds = useMemo(() => sheets.filter((s) => checked.has(s.key)).flatMap((s) => s.actionable), [sheets, checked])

  const done: [string, string] = mode === 'gestor' ? ['registo aprovado', 'registos aprovados'] : ['registo revisto', 'registos revistos']
  const act = (ids: ID[]) => {
    if (ids.length === 0) return
    if (mode === 'gestor') approve(ids)
    else review(ids)
    toast.success(plural(ids.length, ...done), {
      description: mode === 'gestor' ? 'As horas aprovadas da obra foram atualizadas.' : 'Seguem para aprovação do gestor.',
      action: { label: 'Anular', onClick: () => undo() },
    })
    setChecked(new Set())
  }

  if (sheets.length === 0) {
    return (
      <EmptyState icon={<Check />} title={status === 'revisto' || status === 'submetido' ? 'Nada por tratar' : 'Sem folhas'}>
        {status === 'revisto' ? 'Todas as folhas revistas pelos encarregados já foram aprovadas.' : status === 'submetido' ? 'Não há registos à espera de revisão.' : 'Não há folhas com este estado.'}
      </EmptyState>
    )
  }

  const verb = mode === 'gestor' ? 'Aprovar' : 'Validar'

  return (
    <div>
      {selectedIds.length > 0 && (
        <div role="toolbar" aria-label="Ações nas folhas selecionadas" className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-md bg-pinho px-3 py-2 text-white shadow-e1">
          <span className="text-sm font-semibold">{checked.size} folhas · {selectedIds.length} registos</span>
          <Button size="sm" variant="accent" icon={<Check className="size-3.5" />} onClick={() => act(selectedIds)} data-tour="approve-selected">{verb} selecionadas</Button>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" icon={<X className="size-3.5" />} onClick={() => setReject(selectedIds)}>{mode === 'gestor' ? 'Rejeitar' : 'Devolver'}</Button>
          <button type="button" className="ml-auto text-xs text-white/70 hover:text-white" onClick={() => setChecked(new Set())}>Limpar seleção</button>
        </div>
      )}
      <ul className="overflow-hidden rounded-lg border border-line bg-surface">
        {sheets.map((s) => {
          const w = db.workers[s.workerId]
          const isOpen = open.has(s.key)
          const diff = Math.round((s.realized - s.planned) * 10) / 10
          const present = (['revisto', 'submetido', 'rejeitado', 'aberto', 'aprovado'] as EntryStatus[])
            .map((st) => ({ st, n: s.entries.filter((e) => e.status === st).length }))
            .filter((x) => x.n > 0)
            .sort((a, b) => Number(b.st === status) - Number(a.st === status))
          return (
            <li key={s.key} className="border-b border-line-2 last:border-0">
              <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label={`Selecionar folha de ${w?.name}, semana ${isoWeek(s.week)}`}
                  className="size-4 accent-pinho"
                  disabled={s.actionable.length === 0}
                  checked={checked.has(s.key)}
                  onChange={() => setChecked((c) => { const n = new Set(c); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n })}
                />
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n })} className="flex min-w-[220px] flex-1 items-center gap-3 text-left">
                  <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-ink-3 transition-transform', !isOpen && '-rotate-90')} />
                  <Avatar name={w?.name ?? '?'} size="sm" color={db.teams[w?.teamId ?? '']?.color} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{w?.name}</span>
                    <span className="block text-xs text-ink-3">Semana {isoWeek(s.week)} · {dateShort(s.week)} a {dateShort(addDays(s.week, 6))} · {s.entries.length} dias</span>
                  </span>
                </button>
                <span className="flex items-center gap-4 text-xs">
                  <span className="text-right">
                    <span className="block text-ink-3" title="Planeadas até hoje (dias já decorridos)">Planeadas</span>
                    <span className="font-mono tabular">{formatHours(s.planned)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-ink-3">Realizadas</span>
                    <span className="font-mono font-semibold tabular">{formatHours(Math.round(s.realized * 10) / 10)}</span>
                  </span>
                  <span className={cn('w-14 text-right font-mono tabular', diff > 0 ? 'text-ambar-ink' : diff < 0 ? 'text-tijolo-ink' : 'text-ink-3')} title="Diferença face ao planeado">
                    {diff > 0 ? '+' : ''}{diff === 0 ? '=' : formatHours(diff)}
                  </span>
                  <span className="flex w-44 flex-wrap justify-end gap-1">
                    {present.slice(0, 2).map(({ st, n }) => (
                      <Badge key={st} tone={STATUS_TONE[st]} dot>
                        {plural(n, ...SHORT[st])}
                      </Badge>
                    ))}
                  </span>
                </span>
                {s.actionable.length > 0 && (
                  <span className="flex gap-1">
                    <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={() => act(s.actionable)}>{verb}</Button>
                    <IconButton label={mode === 'gestor' ? 'Rejeitar folha' : 'Devolver folha'} size="sm" variant="secondary" onClick={() => setReject(s.actionable)}>
                      {mode === 'gestor' ? <X className="size-4" /> : <CornerUpLeft className="size-4" />}
                    </IconButton>
                  </span>
                )}
              </div>
              {isOpen && (
                <div className="overflow-x-auto border-t border-line-2 bg-cal/50">
                  <table className="table-a min-w-[760px]">
                    <thead>
                      <tr>
                        <th scope="col">Dia</th>
                        <th scope="col">Obra</th>
                        <th scope="col">Entrada–saída</th>
                        <th scope="col" className="num">Pausa</th>
                        <th scope="col" className="num">Normais</th>
                        <th scope="col" className="num">Extra</th>
                        <th scope="col">Estado</th>
                        <th scope="col"><span className="sr-only">Ações</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.entries.map((e) => {
                        const h = entryHours(e, settings)
                        const site = db.sites[e.siteId]
                        return (
                          <tr key={e.id}>
                            <td className="whitespace-nowrap">{dayShort(e.date)} {dateShort(e.date)}</td>
                            <td>{site && <SiteCode code={site.code} color={site.color} />}</td>
                            <td className="font-mono text-xs">
                              {e.clockIn}–{e.clockOut ?? 'em curso'}
                              <span className="ml-1 font-sans text-ink-3">{e.source === 'ponto' ? '' : e.source === 'encarregado' ? '· enc.' : '· manual'}</span>
                            </td>
                            <td className="num font-mono text-xs">{e.breakMinutes}′</td>
                            <td className="num font-mono text-xs">{e.clockOut ? h.normal : '—'}</td>
                            <td className={cn('num font-mono text-xs', h.extra > 0 && 'font-semibold text-ambar-ink')}>{e.clockOut && h.extra ? h.extra : '—'}</td>
                            <td>
                              <Badge tone={STATUS_TONE[e.status]} dot>{ENTRY_STATUS[e.status]}</Badge>
                              {e.rejectionReason && <span className="mt-0.5 block max-w-56 text-xs text-tijolo-ink">{e.rejectionReason}</span>}
                              {e.corrections.length > 0 && (
                                <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-3" title={e.corrections.map((c) => `${c.by}: ${c.reason} (${c.before} → ${c.after})`).join('\n')}>
                                  <History className="size-3" aria-hidden /> {e.corrections.length} correção · {e.corrections.at(-1)!.reason}
                                </span>
                              )}
                            </td>
                            <td className="text-right">
                              {e.status !== 'aberto' && e.status !== 'aprovado' && (
                                <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setCorrect(e.id)}>Corrigir</Button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <p className="px-3 py-2 text-xs text-ink-3">
                    {s.extra > 0 && `${formatHours(Math.round(s.extra * 10) / 10)} extra nesta semana. `}
                    <Link to={`/trabalhadores/${s.workerId}?tab=horas`} className="text-pinho hover:underline">Ver todas as horas de {w?.name}</Link>
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {reject && <RejectDialog ids={reject} onClose={() => setReject(null)} mode={mode === 'gestor' ? 'rejeitar' : 'devolver'} />}
      {correct && <CorrectDialog id={correct} onClose={() => setCorrect(null)} />}
    </div>
  )
}
