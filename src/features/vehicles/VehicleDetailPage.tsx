import { ArrowLeft, Truck, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { buildIndex, key } from '@/domain/indexes'
import { VEHICLE_STATUS } from '@/domain/labels'
import type { VehicleStatus } from '@/domain/types'
import { addDays, dayShort, isWeekend, weekDays, weekStart } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { selectConflicts } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { Badge, Plate } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { Detail, Panel } from '@/ui/Layout'
import { EmptyState } from '@/ui/States'
import { ActivityList } from '../shared/ActivityList'
import { ConflictCard } from '../shared/ConflictCard'
import { VehicleAssignDialog } from './VehicleAssignDialog'
import { validity } from './helpers'

export function VehicleDetailPage() {
  const { id = '' } = useParams()
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const update = useDemo((s) => s.updateVehicle)
  const v = db.vehicles[id]
  const [assign, setAssign] = useState(false)
  const [dates, setDates] = useState({ insuranceUntil: v?.insuranceUntil ?? '', inspectionUntil: v?.inspectionUntil ?? '', maintenanceDue: v?.maintenanceDue ?? '' })
  const weeks = useDerived(({ db: d, session }) => {
    const idx = buildIndex(d)
    const ws = weekStart(session.today)
    return [0, 1, 2, 3].map((i) => weekDays(addDays(ws, i * 7)).map((x) => ({ date: x, list: idx.byVehicleDate.get(key(id, x)) ?? [] })))
  }, [id])
  const conflicts = useDerived((s) => selectConflicts(s, { from: s.session.today, to: addDays(s.session.today, 27) }).filter((c) => c.vehicleIds.includes(id)), [id])

  if (!v) return <EmptyState title="Viatura não encontrada" action={<Link to="/viaturas" className="text-pinho underline">Voltar</Link>}>Pode ter sido removida ao repor a demonstração.</EmptyState>
  const team = v.teamId ? db.teams[v.teamId] : undefined
  const blocked = (d: string) => v.status !== 'operacional' || v.inspectionUntil < d || v.insuranceUntil < d
  const dirtyDates = dates.insuranceUntil !== v.insuranceUntil || dates.inspectionUntil !== v.inspectionUntil || dates.maintenanceDue !== v.maintenanceDue

  return (
    <div className="mx-auto max-w-[1280px]">
      <Link to="/viaturas" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Viaturas
      </Link>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Plate plate={v.plate} className="h-7 px-2 text-sm" />
          <h1 className="mt-1 font-expanded text-2xl font-semibold tracking-tight">{v.make} {v.model}</h1>
          <p className="text-sm text-ink-3">
            {v.seats} lugares · {v.km.toLocaleString('pt-PT')} km · {team ? <Link to={`/equipas/${team.id}`} className="text-pinho hover:underline">{team.name}</Link> : 'Reserva'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Estado">
            {(p) => (
              <Select {...p} value={v.status} onChange={(e) => { update(id, { status: e.target.value as VehicleStatus }); toast.success(`${v.plate}: ${VEHICLE_STATUS[e.target.value as VehicleStatus].toLowerCase()}`, { description: 'Os conflitos do planeamento foram recalculados.' }) }} className="w-40">
                {Object.entries(VEHICLE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            )}
          </Field>
          <Button variant="primary" icon={<Truck className="size-4" />} onClick={() => setAssign(true)}>Atribuir a equipa</Button>
        </div>
      </header>

      {conflicts.length > 0 && (
        <div className="mb-4 grid gap-2 md:grid-cols-2">
          {conflicts.map((c) => <ConflictCard key={c.id} conflict={c} />)}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Disponibilidade" description="Quatro semanas a partir desta" flush>
          <div className="overflow-x-auto p-3">
            <table className="w-full min-w-[560px] border-separate border-spacing-1 text-xs">
              <thead>
                <tr>{weeks[0]!.map(({ date }) => <th key={date} scope="col" className="font-condensed font-semibold text-ink-3 uppercase">{dayShort(date)}</th>)}</tr>
              </thead>
              <tbody>
                {weeks.map((w, i) => (
                  <tr key={i}>
                    {w.map(({ date, list }) => {
                      const site = list[0] ? db.sites[list[0].siteId] : undefined
                      const riders = new Set(list.map((a) => a.workerId)).size
                      const sites = new Set(list.map((a) => a.siteId)).size
                      return (
                        <td key={date} className={cn('h-14 rounded-sm border align-top', date === today ? 'border-pinho' : 'border-line-2', isWeekend(date) && !site && 'bg-line-2/50', blocked(date) && 'bg-tijolo-soft')}>
                          <div className="flex h-full flex-col p-1" style={site ? { background: `color-mix(in oklab, ${site.color} 18%, white)` } : undefined}>
                            <span className="text-[10px] text-ink-3 tabular">{Number(date.slice(8))}</span>
                            {site && <span className="font-mono text-[10px] font-semibold">{site.code.slice(3)}</span>}
                            {site && <span className={cn('text-[10px] tabular', riders > v.seats ? 'font-semibold text-tijolo-ink' : 'text-ink-3')}>{riders}/{v.seats}{sites > 1 ? ' · 2 obras' : ''}</span>}
                            {!site && blocked(date) && <span className="text-[10px] text-tijolo-ink">Indisponível</span>}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Validades">
            <dl className="mb-4 grid grid-cols-3 gap-3">
              <Detail label="Seguro"><Badge tone={validity(v.insuranceUntil, today).tone} dot>{validity(v.insuranceUntil, today).label}</Badge></Detail>
              <Detail label="Inspeção"><Badge tone={validity(v.inspectionUntil, today).tone} dot>{validity(v.inspectionUntil, today).label}</Badge></Detail>
              <Detail label="Manutenção"><Badge tone={validity(v.maintenanceDue, today).tone === 'danger' ? 'warn' : validity(v.maintenanceDue, today).tone} dot>{validity(v.maintenanceDue, today).label}</Badge></Detail>
            </dl>
            <div className="grid gap-3">
              <Field label="Seguro válido até">{(p) => <Input {...p} type="date" value={dates.insuranceUntil} onChange={(e) => setDates({ ...dates, insuranceUntil: e.target.value })} />}</Field>
              <Field label="Inspeção válida até">{(p) => <Input {...p} type="date" value={dates.inspectionUntil} onChange={(e) => setDates({ ...dates, inspectionUntil: e.target.value })} />}</Field>
              <Field label="Próxima manutenção">{(p) => <Input {...p} type="date" value={dates.maintenanceDue} onChange={(e) => setDates({ ...dates, maintenanceDue: e.target.value })} />}</Field>
              <Button variant="primary" icon={<Wrench className="size-4" />} disabled={!dirtyDates} onClick={() => { update(id, dates); toast.success('Validades atualizadas', { description: 'Alertas e conflitos recalculados.' }) }}>
                Guardar validades
              </Button>
            </div>
          </Panel>
          <Panel title="Histórico">
            <ActivityList events={db.activity.filter((e) => e.refs.vehicleId === id)} limit={20} empty="Atribuições, trocas e mudanças de estado desta viatura aparecem aqui." />
          </Panel>
        </div>
      </div>
      {assign && <VehicleAssignDialog open onOpenChange={setAssign} vehicleId={id} />}
    </div>
  )
}
