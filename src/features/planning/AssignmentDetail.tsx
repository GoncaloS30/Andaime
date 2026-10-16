import { ArrowRightLeft, CalendarRange, Copy, MoveRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { entryHours, formatHours, timeRangeHours } from '@/domain/hours'
import { ENTRY_STATUS } from '@/domain/labels'
import type { ID, ISODate } from '@/domain/types'
import { addDays, dateLong, dayShort } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Badge, SiteCode } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { ChipToggle, Field, Input, Select, Switch, Textarea } from '@/ui/Field'
import { ConflictCard } from '../shared/ConflictCard'
import { TransferDialog } from '../shared/TransferDialog'
import { usePlanning } from './PlanningContext'
import { plural } from '@/lib/plural'

type Mode = null | 'mover' | 'duplicar' | 'periodo'

export function AssignmentDetail({ id, onClose }: { id: ID; onClose: () => void }) {
  const { db, days, conflictsByAssignment } = usePlanning()
  const settings = useDemo((s) => s.session.settings)
  const update = useDemo((s) => s.updateAssignment)
  const move = useDemo((s) => s.moveAssignment)
  const setRange = useDemo((s) => s.setRange)
  const remove = useDemo((s) => s.removeAssignments)
  const undo = useDemo((s) => s.undo)
  const a = db.assignments[id]
  const [start, setStart] = useState(a?.start ?? '08:00')
  const [end, setEnd] = useState(a?.end ?? '17:00')
  const [vehicle, setVehicle] = useState(a?.vehicleId ?? '')
  const [foreman, setForeman] = useState(a?.isForeman ?? false)
  const [note, setNote] = useState(a?.note ?? '')
  const [mode, setMode] = useState<Mode>(null)
  const [mWorker, setMWorker] = useState(a?.workerId ?? '')
  const [mSite, setMSite] = useState(a?.siteId ?? '')
  const [mDate, setMDate] = useState<ISODate>(a?.date ?? '')
  const [dupDays, setDupDays] = useState<ISODate[]>([])
  const [pFrom, setPFrom] = useState<ISODate>(a?.date ?? '')
  const [pTo, setPTo] = useState<ISODate>(a ? addDays(a.date, 4) : '')
  const [transfer, setTransfer] = useState(false)

  if (!a) {
    return <p className="text-sm text-ink-3">Esta atribuição já não existe (foi removida ou anulada).</p>
  }
  const w = db.workers[a.workerId]
  const s = db.sites[a.siteId]
  const entry = Object.values(db.entries).find((e) => e.workerId === a.workerId && e.date === a.date && e.siteId === a.siteId)
  const conflicts = conflictsByAssignment.get(a.id) ?? []
  const hours = timeRangeHours(start, end, settings.defaultBreak)
  const dirty = start !== a.start || end !== a.end || (vehicle || null) !== a.vehicleId || foreman !== a.isForeman || note !== a.note
  const done = (msg: string) => toast.success(msg, { action: { label: 'Anular', onClick: () => undo() } })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={w?.name ?? '?'} photo={w?.photo} size="md" color={db.teams[w?.teamId ?? '']?.color} />
        <div className="min-w-0">
          <Link to={`/trabalhadores/${a.workerId}`} className="block truncate font-semibold text-ink hover:underline">
            {w?.name}
          </Link>
          <p className="text-xs text-ink-3">
            {w?.category} · {dateLong(a.date)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {s && <SiteCode code={s.code} color={s.color} />}
        <span className="text-sm font-medium">{s?.name}</span>
        {entry ? (
          <Badge tone={entry.status === 'aprovado' ? 'ok' : entry.status === 'rejeitado' ? 'danger' : 'info'} dot>
            {ENTRY_STATUS[entry.status]} · {entry.clockOut ? formatHours(entryHours(entry, settings).worked) : `desde ${entry.clockIn}`}
          </Badge>
        ) : (
          <Badge dot>Planeado</Badge>
        )}
      </div>

      {conflicts.map((c) => (
        <ConflictCard key={c.id} conflict={c} />
      ))}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Entrada">{(p) => <Input {...p} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Saída" hint={`${formatHours(hours)} planeadas`}>
          {(p) => <Input {...p} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}
        </Field>
        <Field label="Viatura" className="col-span-2">
          {(p) => (
            <Select {...p} value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
              <option value="">Sem viatura</option>
              {Object.values(db.vehicles).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.make} {v.model} · {v.seats} lugares
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Switch className="col-span-2" label="Responsável no terreno neste dia" checked={foreman} onChange={setForeman} />
        <Field label="Nota" optional className="col-span-2">
          {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-14" />}
        </Field>
      </div>
      <Button
        variant="primary"
        disabled={!dirty || hours <= 0}
        onClick={() => {
          update(a.id, { start, end, hours, vehicleId: vehicle || null, isForeman: foreman, note })
          done('Atribuição atualizada')
        }}
      >
        Guardar alterações
      </Button>

      <div className="grid grid-cols-2 gap-1.5 border-t border-line-2 pt-3">
        <Button size="sm" icon={<MoveRight className="size-3.5" />} onClick={() => setMode(mode === 'mover' ? null : 'mover')} aria-expanded={mode === 'mover'}>
          Mover para…
        </Button>
        <Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => setMode(mode === 'duplicar' ? null : 'duplicar')} aria-expanded={mode === 'duplicar'}>
          Duplicar…
        </Button>
        <Button size="sm" icon={<CalendarRange className="size-3.5" />} onClick={() => setMode(mode === 'periodo' ? null : 'periodo')} aria-expanded={mode === 'periodo'}>
          Alterar período
        </Button>
        <Button size="sm" icon={<ArrowRightLeft className="size-3.5" />} onClick={() => setTransfer(true)}>
          Transferir…
        </Button>
      </div>

      {mode === 'mover' && (
        <div className="flex flex-col gap-3 rounded-md bg-cal p-3">
          <Field label="Trabalhador">
            {(p) => (
              <Select {...p} value={mWorker} onChange={(e) => setMWorker(e.target.value)}>
                {Object.values(db.workers).filter((x) => x.status === 'ativo').sort((x, y) => x.name.localeCompare(y.name)).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Obra">
            {(p) => (
              <Select {...p} value={mSite} onChange={(e) => setMSite(e.target.value)}>
                {Object.values(db.sites).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Dia">{(p) => <Input {...p} type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />}</Field>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              move(a.id, { workerId: mWorker, siteId: mSite, date: mDate })
              done('Atribuição movida')
              setMode(null)
            }}
          >
            Mover
          </Button>
        </div>
      )}
      {mode === 'duplicar' && (
        <div className="flex flex-col gap-3 rounded-md bg-cal p-3">
          <p className="text-xs text-ink-3">Copiar esta atribuição para outros dias da semana.</p>
          <div className="flex flex-wrap gap-1.5">
            {days.filter((d) => d !== a.date).map((d) => (
              <ChipToggle key={d} pressed={dupDays.includes(d)} onClick={() => setDupDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}>
                {dayShort(d)} {d.slice(8)}
              </ChipToggle>
            ))}
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={dupDays.length === 0}
            onClick={() => {
              for (const d of dupDays) move(a.id, { date: d }, true)
              toast.success(`Duplicada para ${plural(dupDays.length, 'dia', 'dias')}`, {
                action: { label: 'Anular', onClick: () => dupDays.forEach(() => undo()) },
              })
              setDupDays([])
              setMode(null)
            }}
          >
            Duplicar
          </Button>
        </div>
      )}
      {mode === 'periodo' && (
        <div className="flex flex-col gap-3 rounded-md bg-cal p-3">
          <p className="text-xs text-ink-3">Define os dias úteis seguidos de {w?.name} em {s?.code}. Substitui o período atual nesta obra.</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="De">{(p) => <Input {...p} type="date" value={pFrom} onChange={(e) => setPFrom(e.target.value)} />}</Field>
            <Field label="Até">{(p) => <Input {...p} type="date" value={pTo} min={pFrom} onChange={(e) => setPTo(e.target.value)} />}</Field>
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={pTo < pFrom}
            onClick={() => {
              setRange(a.id, pFrom, pTo)
              done('Período alterado')
              setMode(null)
              onClose()
            }}
          >
            Aplicar período
          </Button>
        </div>
      )}
      <Button
        variant="ghost"
        className="justify-start text-tijolo-ink hover:bg-tijolo-soft"
        icon={<Trash2 className="size-4" />}
        onClick={() => {
          remove([a.id])
          done('Atribuição removida')
          onClose()
        }}
      >
        Remover do planeamento
      </Button>
      {transfer && (
        <TransferDialog open={transfer} onOpenChange={setTransfer} workerId={a.workerId} from={a.date} to={addDays(a.date, 4)} onDone={onClose} />
      )}
    </div>
  )
}
