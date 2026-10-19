import { CalendarPlus, Check, ChevronLeft, ChevronRight, Palmtree, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { errorMessage } from '../../api/http'
import {
  ABSENCE_KIND_LABEL,
  ABSENCE_STATUS_LABEL,
  ABSENCE_STATUS_TONE,
  useAbsenceAction,
  useAbsenceImpact,
  useAbsences,
  type Absence,
  type AbsenceKind,
  type AbsenceStatus,
} from '../../api/operations'
import { hhmm } from '../../api/planning'
import { atLeast } from '../../api/types'
import { formatDate, todayIso, useEmployeeOptions, useSites } from '../../api/workforce'
import { useActiveOrg } from '../../session'

const MONTH = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function monthRange(anchor: string): [string, string] {
  const [y, m] = anchor.split('-').map(Number) as [number, number]
  const first = new Date(Date.UTC(y, m - 1, 1))
  const last = new Date(Date.UTC(y, m, 0))
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)]
}

function shiftMonth(anchor: string, delta: number): string {
  const [y, m] = anchor.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10)
}

const period = (a: Absence) =>
  a.startsOn === a.endsOn ? formatDate(a.startsOn) + (a.partialMinutes ? ` (${a.partialMinutes} min)` : '') : `${formatDate(a.startsOn)} – ${formatDate(a.endsOn)}`

