import { ArrowRightLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ID, ISODate } from '@/domain/types'
import { workdaysBetween } from '@/domain/planning'
import { addDays, dateShort, weekStart } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Switch } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'
import { ConflictCard } from './ConflictCard'
import { plural } from '@/lib/plural'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  workerId?: ID
  siteId?: ID
  from?: ISODate
  to?: ISODate
  onDone?: () => void
}

/** Transferir trabalhador: nova obra e período, com conflitos detetados antes de confirmar. */
export function TransferDialog({ open, onOpenChange, workerId, siteId, from, to, onDone }: Props) {
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const previewTransfer = useDemo((s) => s.previewTransfer)
  const transferWorker = useDemo((s) => s.transferWorker)
  const undo = useDemo((s) => s.undo)
  const nextMon = addDays(weekStart(today), 7)
  const [wid, setWid] = useState<ID>(workerId ?? '')
  const [sid, setSid] = useState<ID>(siteId ?? '')
  const [dFrom, setFrom] = useState<ISODate>(from ?? nextMon)
  const [dTo, setTo] = useState<ISODate>(to ?? addDays(nextMon, 4))
  const [permanent, setPermanent] = useState(false)

  const worker = db.workers[wid]
  const targetTeam = Object.values(db.teams).find((t) => t.siteId === sid)
  const valid = !!worker && !!sid && dFrom <= dTo
  const input = { workerId: wid, siteId: sid, from: dFrom, to: dTo, permanent }
  const conflicts = useMemo(() => (valid ? previewTransfer(input) : []), [db, wid, sid, dFrom, dTo, permanent]) // eslint-disable-line react-hooks/exhaustive-deps
  const removing = useMemo(
    () => (worker ? Object.values(db.assignments).filter((a) => a.workerId === wid && a.date >= dFrom && a.date <= dTo).length : 0),
    [db, wid, dFrom, dTo, worker],
  )
  const days = valid ? workdaysBetween(dFrom, dTo).length : 0

  const confirm = () => {
    const res = transferWorker(input)
    toast.success(`${worker?.name} transferido para ${db.sites[sid]?.code}`, {
      description: `${res.created} dias planeados, ${res.removed} atribuições anteriores retiradas.`,
      action: { label: 'Anular', onClick: () => undo() },
    })
    onOpenChange(false)
    onDone?.()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      eyebrow="Transferência"
      title={worker ? `Transferir ${worker.name}` : 'Transferir trabalhador'}
      description="Escolha a nova obra e o período. O planeamento existente nesse período é substituído."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!valid} icon={<ArrowRightLeft className="size-4" />} onClick={confirm}>
            {conflicts.length ? `Transferir com ${plural(conflicts.length, 'conflito', 'conflitos')}` : 'Confirmar transferência'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!workerId && (
          <Field label="Trabalhador" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={wid} onChange={(e) => setWid(e.target.value)}>
                <option value="">Escolher…</option>
                {Object.values(db.workers)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} · {w.category}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Nova obra" className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={sid} onChange={(e) => setSid(e.target.value)}>
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
        <Field label="De">
          {(p) => <Input {...p} type="date" value={dFrom} min={today} onChange={(e) => setFrom(e.target.value)} />}
        </Field>
        <Field label="Até" error={dFrom > dTo ? 'A data de fim é anterior à de início.' : null}>
          {(p) => <Input {...p} type="date" value={dTo} min={dFrom} onChange={(e) => setTo(e.target.value)} />}
        </Field>
        {targetTeam && worker && worker.teamId !== targetTeam.id && (
          <Switch
            className="sm:col-span-2"
            label={`Passar para a equipa ${targetTeam.name}`}
            description="Mudança permanente de equipa. Desligado: é um reforço temporário e mantém a equipa atual."
            checked={permanent}
            onChange={setPermanent}
          />
        )}
      </div>
      {valid && (
        <div className="mt-4 rounded-md bg-cal p-3 text-sm text-ink-2">
          {days} dias úteis em <strong className="text-ink">{db.sites[sid]?.code} {db.sites[sid]?.name}</strong>
          {targetTeam ? ` com a equipa ${targetTeam.name} e a viatura ${db.vehicles[targetTeam.vehicleId ?? '']?.plate ?? '—'}` : ''}, de{' '}
          {dateShort(dFrom)} a {dateShort(dTo)}.
          {removing > 0 && ` Retira ${removing} atribuições já planeadas nesse período.`} Dias com ausência aprovada ficam livres.
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-ink">Conflitos que esta transferência cria</p>
          <div className="flex flex-col gap-2">
            {conflicts.map((c) => (
              <ConflictCard key={c.id} conflict={c} preview />
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">Pode confirmar e resolver depois no painel de conflitos do planeamento.</p>
        </div>
      )}
    </Dialog>
  )
}
