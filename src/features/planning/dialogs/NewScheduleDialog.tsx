import { ArrowLeft, ArrowRight, CalendarCheck2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { availability, buildIndex, type AvailabilityState } from '@/domain/availability'
import { formatHours, timeRangeHours } from '@/domain/hours'
import type { ID, ISODate } from '@/domain/types'
import { addDays, dayShort, isoWeek, isWeekend, weekDays, weekLabel, weekStart } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { demoStore, useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { ChipToggle, Field, Input, Select, Textarea } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'
import { ConflictCard } from '../../shared/ConflictCard'
import { plural } from '@/lib/plural'

const STEPS = ['Semana e equipa', 'Trabalhadores', 'Obra e horário', 'Verificar'] as const

const DOT: Record<AvailabilityState, string> = {
  livre: 'bg-ok',
  parcial: 'bg-ambar',
  atribuido: 'bg-pinho',
  ausente: 'bg-tijolo',
  inativo: 'bg-ink-4',
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initialWeek: ISODate
  onCreated: (week: ISODate, ids: ID[]) => void
}

/** Fluxo 2 — semana → equipa → trabalhadores → obra, dias e horário → conflitos → guardar. */
export function NewScheduleDialog({ open, onOpenChange, initialWeek, onCreated }: Props) {
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const settings = useDemo((s) => s.session.settings)
  const preview = useDemo((s) => s.previewSchedule)
  const create = useDemo((s) => s.createSchedule)
  const undo = useDemo((s) => s.undo)

  const [step, setStep] = useState(0)
  const [week, setWeek] = useState(initialWeek < weekStart(today) ? weekStart(today) : initialWeek)
  const [teamId, setTeamId] = useState<ID | ''>('')
  const [workers, setWorkers] = useState<ID[]>([])
  const [siteId, setSiteId] = useState<ID>('')
  const [dates, setDates] = useState<ISODate[]>([])
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('17:00')
  const [vehicleId, setVehicleId] = useState<ID | ''>('')
  const [foremanId, setForemanId] = useState<ID | ''>('')
  const [note, setNote] = useState('')
  const [extra, setExtra] = useState<ID>('')

  const days = weekDays(week)
  const idx = buildIndex(db)
  const team = teamId ? db.teams[teamId] : undefined

  const chooseTeam = (id: ID | '') => {
    setTeamId(id)
    const t = id ? db.teams[id] : undefined
    setWorkers(t ? t.memberIds.filter((m) => db.workers[m]?.status === 'ativo') : [])
    setSiteId(t?.siteId ?? '')
    setVehicleId(t?.vehicleId ?? '')
    setForemanId(t?.foremanId ?? '')
    setDates(days.filter((d) => !isWeekend(d) && d >= today))
  }

  const input = {
    teamId: teamId || null,
    siteId,
    workerIds: workers,
    dates,
    start,
    end,
    vehicleId: vehicleId || null,
    foremanId: foremanId || null,
    note,
  }
  const hours = timeRangeHours(start, end, settings.defaultBreak)
  const canNext = [!!week, workers.length > 0, !!siteId && dates.length > 0 && hours > 0, true][step]!
  const conflicts = useMemo(() => (step === 3 ? preview(input) : []), [step, db]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const res = create(input)
    const ids = Object.values(demoStore.getState().db.assignments).filter((a) => a.batchId === res.batchId).map((a) => a.id)
    toast.success('Escala guardada', {
      description: `${res.created} atribuições em ${db.sites[siteId]?.code} · semana ${isoWeek(week)}`,
      action: { label: 'Anular', onClick: () => undo() },
    })
    onCreated(week, ids)
    onOpenChange(false)
  }

  const weeks = [0, 1, 2, 3].map((i) => addDays(weekStart(today), i * 7))
  const outsiders = Object.values(db.workers)
    .filter((w) => w.status === 'ativo' && !workers.includes(w.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      eyebrow={`Nova escala · passo ${step + 1} de 4`}
      title={STEPS[step]}
      footer={
        <>
          {step > 0 && (
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(step - 1)} className="mr-auto">
              Voltar
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {step < 3 ? (
            <Button variant="primary" disabled={!canNext} iconRight={<ArrowRight className="size-4" />} onClick={() => setStep(step + 1)}>
              Continuar
            </Button>
          ) : (
            <Button variant="primary" icon={<CalendarCheck2 className="size-4" />} onClick={save} data-tour="save-schedule">
              {conflicts.length ? `Guardar com ${plural(conflicts.length, 'conflito', 'conflitos')}` : 'Guardar escala'}
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-4 grid grid-cols-4 gap-1" aria-label="Passos">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className="flex flex-col gap-1">
            <span className={cn('h-1 rounded-full', i <= step ? 'bg-pinho' : 'bg-line-2')} />
            <span className={cn('hidden text-[11px] sm:block', i === step ? 'font-semibold text-ink' : 'text-ink-3')}>{s}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Semana</legend>
            <div className="flex flex-wrap gap-1.5">
              {weeks.map((w) => (
                <ChipToggle key={w} pressed={w === week} onClick={() => { setWeek(w); if (teamId) setDates(weekDays(w).filter((d) => !isWeekend(d))) }}>
                  Semana {isoWeek(w)} · {weekLabel(w)}
                </ChipToggle>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Equipa</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {Object.values(db.teams)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((t) => (
                  <label
                    key={t.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2',
                      teamId === t.id ? 'border-pinho bg-lima-soft/50' : 'border-line hover:border-ink-4',
                    )}
                  >
                    <input type="radio" name="team" className="accent-pinho" checked={teamId === t.id} onChange={() => chooseTeam(t.id)} />
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: t.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{t.name}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {t.memberIds.length} elementos · {db.sites[t.siteId ?? '']?.code ?? 'sem obra'}
                      </span>
                    </span>
                  </label>
                ))}
              <label className={cn('flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2', teamId === '' && workers.length === 0 ? 'border-line' : 'border-line')}>
                <input type="radio" name="team" className="accent-pinho" checked={teamId === ''} onChange={() => chooseTeam('')} />
                <span className="text-sm">Sem equipa (escolher pessoas)</span>
              </label>
            </div>
          </fieldset>
        </div>
      )}

      {step === 1 && (
        <div>
          <p className="mb-2 text-sm text-ink-3">Disponibilidade na semana {isoWeek(week)}: cada ponto é um dia (segunda a domingo).</p>
          <ul className="flex flex-col divide-y divide-line-2 rounded-md border border-line">
            {[...new Set([...(team?.memberIds ?? []), ...workers])].map((id) => {
              const w = db.workers[id]
              if (!w) return null
              const on = workers.includes(id)
              return (
                <li key={id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-cal">
                    <input
                      type="checkbox"
                      className="size-4 accent-pinho"
                      checked={on}
                      onChange={() => setWorkers((x) => (on ? x.filter((y) => y !== id) : [...x, id]))}
                    />
                    <Avatar name={w.name} photo={w.photo} size="xs" color={team?.color} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{w.name}</span>
                      <span className="block text-xs text-ink-3">{w.category}</span>
                    </span>
                    <span className="flex gap-1" aria-label="Disponibilidade por dia">
                      {days.map((d) => {
                        const st = availability(w, d, idx).state
                        return <span key={d} title={`${dayShort(d)}: ${st}`} className={cn('size-2 rounded-full', DOT[st])} />
                      })}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex items-end gap-2">
            <Field label="Juntar alguém de fora da equipa" className="flex-1">
              {(p) => (
                <Select {...p} value={extra} onChange={(e) => setExtra(e.target.value)}>
                  <option value="">Escolher…</option>
                  {outsiders.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} · {w.category}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button
              disabled={!extra}
              onClick={() => {
                setWorkers((x) => [...x, extra])
                setExtra('')
              }}
            >
              Juntar
            </Button>
          </div>
          <ul className="mt-2 flex gap-3 text-[11px] text-ink-3">
            {(['livre', 'parcial', 'atribuido', 'ausente'] as const).map((s) => (
              <li key={s} className="flex items-center gap-1">
                <span aria-hidden className={cn('size-2 rounded-full', DOT[s])} /> {s === 'atribuido' ? 'atribuído' : s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Obra" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">Escolher obra…</option>
                {Object.values(db.sites)
                  .filter((s) => s.status !== 'concluida')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name} ({s.city})
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">Dias</legend>
            <div className="flex flex-wrap gap-1.5">
              {days.map((d) => (
                <ChipToggle
                  key={d}
                  pressed={dates.includes(d)}
                  disabled={d < today}
                  onClick={() => setDates((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()))}
                >
                  {dayShort(d)} {d.slice(8)}
                </ChipToggle>
              ))}
            </div>
          </fieldset>
          <Field label="Entrada">{(p) => <Input {...p} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label="Saída" hint={hours > 0 ? `${formatHours(hours)} por dia` : undefined} error={hours <= 0 ? 'A saída tem de ser depois da entrada.' : null}>
            {(p) => <Input {...p} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}
          </Field>
          <Field label="Viatura">
            {(p) => (
              <Select {...p} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">Sem viatura</option>
                {Object.values(db.vehicles).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} · {v.seats} lugares{v.status !== 'operacional' ? ' · indisponível' : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Responsável no terreno">
            {(p) => (
              <Select {...p} value={foremanId} onChange={(e) => setForemanId(e.target.value)}>
                <option value="">Nenhum</option>
                {workers.map((id) => (
                  <option key={id} value={id}>
                    {db.workers[id]?.name} · {db.workers[id]?.category}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Trabalho a executar" optional className="sm:col-span-2">
            {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: betonagem da laje do piso 3" />}
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 rounded-md bg-cal p-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-ink-3">Obra</dt>
              <dd className="font-semibold">{db.sites[siteId]?.code}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Pessoas</dt>
              <dd className="font-semibold">{workers.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Dias</dt>
              <dd className="font-semibold">{dates.map((d) => dayShort(d)).join(', ')}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Horas planeadas</dt>
              <dd className="font-semibold">{formatHours(hours * dates.length * workers.length)}</dd>
            </div>
          </dl>
          {conflicts.length === 0 ? (
            <p className="rounded-md border border-ok/30 bg-ok-soft px-3 py-2.5 text-sm font-medium text-ok">Sem conflitos. Pode guardar.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">
                {plural(conflicts.length, 'conflito encontrado', 'conflitos encontrados')}
              </p>
              {conflicts.map((c) => (
                <ConflictCard key={c.id} conflict={c} preview />
              ))}
              <p className="text-xs text-ink-3">Pode voltar atrás e ajustar, ou guardar e resolver no painel de conflitos.</p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
