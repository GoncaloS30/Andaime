import { Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ID } from '@/domain/types'
import { addDays, dateShort, weekStart } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { Badge, Plate } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'
import { ConflictCard } from '../shared/ConflictCard'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  vehicleId?: ID
  teamId?: ID
}

/** Fluxo 4 — atribuir viatura a uma equipa, ver conflitos e escolher uma alternativa livre. */
export function VehicleAssignDialog({ open, onOpenChange, vehicleId, teamId }: Props) {
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const preview = useDemo((s) => s.previewTeamVehicle)
  const setTeamVehicle = useDemo((s) => s.setTeamVehicle)
  const undo = useDemo((s) => s.undo)
  const [vid, setVid] = useState<ID>(vehicleId ?? '')
  const [tid, setTid] = useState<ID>(teamId ?? '')
  const [from, setFrom] = useState(today)
  const team = db.teams[tid]
  const v = db.vehicles[vid]
  const conflicts = useMemo(() => (vid && tid ? preview(tid, vid, from) : []), [db, vid, tid, from]) // eslint-disable-line react-hooks/exhaustive-deps
  const until = addDays(weekStart(from), 13)

  const alternatives = useMemo(() => {
    if (!team || conflicts.length === 0) return []
    return Object.values(db.vehicles)
      .filter((x) => x.id !== vid && x.id !== team.vehicleId && x.seats >= team.memberIds.length)
      .filter((x) => x.status === 'operacional' && x.inspectionUntil >= until && x.insuranceUntil >= until)
      .filter((x) => !Object.values(db.assignments).some((a) => a.vehicleId === x.id && a.date >= from && a.date <= until && a.teamId !== tid))
      // Já filtradas por livres, utilizáveis e com lugares no período: não é preciso pré-visualizar cada uma.
      .map((x) => ({ x }))
      .sort((a, b) => a.x.seats - b.x.seats)
      .slice(0, 4)
  }, [db, team, conflicts.length, vid, tid, from, until])  

  const apply = (target: ID) => {
    setTeamVehicle(tid, target, from)
    toast.success(`${db.vehicles[target]?.plate} atribuída a ${team?.name}`, {
      description: `A partir de ${dateShort(from)}. Equipa e planeamento atualizados.`,
      action: { label: 'Anular', onClick: () => undo() },
    })
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Atribuir viatura a equipa"
      description="A viatura passa a ser usada em todas as atribuições da equipa a partir da data escolhida."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant={conflicts.length ? 'secondary' : 'primary'} icon={<Truck className="size-4" />} disabled={!vid || !tid} onClick={() => apply(vid)}>
            {conflicts.length ? 'Atribuir mesmo assim' : 'Atribuir viatura'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Viatura">
          {(p) => (
            <Select {...p} value={vid} onChange={(e) => setVid(e.target.value)}>
              <option value="">Escolher…</option>
              {Object.values(db.vehicles).map((x) => <option key={x.id} value={x.id}>{x.plate} · {x.seats} lug.{x.teamId ? ` · ${db.teams[x.teamId]?.name}` : ''}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Equipa">
          {(p) => (
            <Select {...p} value={tid} onChange={(e) => setTid(e.target.value)}>
              <option value="">Escolher…</option>
              {Object.values(db.teams).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.memberIds.length})</option>)}
            </Select>
          )}
        </Field>
        <Field label="A partir de">{(p) => <Input {...p} type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} />}</Field>
      </div>
      {v && team && conflicts.length === 0 && (
        <p className="mt-4 rounded-md border border-ok/30 bg-ok-soft px-3 py-2.5 text-sm font-medium text-ok">
          Sem conflitos: {v.plate} ({v.seats} lugares) serve a equipa {team.name} ({team.memberIds.length} pessoas).
        </p>
      )}
      {conflicts.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-sm font-semibold">Esta atribuição cria {conflicts.length === 1 ? 'um conflito' : `${conflicts.length} conflitos`}</p>
          {conflicts.map((c) => <ConflictCard key={c.id} conflict={c} preview />)}
          <p className="mt-2 text-sm font-semibold">Alternativas livres até {dateShort(until)}</p>
          {alternatives.length === 0 ? (
            <p className="text-sm text-ink-3">Não há viaturas livres com lugares suficientes nesse período.</p>
          ) : (
            <ul className="flex flex-col gap-1.5" data-tour="vehicle-alternatives">
              {alternatives.map(({ x }) => (
                <li key={x.id}>
                  <button type="button" onClick={() => apply(x.id)} className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left hover:border-pinho hover:bg-lima-soft/40">
                    <Plate plate={x.plate} />
                    <span className="flex-1 text-sm">{x.make} {x.model} · {x.seats} lugares{x.notes ? ` · ${x.notes}` : ''}</span>
                    <Badge tone="ok" dot>Livre no período</Badge>
                    <span className="text-sm font-semibold text-pinho">Usar esta</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  )
}