/** Ausências da empresa: pedidos por decidir, com o impacto no planeamento, e o registo do mês. */
export function AbsencesPage() {
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const [anchor, setAnchor] = useState(() => todayIso().slice(0, 8) + '01')
  const [from, to] = monthRange(anchor)
  const [status, setStatus] = useState<AbsenceStatus | ''>('')
  const absences = useAbsences(org.id, from, to, status)
  const pending = useAbsences(org.id, todayIso(), shiftMonth(todayIso(), 12), 'REQUESTED')
  const [creating, setCreating] = useState(false)
  const [deciding, setDeciding] = useState<{ absence: Absence; mode: 'approve' | 'reject' } | null>(null)

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title="Ausências"
        description="Pedidos dos trabalhadores e registo de férias, baixas e formações. Aprovar mostra o trabalho planeado afetado."
        actions={
          manager && (
            <Button variant="primary" icon={<CalendarPlus className="size-4" />} onClick={() => setCreating(true)}>
              Registar ausência
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-4">
        {(pending.data ?? []).length > 0 && (
          <Panel title={`Por decidir (${pending.data!.length})`}>
            <ul className="flex flex-col divide-y divide-line-2">
              {pending.data!.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm">
                    <span className="font-semibold text-ink">{a.employeeName}</span> · {ABSENCE_KIND_LABEL[a.kind]} · {period(a)}
                    {a.note && <span className="text-ink-3"> · “{a.note}”</span>}
                  </span>
                  {manager && (
                    <span className="flex gap-2">
                      <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setDeciding({ absence: a, mode: 'reject' })}>
                        Recusar
                      </Button>
                      <Button size="sm" variant="primary" icon={<Check className="size-4" />} onClick={() => setDeciding({ absence: a, mode: 'approve' })}>
                        Aprovar
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel
          flush
          title={
            <span className="flex items-center gap-1">
              <IconButton label="Mês anterior" size="sm" onClick={() => setAnchor(shiftMonth(anchor, -1))}>
                <ChevronLeft className="size-4" />
              </IconButton>
              <span className="min-w-36 text-center capitalize">{MONTH.format(new Date(`${from}T00:00:00Z`))}</span>
              <IconButton label="Mês seguinte" size="sm" onClick={() => setAnchor(shiftMonth(anchor, 1))}>
                <ChevronRight className="size-4" />
              </IconButton>
            </span>
          }
          actions={
            <Select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as AbsenceStatus | '')} className="h-8 max-w-[170px]">
              <option value="">Todos os estados</option>
              {(Object.keys(ABSENCE_STATUS_LABEL) as AbsenceStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ABSENCE_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          }
        >
          {absences.isPending ? (
            <SkeletonRows rows={5} />
          ) : absences.isError ? (
            <ErrorState onRetry={() => void absences.refetch()}>{errorMessage(absences.error)}</ErrorState>
          ) : absences.data.length === 0 ? (
            <EmptyState icon={<Palmtree />} title="Sem ausências neste mês" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-3">
                    <th className="px-4 py-2 font-semibold">Trabalhador</th>
                    <th className="px-2 py-2 font-semibold">Tipo</th>
                    <th className="px-2 py-2 font-semibold">Período</th>
                    <th className="px-2 py-2 text-right font-semibold">Dias</th>
                    <th className="px-2 py-2 font-semibold">Estado</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {absences.data.map((a) => (
                    <tr key={a.id} className="border-b border-line-2 last:border-0">
                      <td className="px-4 py-2.5 font-semibold text-ink">{a.employeeName}</td>
                      <td className="px-2">{ABSENCE_KIND_LABEL[a.kind]}</td>
                      <td className="px-2 tabular">{period(a)}</td>
                      <td className="px-2 text-right tabular">{a.days}</td>
                      <td className="px-2">
                        <Badge tone={ABSENCE_STATUS_TONE[a.status]}>{ABSENCE_STATUS_LABEL[a.status]}</Badge>
                        {a.decisionNote && <span className="ml-1 text-xs text-ink-3">“{a.decisionNote}”</span>}
                      </td>
                      <td className="px-4 text-right">{manager && (a.status === 'REQUESTED' || a.status === 'APPROVED') && <CancelButton absence={a} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      {creating && <RequestAbsenceDialog onClose={() => setCreating(false)} onBehalf />}
      {deciding && <DecisionDialog key={deciding.absence.id} {...deciding} onClose={() => setDeciding(null)} />}
    </div>
  )
}

function CancelButton({ absence }: { absence: Absence }) {
  const org = useActiveOrg()
  const action = useAbsenceAction(org.id)
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={action.isPending}
      onClick={() =>
        action.mutate(
          { action: 'cancel', id: absence.id, version: absence.version },
          { onSuccess: () => toast.success('Ausência cancelada'), onError: (e) => toast.error(errorMessage(e)) },
        )
      }
    >
      Cancelar
    </Button>
  )
}

function DecisionDialog({ absence, mode, onClose }: { absence: Absence; mode: 'approve' | 'reject'; onClose: () => void }) {
  const org = useActiveOrg()
  const impact = useAbsenceImpact(org.id, mode === 'approve' ? absence.id : null)
  const sites = useSites(org.id, {}, mode === 'approve')
  const action = useAbsenceAction(org.id)
  const [resolution, setResolution] = useState<'REMOVE' | 'KEEP'>('REMOVE')
  const [note, setNote] = useState('')
  const affected = impact.data?.assignments ?? []
  const siteCode = (id: string) => sites.data?.find((s) => s.id === id)?.code ?? 'Obra'
  const submit = () =>
    action.mutate(
      mode === 'approve'
        ? { action: 'approve', id: absence.id, resolution: affected.length ? resolution : undefined, version: absence.version }
        : { action: 'reject', id: absence.id, note: note.trim(), version: absence.version },
      {
        onSuccess: () => {
          toast.success(mode === 'approve' ? 'Ausência aprovada' : 'Ausência recusada', {
            description: mode === 'approve' && affected.length ? (resolution === 'REMOVE' ? `${affected.length} atribuição(ões) retirada(s) do planeamento.` : 'As atribuições ficam como conflito no planeamento.') : undefined,
          })
          onClose()
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={mode === 'approve' ? `Aprovar ausência de ${absence.employeeName}` : `Recusar ausência de ${absence.employeeName}`}
      description={`${ABSENCE_KIND_LABEL[absence.kind]} · ${period(absence)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button variant={mode === 'approve' ? 'primary' : 'danger'} loading={action.isPending} disabled={(mode === 'reject' && note.trim().length < 3) || (mode === 'approve' && impact.isPending)} onClick={submit}>
            {mode === 'approve' ? 'Aprovar' : 'Recusar'}
          </Button>
        </div>
      }
    >
      {mode === 'reject' ? (
        <Field label="Motivo">{(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      ) : impact.isPending ? (
        <SkeletonRows rows={2} />
      ) : affected.length === 0 ? (
        <p className="text-sm text-ink-3">Sem trabalho planeado nesses dias.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink">Há {affected.length} atribuição(ões) planeada(s) nesses dias:</p>
          <ul className="flex flex-col gap-1 text-sm">
            {affected.map((a) => (
              <li key={a.assignmentId} className="rounded-sm bg-line-2/45 px-2 py-1 tabular">
                {formatDate(a.date)} · {siteCode(a.siteId)} {hhmm(a.start)}–{hhmm(a.end)}
              </li>
            ))}
          </ul>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-ink">O que fazer a essas atribuições?</legend>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="resolution" checked={resolution === 'REMOVE'} onChange={() => setResolution('REMOVE')} className="mt-1 accent-pinho" />
              <span>
                <span className="font-semibold">Retirar do planeamento</span>
                <span className="block text-ink-3">Fica uma alteração no planeamento que pode ser anulada.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="resolution" checked={resolution === 'KEEP'} onChange={() => setResolution('KEEP')} className="mt-1 accent-pinho" />
              <span>
                <span className="font-semibold">Manter e resolver depois</span>
                <span className="block text-ink-3">Aparecem como conflito no quadro de planeamento.</span>
              </span>
            </label>
          </fieldset>
        </div>
      )}
    </Dialog>
  )
}

/** Pedido de ausência: pelo próprio (app do trabalhador) ou registado pelo escritório em nome de alguém. */
export function RequestAbsenceDialog({ onClose, onBehalf = false }: { onClose: () => void; onBehalf?: boolean }) {
  const org = useActiveOrg()
  const employees = useEmployeeOptions(org.id, onBehalf)
  const action = useAbsenceAction(org.id)
  const [employeeId, setEmployeeId] = useState('')
  const [kind, setKind] = useState<AbsenceKind>('VACATION')
  const [startsOn, setStartsOn] = useState(todayIso())
  const [endsOn, setEndsOn] = useState(todayIso())
  const [partial, setPartial] = useState('')
  const [note, setNote] = useState('')
  const valid = endsOn >= startsOn && (!onBehalf || !!employeeId) && (partial === '' || startsOn === endsOn)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={onBehalf ? 'Registar ausência' : 'Pedir ausência'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            loading={action.isPending}
            onClick={() =>
              action.mutate(
                { action: 'request', employeeId: onBehalf ? employeeId : undefined, kind, startsOn, endsOn, partialMinutes: partial === '' ? null : Number(partial), note: note.trim() || undefined },
                { onSuccess: () => (toast.success(onBehalf ? 'Ausência registada' : 'Pedido enviado'), onClose()), onError: (e) => toast.error(errorMessage(e)) },
              )
            }
          >
            {onBehalf ? 'Registar' : 'Enviar pedido'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {onBehalf && (
          <Field label="Trabalhador" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Escolha…</option>
                {(employees.data?.items ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Tipo" className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as AbsenceKind)}>
              {(Object.keys(ABSENCE_KIND_LABEL) as AbsenceKind[]).map((k) => (
                <option key={k} value={k}>
                  {ABSENCE_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="De">{(p) => <Input {...p} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />}</Field>
        <Field label="Até">{(p) => <Input {...p} type="date" min={startsOn} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />}</Field>
        <Field label="Só parte do dia (minutos)" optional hint="Para um só dia, ex.: consulta de 120 min.">
          {(p) => <Input {...p} type="number" min={15} max={600} value={partial} onChange={(e) => setPartial(e.target.value)} />}
        </Field>
        <Field label="Observação" optional className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}
