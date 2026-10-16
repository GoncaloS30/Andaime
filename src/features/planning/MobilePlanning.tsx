import { AlertOctagon, ChevronLeft, ChevronRight, Plus, Truck, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { availability } from '@/domain/availability'
import { buildIndex, key } from '@/domain/indexes'
import type { Assignment, ID, ISODate } from '@/domain/types'
import { addDays, dateLong, dayShort, isoWeek, weekDays, weekLabel } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { selectConflicts } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { SiteCode } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { Drawer } from '@/ui/Overlay'
import { ConflictCard } from '../shared/ConflictCard'
import { TransferDialog } from '../shared/TransferDialog'
import { conflictIndex } from './model'
import { NewScheduleDialog } from './dialogs/NewScheduleDialog'
import { usePlanningParams } from './usePlanningParams'

/** Planeamento no telemóvel: um dia de cada vez, agrupado por obra. Sem arrastar. */
export function MobilePlanning() {
  const { week, update, newSchedule } = usePlanningParams()
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const days = weekDays(week)
  const [day, setDay] = useState<ISODate>(days.includes(today) ? today : days[0]!)
  const activeDay = days.includes(day) ? day : days[0]!
  const conflicts = useDerived((s) => selectConflicts(s, { from: week, to: addDays(week, 6) }), [week])
  const byAssignment = useMemo(() => conflictIndex(conflicts), [conflicts])
  const dayConflicts = conflicts.filter((c) => c.date === activeDay || (c.date === null && activeDay === days[0]))
  const [sheet, setSheet] = useState<{ kind: 'a'; id: ID } | { kind: 'add'; siteId: ID } | { kind: 'conflicts' } | null>(null)
  const idx = buildIndex(db)

  const sites = Object.values(db.sites)
    .map((s) => ({ s, list: (idx.bySiteDate.get(key(s.id, activeDay)) ?? []).slice().sort((a, b) => Number(b.isForeman) - Number(a.isForeman)) }))
    .filter((x) => x.list.length > 0 || x.s.status === 'em_curso')
    .sort((a, b) => b.list.length - a.list.length || a.s.code.localeCompare(b.s.code))

  return (
    <div className="-mx-4 -mt-5">
      <div className="sticky top-14 z-20 border-b border-line bg-cal/95 px-4 pt-3 pb-2 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-expanded text-lg font-semibold">Planeamento</h1>
            <p className="text-xs text-ink-3">
              Semana {isoWeek(week)} · {weekLabel(week)}
            </p>
          </div>
          <div className="flex">
            <IconButton label="Semana anterior" onClick={() => update({ semana: addDays(week, -7) })}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <IconButton label="Semana seguinte" onClick={() => update({ semana: addDays(week, 7) })}>
              <ChevronRight className="size-5" />
            </IconButton>
          </div>
        </div>
        <div role="tablist" aria-label="Dia" className="mt-2 grid grid-cols-7 gap-1">
          {days.map((d) => {
            const has = conflicts.some((c) => c.date === d)
            return (
              <button
                key={d}
                role="tab"
                type="button"
                aria-selected={d === activeDay}
                onClick={() => setDay(d)}
                className={cn(
                  'relative flex flex-col items-center rounded-md py-1.5',
                  d === activeDay ? 'bg-pinho text-white' : d === today ? 'bg-lima text-pinho' : 'text-ink-2',
                )}
              >
                <span className="text-[10px] font-semibold uppercase">{dayShort(d)}</span>
                <span className="font-expanded text-base font-semibold tabular">{d.slice(8)}</span>
                {has && <span aria-label="com conflitos" className="absolute top-1 right-1.5 size-1.5 rounded-full bg-tijolo" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3">
        <p className="text-sm font-medium text-ink-2 first-letter:uppercase">{dateLong(activeDay)}</p>
        {dayConflicts.length > 0 && (
          <button
            type="button"
            onClick={() => setSheet({ kind: 'conflicts' })}
            className="flex items-center gap-2 rounded-md border border-tijolo/30 bg-tijolo-soft px-3 py-2.5 text-left text-sm font-medium text-tijolo-ink"
          >
            <AlertOctagon className="size-4" aria-hidden />
            <span className="flex-1">
              {dayConflicts.length} {dayConflicts.length === 1 ? 'conflito' : 'conflitos'} neste dia
            </span>
            <ChevronRight className="size-4" aria-hidden />
          </button>
        )}
        {sites.map(({ s, list }) => (
          <section key={s.id} className="rounded-lg border border-line bg-surface" aria-label={`${s.code} ${s.name}`}>
            <header className="flex items-center gap-2 border-b border-line-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <SiteCode code={s.code} color={s.color} />
                <p className="truncate text-sm font-semibold">{s.name}</p>
              </div>
              <span className="text-xs text-ink-3 tabular">{list.length} pessoas</span>
              <IconButton label={`Atribuir a ${s.code}`} variant="secondary" onClick={() => setSheet({ kind: 'add', siteId: s.id })}>
                <UserPlus className="size-4" />
              </IconButton>
            </header>
            {list.length === 0 ? (
              <p className="px-3 py-3 text-sm text-ink-3">Ninguém escalado neste dia.</p>
            ) : (
              <ul className="divide-y divide-line-2">
                {list.map((a) => (
                  <MobileRow key={a.id} a={a} conflict={!!byAssignment.get(a.id)} onOpen={() => setSheet({ kind: 'a', id: a.id })} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={() => update({ nova: 'escala' })}
        className="fixed right-4 bottom-20 z-20 flex h-12 items-center gap-2 rounded-full bg-pinho px-5 font-semibold text-white shadow-e2"
      >
        <Plus className="size-5" aria-hidden /> Nova escala
      </button>

      {sheet?.kind === 'conflicts' && (
        <Drawer open onOpenChange={() => setSheet(null)} title={`Conflitos · ${dayShort(activeDay)} ${activeDay.slice(8)}`}>
          <div className="flex flex-col gap-2">
            {dayConflicts.map((c) => (
              <ConflictCard key={c.id} conflict={c} />
            ))}
          </div>
        </Drawer>
      )}
      {sheet?.kind === 'a' && <AssignmentSheet id={sheet.id} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'add' && <AddSheet siteId={sheet.siteId} date={activeDay} onClose={() => setSheet(null)} />}
      {newSchedule && <NewScheduleDialog open onOpenChange={(o) => !o && update({ nova: null })} initialWeek={week} onCreated={(w) => update({ semana: w, nova: null })} />}
    </div>
  )
}

function MobileRow({ a, conflict, onOpen }: { a: Assignment; conflict: boolean; onOpen: () => void }) {
  const db = useDemo((s) => s.db)
  const w = db.workers[a.workerId]
  const v = a.vehicleId ? db.vehicles[a.vehicleId] : undefined
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-cal">
        <Avatar name={w?.name ?? '?'} size="sm" color={db.teams[w?.teamId ?? '']?.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {w?.name}
            {a.isForeman && <span className="ml-1 text-xs text-ambar-ink">· responsável</span>}
          </span>
          <span className="flex items-center gap-2 text-xs text-ink-3">
            {a.start}–{a.end}
            {v && (
              <span className="flex items-center gap-1">
                <Truck className="size-3" aria-hidden /> {v.plate}
              </span>
            )}
          </span>
        </span>
        {conflict && <AlertOctagon className="size-4 text-tijolo" aria-label="Com conflito" />}
        <ChevronRight className="size-4 text-ink-4" aria-hidden />
      </button>
    </li>
  )
}

function AssignmentSheet({ id, onClose }: { id: ID; onClose: () => void }) {
  const db = useDemo((s) => s.db)
  const move = useDemo((s) => s.moveAssignment)
  const update = useDemo((s) => s.updateAssignment)
  const remove = useDemo((s) => s.removeAssignments)
  const undo = useDemo((s) => s.undo)
  const a = db.assignments[id]
  const [site, setSite] = useState(a?.siteId ?? '')
  const [start, setStart] = useState(a?.start ?? '08:00')
  const [end, setEnd] = useState(a?.end ?? '17:00')
  const [transfer, setTransfer] = useState(false)
  if (!a) return null
  const w = db.workers[a.workerId]
  const done = (m: string, steps = 1) => {
    toast.success(m, { action: { label: 'Anular', onClick: () => { for (let i = 0; i < steps; i++) undo() } } })
    onClose()
  }
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={w?.name ?? 'Atribuição'} description={`${db.sites[a.siteId]?.code} · ${dateLong(a.date)}`}>
      <div className="flex flex-col gap-4">
        <Field label="Mudar de obra neste dia">
          {(p) => (
            <Select {...p} value={site} onChange={(e) => setSite(e.target.value)}>
              {Object.values(db.sites).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Entrada">{(p) => <Input {...p} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label="Saída">{(p) => <Input {...p} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            let steps = 0
            if (site !== a.siteId) { move(a.id, { siteId: site }); steps++ }
            if (start !== a.start || end !== a.end) { update(a.id, { start, end }); steps++ }
            if (steps) done('Atribuição atualizada', steps)
            else onClose()
          }}
        >
          Guardar
        </Button>
        <Button size="lg" onClick={() => setTransfer(true)}>
          Transferir para outra obra…
        </Button>
        <Button size="lg" variant="ghost" className="text-tijolo-ink" onClick={() => { remove([a.id]); done('Atribuição removida') }}>
          Retirar deste dia
        </Button>
      </div>
      {transfer && <TransferDialog open onOpenChange={setTransfer} workerId={a.workerId} from={a.date} to={addDays(a.date, 4)} onDone={onClose} />}
    </Drawer>
  )
}

function AddSheet({ siteId, date, onClose }: { siteId: ID; date: ISODate; onClose: () => void }) {
  const db = useDemo((s) => s.db)
  const assign = useDemo((s) => s.assign)
  const undo = useDemo((s) => s.undo)
  const idx = buildIndex(db)
  const free = Object.values(db.workers)
    .filter((w) => w.status === 'ativo')
    .map((w) => ({ w, st: availability(w, date, idx).state }))
    .filter((x) => x.st === 'livre' || x.st === 'parcial')
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={`Atribuir a ${db.sites[siteId]?.code}`} description={`Disponíveis em ${dateLong(date)}`}>
      {free.length === 0 ? (
        <p className="text-sm text-ink-3">Não há ninguém livre neste dia. Transfira alguém de outra obra.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-2">
          {free.map(({ w, st }) => (
            <li key={w.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 py-2.5 text-left"
                onClick={() => {
                  assign({ workerId: w.id, siteId, date })
                  toast.success(`${w.name} atribuído a ${db.sites[siteId]?.code}`, { action: { label: 'Anular', onClick: () => undo() } })
                  onClose()
                }}
              >
                <Avatar name={w.name} size="sm" color={db.teams[w.teamId ?? '']?.color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{w.name}</span>
                  <span className="block text-xs text-ink-3">
                    {w.category} · {st === 'livre' ? 'livre' : 'parcialmente livre'}
                  </span>
                </span>
                <Plus className="size-4 text-pinho" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  )
}
