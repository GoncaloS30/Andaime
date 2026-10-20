import { AlertTriangle, CheckCheck, ChevronLeft, ChevronRight, Clock, History, Pencil, Plus, UserCheck, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { Badge } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { Checkbox, Field, Input, Select, Textarea } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { Dialog, Drawer } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { errorMessage, isApiError } from '../../api/http'
import { hhmm, mondayOf } from '../../api/planning'
import {
  SHEET_LABEL,
  SHEET_TONE,
  SOURCE_LABEL,
  usePlannedDay,
  useConfirmPlanned,
  useRevisions,
  useSaveEntry,
  useTimesheet,
  useTimesheetAction,
  useTimesheets,
  type SheetStatus,
  type TimeEntry,
} from '../../api/timekeeping'
import { atLeast } from '../../api/types'
import { addDaysIso, formatDate, minutesToHours, todayIso, useSites } from '../../api/workforce'
import { useActiveOrg } from '../../session'

const DAY = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' })
const dayName = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`))

/** Horas: folhas semanais por trabalhador. O gestor aprova; o encarregado confirma presenças e submete pela equipa. */
export function TimesheetsPage() {
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const today = todayIso()
  const [week, setWeek] = useState(() => mondayOf(today))
  const [status, setStatus] = useState<SheetStatus | ''>('')
  const sheets = useTimesheets(org.id, week, status)
  const action = useTimesheetAction(org.id)
  const [open, setOpen] = useState<string | null>(null)
  const submitted = (sheets.data ?? []).filter((s) => s.status === 'SUBMITTED' && s.openEntries === 0)

  const approveAll = async () => {
    let ok = 0
    for (const s of submitted) {
      try {
        await action.mutateAsync({ employeeId: s.employeeId, week, action: 'approve', version: s.version })
        ok++
      } catch (e) {
        toast.error(`${s.employeeName}: ${errorMessage(e)}`)
      }
    }
    if (ok) toast.success(`${ok} folha(s) aprovada(s)`)
  }

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title={manager ? 'Horas e aprovações' : 'Horas da equipa'}
        description={manager ? 'Folhas semanais calculadas pela política laboral da empresa. Aprovar fecha a semana.' : 'Confirme as presenças e submeta as folhas da sua equipa para aprovação.'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label="Semana anterior" onClick={() => setWeek(addDaysIso(week, -7))}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <Button variant="ghost" size="sm" onClick={() => setWeek(mondayOf(today))}>
              {formatDate(week)} – {formatDate(addDaysIso(week, 6))}
            </Button>
            <IconButton label="Semana seguinte" onClick={() => setWeek(addDaysIso(week, 7))}>
              <ChevronRight className="size-4" />
            </IconButton>
            {manager && (
              <Button variant="primary" icon={<CheckCheck className="size-4" />} disabled={submitted.length === 0} loading={action.isPending} onClick={() => void approveAll()}>
                Aprovar submetidas ({submitted.length})
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-4">
        {week <= today && today <= addDaysIso(week, 6) && <PresenceToday />}

        <Panel
          flush
          title="Folhas da semana"
          actions={
            <Select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as SheetStatus | '')} className="h-8 max-w-[180px]">
              <option value="">Todos os estados</option>
              {(Object.keys(SHEET_LABEL) as SheetStatus[]).map((s) => (
                <option key={s} value={s}>
                  {SHEET_LABEL[s]}
                </option>
              ))}
            </Select>
          }
        >
          {sheets.isPending ? (
            <SkeletonRows rows={6} />
          ) : sheets.isError ? (
            <ErrorState onRetry={() => void sheets.refetch()}>{errorMessage(sheets.error)}</ErrorState>
          ) : sheets.data.length === 0 ? (
            <EmptyState icon={<Clock />} title="Sem horas nesta semana">
              Aparecem aqui os trabalhadores com planeamento ou registos de horas na semana.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-3">
                    <th className="px-4 py-2 font-semibold">Trabalhador</th>
                    <th className="px-2 py-2 text-right font-semibold">Planeadas</th>
                    <th className="px-2 py-2 text-right font-semibold">Trabalhadas</th>
                    <th className="px-2 py-2 text-right font-semibold">Normais</th>
                    <th className="px-2 py-2 text-right font-semibold">Extra</th>
                    <th className="px-2 py-2 font-semibold">Estado</th>
                    <th className="px-4 py-2 font-semibold">Atenção</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.data.map((s) => (
                    <tr key={s.employeeId} className="cursor-pointer border-b border-line-2 last:border-0 hover:bg-cal" onClick={() => setOpen(s.employeeId)}>
                      <td className="px-4 py-2.5">
                        <button type="button" className="text-left font-semibold text-ink hover:underline" onClick={() => setOpen(s.employeeId)}>
                          {s.employeeName}
                        </button>
                        <span className="block text-xs text-ink-3">{s.teamName ?? 'Sem equipa'}</span>
                      </td>
                      <td className="px-2 text-right tabular text-ink-3">{minutesToHours(s.plannedMin)}</td>
                      <td className="px-2 text-right font-semibold tabular">{minutesToHours(s.workedMin)}</td>
                      <td className="px-2 text-right tabular">{minutesToHours(s.normalMin)}</td>
                      <td className={cn('px-2 text-right tabular', s.overtimeMin > 0 && 'font-semibold text-ambar-ink')}>{minutesToHours(s.overtimeMin)}</td>
                      <td className="px-2">
                        <Badge tone={SHEET_TONE[s.status]}>{SHEET_LABEL[s.status]}</Badge>
                      </td>
                      <td className="px-4 text-xs text-ink-3">
                        {s.openEntries > 0 && (
                          <span className="flex items-center gap-1 text-tijolo">
                            <AlertTriangle className="size-3.5" aria-hidden /> Entrada sem saída
                          </span>
                        )}
                        {s.missingDays > 0 && (
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="size-3.5 text-ambar-ink" aria-hidden /> {s.missingDays} dia(s) planeado(s) sem registo
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <SheetDrawer employeeId={open} week={week} onClose={() => setOpen(null)} />
    </div>
  )
}

/** Presenças de hoje: o encarregado confirma de uma vez quem esteve na obra como planeado. */
function PresenceToday() {
  const org = useActiveOrg()
  const today = todayIso()
  const planned = usePlannedDay(org.id, today)
  const confirm = useConfirmPlanned(org.id)
  const pending = (planned.data ?? []).filter((p) => !p.confirmed)
  const [picked, setPicked] = useState<string[] | null>(null)
  const selected = picked ?? pending.map((p) => p.assignmentId)
  if (planned.isPending || planned.isError || (planned.data ?? []).length === 0) return null
  return (
    <Panel
      title={`Presenças de hoje (${(planned.data ?? []).length - pending.length}/${(planned.data ?? []).length})`}
      description="Confirmar cria o registo com o horário planeado. Quem picou o ponto já está registado."
      actions={
        pending.length > 0 && (
          <Button
            variant="primary"
            size="sm"
            icon={<UserCheck className="size-4" />}
            disabled={selected.length === 0}
            loading={confirm.isPending}
            onClick={() =>
              confirm.mutate(selected, {
                onSuccess: (r) => {
                  toast.success(`${r.created} presença(s) confirmada(s)`, {
                    description: r.skippedAssignmentIds.length ? `${r.skippedAssignmentIds.length} ignorada(s): já registadas ou fora da sua equipa.` : undefined,
                  })
                  setPicked(null)
                },
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            Confirmar presença ({selected.length})
          </Button>
        )
      }
    >
      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {(planned.data ?? []).map((p) => (
          <li key={p.assignmentId} className="flex items-center justify-between gap-2 rounded-sm border border-line-2 px-3 py-2">
            {p.confirmed ? (
              <span className="text-sm">
                <span className="font-semibold">{p.employeeName}</span> · {p.siteCode}
              </span>
            ) : (
              <Checkbox
                label={
                  <span className="text-sm">
                    <span className="font-semibold">{p.employeeName}</span> · {p.siteCode} {hhmm(p.start)}–{hhmm(p.end)}
                  </span>
                }
                checked={selected.includes(p.assignmentId)}
                onChange={(e) => setPicked(e.target.checked ? [...selected, p.assignmentId] : selected.filter((x) => x !== p.assignmentId))}
              />
            )}
            {p.confirmed && <Badge tone="ok" dot>Registado</Badge>}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function SheetDrawer({ employeeId, week, onClose }: { employeeId: string | null; week: string; onClose: () => void }) {
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const sheet = useTimesheet(org.id, employeeId, week)
  const action = useTimesheetAction(org.id)
  const [noteFor, setNoteFor] = useState<'reject' | 'reopen' | null>(null)
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<{ entry?: TimeEntry; date: string } | null>(null)
  const [history, setHistory] = useState<string | null>(null)
  const d = sheet.data
  const s = d?.summary
  const locked = s?.status === 'APPROVED'

  const run = (kind: 'submit' | 'approve' | 'reject' | 'reopen', text?: string) =>
    s &&
    action.mutate(
      { employeeId: s.employeeId, week, action: kind, note: text, version: s.version },
      {
        onSuccess: () => {
          toast.success({ submit: 'Folha submetida', approve: 'Folha aprovada', reject: 'Folha devolvida', reopen: 'Semana reaberta' }[kind])
          setNoteFor(null)
          setNote('')
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )

  return (
    <Drawer
      open={!!employeeId}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      eyebrow={`Semana de ${formatDate(week)}`}
      title={s?.employeeName ?? 'Folha de horas'}
      description={s && `${minutesToHours(s.workedMin)} trabalhadas · ${minutesToHours(s.normalMin)} normais · ${minutesToHours(s.overtimeMin)} extra`}
      footer={
        s && (
          <div className="flex flex-wrap justify-end gap-2">
            {(s.status === 'DRAFT' || s.status === 'REJECTED') && (
              <Button variant={manager ? 'secondary' : 'primary'} loading={action.isPending} onClick={() => run('submit')}>
                Submeter
              </Button>
            )}
            {manager && s.status === 'SUBMITTED' && (
              <Button variant="ghost" icon={<XCircle className="size-4" />} onClick={() => setNoteFor('reject')}>
                Devolver
              </Button>
            )}
            {manager && (s.status === 'DRAFT' || s.status === 'SUBMITTED') && (
              <Button variant="primary" icon={<CheckCheck className="size-4" />} loading={action.isPending} disabled={s.openEntries > 0} onClick={() => run('approve')}>
                Aprovar
              </Button>
            )}
            {manager && locked && (
              <Button variant="secondary" onClick={() => setNoteFor('reopen')}>
                Reabrir semana
              </Button>
            )}
          </div>
        )
      }
    >
      {sheet.isPending ? (
        <SkeletonRows rows={6} />
      ) : sheet.isError ? (
        <ErrorState>{errorMessage(sheet.error)}</ErrorState>
      ) : (
        d && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={SHEET_TONE[d.summary.status]}>{SHEET_LABEL[d.summary.status]}</Badge>
              {d.decidedBy && <span className="text-xs text-ink-3">por {d.decidedBy}</span>}
              {d.decisionNote && <span className="text-sm text-ink-2">“{d.decisionNote}”</span>}
            </div>
            {locked && <p className="text-sm text-ink-3">Semana aprovada: os registos estão fechados. Para corrigir, reabra a semana.</p>}
            <ul className="flex flex-col divide-y divide-line-2 rounded-md border border-line-2">
              {d.days.map((day) => (
                <li key={day.date} className={cn('px-3 py-2.5', day.restDay && 'bg-line-2/45')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold capitalize text-ink">
                      {dayName(day.date)} {day.restDay && <span className="font-normal text-ink-3">· descanso</span>}
                    </span>
                    <span className="flex items-center gap-3 text-xs text-ink-3 tabular">
                      {day.plannedMin > 0 && <span>Plan. {minutesToHours(day.plannedMin)}</span>}
                      <span className="font-semibold text-ink">{minutesToHours(day.workedMin)}</span>
                      {day.overtimeMin > 0 && <span className="text-ambar-ink">+{minutesToHours(day.overtimeMin)} extra</span>}
                      {!locked && day.date <= todayIso() && (
                        <IconButton label={`Registo manual em ${formatDate(day.date)}`} size="sm" onClick={() => setEditing({ date: day.date })}>
                          <Plus className="size-4" />
                        </IconButton>
                      )}
                    </span>
                  </div>
                  {day.entries.length > 0 && (
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {day.entries.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-2 rounded-sm bg-surface px-2 py-1 text-sm">
                          <span className="tabular">
                            <span className="font-mono text-xs font-semibold">{e.siteCode}</span> {hhmm(e.startLocal)}–{e.endLocal ? hhmm(e.endLocal) : '…'}
                            {e.breakMin > 0 && <span className="text-ink-2"> · pausa {e.breakMin} min</span>}
                            <span className="text-ink-2"> · {SOURCE_LABEL[e.source]}</span>
                            {e.status === 'OPEN' && <Badge tone="danger" className="ml-1">Sem saída</Badge>}
                          </span>
                          <span className="flex items-center gap-1">
                            {e.revisions > 0 && (
                              <IconButton label="Ver histórico de correções" size="sm" onClick={() => setHistory(e.id)}>
                                <History className="size-4" />
                              </IconButton>
                            )}
                            {!locked && (
                              <IconButton label={`Corrigir registo de ${formatDate(e.workDate)}`} size="sm" onClick={() => setEditing({ entry: e, date: e.workDate })}>
                                <Pencil className="size-4" />
                              </IconButton>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      )}
      <Dialog
        open={!!noteFor}
        onOpenChange={(o) => !o && setNoteFor(null)}
        title={noteFor === 'reject' ? 'Devolver para correção' : 'Reabrir semana aprovada'}
        description={noteFor === 'reopen' ? 'A reabertura fica no histórico de auditoria com o motivo.' : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNoteFor(null)}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={note.trim().length < 3} loading={action.isPending} onClick={() => noteFor && run(noteFor, note.trim())}>
              {noteFor === 'reject' ? 'Devolver' : 'Reabrir'}
            </Button>
          </div>
        }
      >
        <Field label={noteFor === 'reject' ? 'O que há a corrigir' : 'Motivo'}>{(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </Dialog>
      {editing && s && <EntryDialog key={editing.entry?.id ?? editing.date} employeeId={s.employeeId} entry={editing.entry} date={editing.date} onClose={() => setEditing(null)} />}
      <RevisionsDialog entryId={history} onClose={() => setHistory(null)} />
    </Drawer>
  )
}

function EntryDialog({ employeeId, entry, date, onClose }: { employeeId: string; entry?: TimeEntry; date: string; onClose: () => void }) {
  const org = useActiveOrg()
  const save = useSaveEntry(org.id)
  const sites = useSites(org.id, {})
  const [siteId, setSiteId] = useState(entry?.siteId ?? '')
  const [start, setStart] = useState(entry ? hhmm(entry.startLocal) : '08:00')
  const [end, setEnd] = useState(entry?.endLocal ? hhmm(entry.endLocal) : '17:00')
  const [pause, setPause] = useState(entry ? String(entry.breakMin) : '')
  const [reason, setReason] = useState('')
  const ok = !!siteId && reason.trim().length >= 3
  const done = (message: string) => {
    toast.success(message)
    onClose()
  }
  const fail = (e: unknown) => toast.error(isApiError(e, 'timesheet-locked') ? e.message : errorMessage(e))
  const breakMin = pause === '' ? null : Number(pause)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={entry ? `Corrigir registo de ${formatDate(date)}` : `Registo manual em ${formatDate(date)}`}
      description="O original fica guardado no histórico com o motivo."
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          {entry ? (
            <Button
              variant="danger"
              disabled={reason.trim().length < 3}
              loading={save.isPending}
              onClick={() => save.mutate({ mode: 'cancel', id: entry.id, reason: reason.trim(), version: entry.version }, { onSuccess: () => done('Registo anulado'), onError: fail })}
            >
              Anular registo
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={!ok}
              loading={save.isPending}
              onClick={() =>
                entry
                  ? save.mutate({ mode: 'correct', id: entry.id, siteId, date, start, end, breakMin, reason: reason.trim(), version: entry.version }, { onSuccess: () => done('Registo corrigido'), onError: fail })
                  : save.mutate({ mode: 'create', employeeId, siteId, date, start, end, breakMin, reason: reason.trim() }, { onSuccess: () => done('Registo criado'), onError: fail })
              }
            >
              Guardar
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Obra" className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Escolha a obra…</option>
              {(sites.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Entrada">{(p) => <Input {...p} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Saída" hint={end <= start ? 'No dia seguinte.' : undefined}>{(p) => <Input {...p} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        <Field label="Pausa (min)" optional hint="Vazio: a pausa da política laboral.">
          {(p) => <Input {...p} type="number" min={0} value={pause} onChange={(e) => setPause(e.target.value)} />}
        </Field>
        <Field label="Motivo" className="sm:col-span-2">{(p) => <Input {...p} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: esqueceu-se de picar a saída" />}</Field>
      </div>
    </Dialog>
  )
}

function RevisionsDialog({ entryId, onClose }: { entryId: string | null; onClose: () => void }) {
  const org = useActiveOrg()
  const revisions = useRevisions(org.id, entryId)
  const rows = useMemo(
    () =>
      (revisions.data ?? []).map((r) => {
        const parse = (json: string | null) => (json ? (JSON.parse(json) as TimeEntry) : null)
        return { ...r, b: parse(r.before), a: parse(r.after) }
      }),
    [revisions.data],
  )
  const span = (e: TimeEntry | null) => (e ? `${e.siteCode} ${hhmm(e.startLocal)}–${e.endLocal ? hhmm(e.endLocal) : '…'} (${minutesToHours(e.workedMin)})` : '—')
  return (
    <Dialog open={!!entryId} onOpenChange={(o) => !o && onClose()} title="Histórico do registo">
      {revisions.isPending ? (
        <SkeletonRows rows={3} />
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-sm border border-line-2 p-2.5 text-sm">
              <p className="font-semibold text-ink">{r.reason}</p>
              <p className="text-ink-3">
                {r.b ? `${span(r.b)} → ${span(r.a)}` : `Criado: ${span(r.a)}`}
                {r.a?.status === 'CANCELLED' && ' · anulado'}
              </p>
              <p className="text-xs text-ink-3">
                {r.userName} · {new Date(r.createdAt).toLocaleString('pt-PT')}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  )
}

