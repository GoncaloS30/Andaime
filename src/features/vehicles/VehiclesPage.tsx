import { Plus, Truck, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { ModuleGuard } from '@/app/ModuleGuard'
import { buildIndex, key } from '@/domain/indexes'
import { VEHICLE_STATUS } from '@/domain/labels'
import { addDays, dayShort, weekDays, weekStart } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { selectConflicts } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { Badge, Plate } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { PageHeader } from '@/ui/Layout'
import { Drawer } from '@/ui/Overlay'
import { isUnavailable, validity } from './helpers'
import { VehicleAssignDialog } from './VehicleAssignDialog'

export function VehiclesPage() {
  const [sp, setSp] = useSearchParams()
  const filter = sp.get('estado') ?? ''
  const [assign, setAssign] = useState(false)
  const [creating, setCreating] = useState(false)
  const d = useDerived(({ db, session }) => {
    const idx = buildIndex(db)
    const days = weekDays(weekStart(session.today))
    const conflicts = selectConflicts({ db, session })
    return {
      days,
      today: session.today,
      rows: Object.values(db.vehicles)
        .sort((a, b) => a.plate.localeCompare(b.plate))
        .map((v) => ({
          v,
          team: v.teamId ? db.teams[v.teamId] : undefined,
          week: days.map((x) => idx.byVehicleDate.get(key(v.id, x)) ?? []),
          conflicts: conflicts.filter((c) => c.vehicleIds.includes(v.id)).length,
        })),
      db,
    }
  })
  const rows = d.rows.filter((r) => !filter || (filter === 'indisponivel' ? isUnavailable(r.v, d.today) : filter === 'livre' ? !r.v.teamId : true))
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Viaturas"
        description={`${d.rows.length} viaturas · ${d.rows.filter((r) => isUnavailable(r.v, d.today)).length} indisponíveis · ${d.rows.filter((r) => !r.v.teamId).length} de reserva`}
        actions={
          <>
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Nova viatura</Button>
            <Button variant="primary" icon={<Truck className="size-4" />} onClick={() => setAssign(true)} data-tour="assign-vehicle">Atribuir viatura</Button>
          </>
        }
      />
      <ModuleGuard empty={{ icon: <Truck />, title: 'Ainda não há viaturas', text: 'Registe a frota para a atribuir às equipas e controlar inspeções e seguros.' }}>
        <div className="mb-3 flex gap-2">
          <label className="sr-only" htmlFor="v-f">Filtro</label>
          <Select id="v-f" value={filter} onChange={(e) => setSp(e.target.value ? { estado: e.target.value } : {}, { replace: true })} className="w-52">
            <option value="">Todas as viaturas</option>
            <option value="indisponivel">Indisponíveis</option>
            <option value="livre">De reserva (sem equipa)</option>
          </Select>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-a min-w-[1100px]">
            <thead>
              <tr>
                <th scope="col">Viatura</th>
                <th scope="col">Estado</th>
                <th scope="col">Equipa</th>
                <th scope="col">Seguro</th>
                <th scope="col">Inspeção</th>
                <th scope="col">Manutenção</th>
                <th scope="col">Esta semana</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ v, team, week, conflicts }) => {
                const ins = validity(v.insuranceUntil, d.today)
                const ipo = validity(v.inspectionUntil, d.today)
                const man = validity(v.maintenanceDue, d.today)
                return (
                  <tr key={v.id}>
                    <td>
                      <Link to={`/viaturas/${v.id}`} className="flex items-center gap-2.5 hover:underline">
                        <Plate plate={v.plate} />
                        <span>
                          {v.make} {v.model}
                          <span className="block text-xs text-ink-3">{v.seats} lugares · {v.km.toLocaleString('pt-PT')} km</span>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Badge tone={v.status === 'operacional' ? 'ok' : 'danger'} dot icon={v.status === 'oficina' ? <Wrench className="size-3" aria-hidden /> : undefined}>{VEHICLE_STATUS[v.status]}</Badge>
                      {conflicts > 0 && <Badge tone="danger" className="ml-1">{conflicts} conflito{conflicts > 1 ? 's' : ''}</Badge>}
                    </td>
                    <td>{team ? <Link to={`/equipas/${team.id}`} className="hover:underline">{team.name}</Link> : <span className="text-ink-3">Reserva</span>}</td>
                    <td><Badge tone={ins.tone} dot>{ins.label}</Badge></td>
                    <td><Badge tone={ipo.tone} dot>{ipo.label}</Badge></td>
                    <td><Badge tone={man.tone === 'danger' ? 'warn' : man.tone} dot>{man.tone === 'danger' ? 'Em atraso' : man.label}</Badge></td>
                    <td>
                      <span className="flex gap-0.5" aria-label="Utilização por dia">
                        {week.map((list, i) => {
                          const site = list[0] ? d.db.sites[list[0].siteId] : undefined
                          const riders = new Set(list.map((a) => a.workerId)).size
                          return (
                            <span
                              key={i}
                              title={`${dayShort(d.days[i]!)}: ${site ? `${site.code}, ${riders}/${v.seats}` : 'livre'}`}
                              className={cn('flex h-6 w-7 items-center justify-center rounded-xs font-mono text-[10px]', !site && 'bg-line-2 text-ink-4', riders > v.seats && 'ring-1 ring-tijolo')}
                              style={site ? { background: `color-mix(in oklab, ${site.color} 30%, white)` } : undefined}
                            >
                              {site ? riders : '·'}
                            </span>
                          )
                        })}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </ModuleGuard>
      {assign && <VehicleAssignDialog open onOpenChange={setAssign} />}
      {creating && <NewVehicle onClose={() => setCreating(false)} />}
    </div>
  )
}

function NewVehicle({ onClose }: { onClose: () => void }) {
  const today = useDemo((s) => s.session.today)
  const create = useDemo((s) => s.createVehicle)
  const [f, setF] = useState({ plate: '', make: '', model: '', seats: 6, km: 0, insuranceUntil: addDays(today, 365), inspectionUntil: addDays(today, 365), maintenanceDue: addDays(today, 180) })
  const plateOk = /^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}$/.test(f.plate)
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Nova viatura"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!plateOk || !f.make} onClick={() => { create({ ...f, status: 'operacional', notes: '' }); toast.success(`Viatura ${f.plate} registada`); onClose() }}>Registar viatura</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Matrícula" hint="Formato AA-00-AA" error={f.plate && !plateOk ? 'Use o formato AA-00-AA.' : null}>
          {(p) => <Input {...p} value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value.toUpperCase() })} />}
        </Field>
        <Field label="Lugares">{(p) => <Input {...p} type="number" min={2} max={9} value={f.seats} onChange={(e) => setF({ ...f, seats: Number(e.target.value) })} />}</Field>
        <Field label="Marca">{(p) => <Input {...p} value={f.make} onChange={(e) => setF({ ...f, make: e.target.value })} />}</Field>
        <Field label="Modelo">{(p) => <Input {...p} value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />}</Field>
        <Field label="Seguro até">{(p) => <Input {...p} type="date" value={f.insuranceUntil} onChange={(e) => setF({ ...f, insuranceUntil: e.target.value })} />}</Field>
        <Field label="Inspeção até">{(p) => <Input {...p} type="date" value={f.inspectionUntil} onChange={(e) => setF({ ...f, inspectionUntil: e.target.value })} />}</Field>
      </div>
    </Drawer>
  )
}
