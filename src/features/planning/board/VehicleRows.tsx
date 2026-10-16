import { useDraggable } from '@dnd-kit/core'
import { Wrench } from 'lucide-react'
import { Link } from 'react-router'
import { VEHICLE_STATUS } from '@/domain/labels'
import type { Assignment, ID, ISODate, Vehicle } from '@/domain/types'
import { isWeekend } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { Plate } from '@/ui/Badge'
import { usePlanning } from '../PlanningContext'
import { DropCell } from './Cell'
import { GRID_COLS } from './DayHeader'

/** Perspetiva por viatura: obra, passageiros e lugares. Arrastar um dia para outra viatura troca a viatura. */
export function VehicleRows() {
  const { db, days, today, query } = usePlanning()
  const q = query.trim().toLowerCase()
  const vehicles = Object.values(db.vehicles)
    .filter((v) => !q || `${v.plate} ${v.make} ${v.model}`.toLowerCase().includes(q))
    .sort((a, b) => Number(!!b.teamId) - Number(!!a.teamId) || a.plate.localeCompare(b.plate))
  const byVehicleDay = new Map<string, Assignment[]>()
  for (const a of Object.values(db.assignments)) {
    if (!a.vehicleId || !days.includes(a.date)) continue
    const k = `${a.vehicleId}|${a.date}`
    byVehicleDay.set(k, [...(byVehicleDay.get(k) ?? []), a])
  }
  return (
    <>
      {vehicles.map((v) => {
        const team = v.teamId ? db.teams[v.teamId] : undefined
        return (
          <div key={v.id} className={cn('grid', GRID_COLS)}>
            <div className="sticky left-0 z-10 flex min-w-0 flex-col justify-center gap-0.5 border-t border-line-2 bg-surface px-3 py-2">
              <Link to={`/viaturas/${v.id}`} className="flex items-center gap-2 hover:underline">
                <Plate plate={v.plate} />
                <span className="truncate text-xs text-ink-2">{v.make} {v.model}</span>
              </Link>
              <span className="flex items-center gap-1 truncate text-[11px] text-ink-3">
                {v.status !== 'operacional' && <Wrench aria-hidden className="size-3 text-tijolo" />}
                {v.seats} lugares · {v.status !== 'operacional' ? VEHICLE_STATUS[v.status] : team ? team.name : 'Reserva'}
              </span>
            </div>
            {days.map((d) => (
              <VehicleDayCell key={d} v={v} date={d} list={byVehicleDay.get(`${v.id}|${d}`) ?? []} today={d === today} />
            ))}
          </div>
        )
      })}
    </>
  )
}

function VehicleDayCell({ v, date, list, today }: { v: Vehicle; date: ISODate; list: Assignment[]; today: boolean }) {
  const { db, conflictsByAssignment } = usePlanning()
  const riders = new Set(list.map((a) => a.workerId)).size
  const sites = [...new Set(list.map((a) => a.siteId))]
  const blocked = v.status !== 'operacional' || v.inspectionUntil < date || v.insuranceUntil < date
  const conflict = list.some((a) => conflictsByAssignment.get(a.id)?.some((c) => c.vehicleIds.includes(v.id)))
  return (
    <DropCell
      id={`vd:${v.id}:${date}`}
      data={{ type: 'vehicle-day', vehicleId: v.id, date }}
      today={today}
      weekend={isWeekend(date)}
      muted={blocked && list.length === 0}
    >
      {list.length > 0 && <VehicleBlock vehicleId={v.id} date={date} ids={list.map((a) => a.id)} sites={sites} riders={riders} seats={v.seats} conflict={conflict || blocked} db={db} />}
      {blocked && list.length === 0 && <span className="text-[10.5px] text-ink-3">Indisponível</span>}
    </DropCell>
  )
}

function VehicleBlock({
  vehicleId, date, ids, sites, riders, seats, conflict, db,
}: { vehicleId: ID; date: ISODate; ids: ID[]; sites: ID[]; riders: number; seats: number; conflict: boolean; db: ReturnType<typeof usePlanning>['db'] }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `vb:${vehicleId}:${date}`,
    data: { type: 'vehicle-block', vehicleId, date, ids },
  })
  const over = riders > seats
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`${sites.map((s) => db.sites[s]?.code).join(' e ')}: ${riders} de ${seats} lugares${conflict ? ', com conflito' : ''}. Arraste para outra viatura para trocar.`}
      className={cn(
        'flex w-full cursor-grab flex-col gap-0.5 rounded-xs border-l-[3px] bg-surface px-1.5 py-1 text-left active:cursor-grabbing',
        conflict && 'ring-1 ring-tijolo ring-inset',
        isDragging && 'opacity-30',
      )}
      style={{ borderLeftColor: db.sites[sites[0]!]?.color }}
    >
      {sites.map((s) => (
        <span key={s} className="font-mono text-[11px] font-semibold text-ink">
          {db.sites[s]?.code.slice(3)}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-line-2">
          <span className={cn('block h-full', over ? 'bg-tijolo' : 'bg-pinho/60')} style={{ width: `${Math.min(100, (riders / seats) * 100)}%` }} />
        </span>
        <span className={cn('font-mono text-[10.5px] tabular', over ? 'font-semibold text-tijolo-ink' : 'text-ink-3')}>
          {riders}/{seats}
        </span>
      </span>
    </button>
  )
}
