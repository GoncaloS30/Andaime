import { CalendarPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { timeRangeHours, formatHours } from '@/domain/hours'
import type { ID, ISODate } from '@/domain/types'
import { dayShort } from '@/domain/weeks'
import { demoStore, useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { ChipToggle, Field, Input, Select } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'
import { ConflictCard } from '../../shared/ConflictCard'
import { plural } from '@/lib/plural'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  days: ISODate[]
  workerId?: ID
  siteId?: ID
  date: ISODate
  onCreated?: (ids: ID[]) => void
}

/** Atribuir por formulário: o caminho por teclado equivalente a arrastar e largar. */
export function AssignDialog({ open, onOpenChange, days, workerId, siteId, date, onCreated }: Props) {
  const db = useDemo((s) => s.db)
  const settings = useDemo((s) => s.session.settings)
  const preview = useDemo((s) => s.previewSchedule)
  const create = useDemo((s) => s.createSchedule)
  const undo = useDemo((s) => s.undo)
  const [wid, setWid] = useState(workerId ?? '')
  const [sid, setSid] = useState(siteId ?? db.teams[db.workers[workerId ?? '']?.teamId ?? '']?.siteId ?? '')
  const [dates, setDates] = useState<ISODate[]>([date])
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('17:00')
  const worker = db.workers[wid]
  const team = worker?.teamId ? db.teams[worker.teamId] : undefined
  const defaultVehicle = team && team.siteId === sid ? (team.vehicleId ?? '') : ''
  const [vehicle, setVehicle] = useState<string>('auto')
  const vehicleId = vehicle === 'auto' ? defaultVehicle || null : vehicle || null
  const hours = timeRangeHours(start, end, settings.defaultBreak)
  const valid = !!wid && !!sid && dates.length > 0 && hours > 0
  const input = { teamId: team?.id ?? null, siteId: sid, workerIds: [wid], dates, start, end, vehicleId, foremanId: null, note: '' }
  const conflicts = useMemo(() => (valid ? preview(input) : []), [db, wid, sid, dates, start, end, vehicleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const res = create(input)
    const ids = Object.values(demoStore.getState().db.assignments).filter((a) => a.batchId === res.batchId).map((a) => a.id)
    toast.success(`${worker?.name} atribuído a ${db.sites[sid]?.code}`, {
      description: `${plural(res.created, 'dia', 'dias')} · ${start}–${end}`,
      action: { label: 'Anular', onClick: () => undo() },
    })
    onCreated?.(ids)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Atribuir trabalho"
      description="Escolha quem, onde, que dias e que horário."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!valid} icon={<CalendarPlus className="size-4" />} onClick={save}>
            {conflicts.length ? `Atribuir com ${plural(conflicts.length, 'conflito', 'conflitos')}` : 'Atribuir'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Trabalhador" className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={wid} onChange={(e) => setWid(e.target.value)}>
              <option value="">Escolher…</option>
              {Object.values(db.workers)
                .filter((w) => w.status === 'ativo')
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {w.category}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Obra" className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={sid} onChange={(e) => setSid(e.target.value)}>
              <option value="">Escolher obra…</option>
              {Object.values(db.sites)
                .filter((s) => s.status !== 'concluida')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium text-ink">Dias</legend>
          <div className="flex flex-wrap gap-1.5">
            {days.map((d) => (
              <ChipToggle key={d} pressed={dates.includes(d)} onClick={() => setDates((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()))}>
                {dayShort(d)} {d.slice(8)}
              </ChipToggle>
            ))}
          </div>
        </fieldset>
        <Field label="Início">{(p) => <Input {...p} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Fim" hint={hours > 0 ? `${formatHours(hours)} por dia${hours > 6 ? `, com ${settings.defaultBreak} min de pausa` : ''}` : undefined} error={hours <= 0 ? 'O fim tem de ser depois do início.' : null}>
          {(p) => <Input {...p} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}
        </Field>
        <Field label="Viatura" className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
              <option value="auto">{defaultVehicle ? `Da equipa (${db.vehicles[defaultVehicle]?.plate})` : 'Sem viatura'}</option>
              <option value="">Sem viatura</option>
              {Object.values(db.vehicles).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.make} {v.model} · {v.seats} lugares
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {conflicts.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">Esta atribuição cria conflitos</p>
          {conflicts.map((c) => (
            <ConflictCard key={c.id} conflict={c} preview />
          ))}
        </div>
      )}
    </Dialog>
  )
}
