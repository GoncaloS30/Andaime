import { Truck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import type { Assignment, ID, ISODate, Team } from '@/domain/types'
import { dateShort, dayShort, isWeekend } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { Field, Select } from '@/ui/Field'
import { Popover } from '@/ui/Menu'
import { usePlanning } from '../PlanningContext'
import { GRID_COLS } from './DayHeader'

/** Perspetiva por equipa: obra e viatura de cada equipa por dia. Clicar abre a edição desse dia. */
export function TeamRows() {
  const { db, days, today, filterTeam, query } = usePlanning()
  const q = query.trim().toLowerCase()
  const teams = Object.values(db.teams)
    .filter((t) => !filterTeam || t.id === filterTeam)
    .filter((t) => !q || t.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
  const byTeamDay = new Map<string, Assignment[]>()
  for (const a of Object.values(db.assignments)) {
    if (!a.teamId || !days.includes(a.date)) continue
    const k = `${a.teamId}|${a.date}`
    byTeamDay.set(k, [...(byTeamDay.get(k) ?? []), a])
  }
  return (
    <>
      {teams.map((t) => {
        const foreman = t.foremanId ? db.workers[t.foremanId] : undefined
        return (
          <div role="row" key={t.id} className={cn('grid', GRID_COLS)}>
            <div role="rowheader" className="sticky left-0 z-10 flex min-w-0 flex-col justify-center border-t border-line-2 bg-surface px-3 py-2">
              <Link to={`/equipas/${t.id}`} className="flex items-center gap-2 text-sm font-semibold text-ink hover:underline">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: t.color }} />
                <span className="truncate">{t.name}</span>
              </Link>
              <span className="truncate text-[11px] text-ink-3">
                {t.memberIds.length} elementos{foreman ? ` · ${foreman.name}` : ' · sem responsável'}
              </span>
            </div>
            {days.map((d) => (
              <TeamDayCell key={d} team={t} date={d} list={byTeamDay.get(`${t.id}|${d}`) ?? []} today={d === today} />
            ))}
          </div>
        )
      })}
    </>
  )
}

function TeamDayCell({ team, date, list, today }: { team: Team; date: ISODate; list: Assignment[]; today: boolean }) {
  const { db, conflictsByAssignment } = usePlanning()
  const bulkUpdate = useDemo((s) => s.bulkUpdate)
  const undo = useDemo((s) => s.undo)
  const [open, setOpen] = useState(false)
  const bySite = new Map<ID, Assignment[]>()
  for (const a of list) bySite.set(a.siteId, [...(bySite.get(a.siteId) ?? []), a])
  const groups = [...bySite.entries()].sort((a, b) => b[1].length - a[1].length)
  const main = groups[0]
  const [site, setSite] = useState(main?.[0] ?? team.siteId ?? '')
  const vehicleId = list.find((a) => a.vehicleId)?.vehicleId ?? ''
  const [vehicle, setVehicle] = useState(vehicleId)
  const hasConflict = list.some((a) => conflictsByAssignment.has(a.id))

  const apply = () => {
    const ids = list.map((a) => a.id)
    const patch: { siteId?: ID; vehicleId?: ID | null } = {}
    if (site && site !== main?.[0]) patch.siteId = site
    if (vehicle !== vehicleId) patch.vehicleId = vehicle || null
    if (Object.keys(patch).length) {
      bulkUpdate(ids, patch)
      toast.success(`Equipa ${team.name} atualizada em ${dayShort(date)} ${dateShort(date)}`, { action: { label: 'Anular', onClick: () => undo() } })
    }
    setOpen(false)
  }

  return (
    <div className={cn('border-t border-l border-line-2 p-1', today && 'bg-lima-soft/35', isWeekend(date) && 'bg-line-2/45')}>
      {list.length === 0 ? (
        <span className="block py-2 text-center text-xs text-ink-4">·</span>
      ) : (
        <Popover
          open={open}
          onOpenChange={setOpen}
          label={`Editar ${team.name} em ${date}`}
          trigger={
            <button
              type="button"
              className={cn(
                'flex w-full flex-col gap-0.5 rounded-xs border-l-[3px] bg-surface px-1.5 py-1 text-left hover:bg-cal',
                hasConflict && 'ring-1 ring-tijolo ring-inset',
              )}
              style={{ borderLeftColor: main ? db.sites[main[0]]?.color : undefined }}
              aria-label={`${team.name}, ${dayShort(date)}: ${groups.map(([sid, l]) => `${db.sites[sid]?.code} ${l.length} pessoas`).join(', ')}${hasConflict ? ', com conflito' : ''}. Editar.`}
            >
              {groups.map(([sid, l]) => (
                <span key={sid} className="flex items-center justify-between font-mono text-[11px] font-semibold text-ink">
                  {db.sites[sid]?.code.slice(3)}
                  <span className="font-normal text-ink-3">{l.length}p</span>
                </span>
              ))}
              {vehicleId && (
                <span className="flex items-center gap-1 text-[10.5px] text-ink-3">
                  <Truck aria-hidden className="size-3" /> {db.vehicles[vehicleId]?.plate}
                </span>
              )}
            </button>
          }
        >
          <p className="font-wide text-sm font-semibold">
            {team.name} · {dayShort(date)} {dateShort(date)}
          </p>
          <p className="mb-3 text-xs text-ink-3">Aplica-se às {list.length} atribuições da equipa neste dia.</p>
          <div className="flex flex-col gap-3">
            <Field label="Obra">
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
            <Field label="Viatura">
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
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" onClick={apply}>
                Aplicar ao dia
              </Button>
            </div>
          </div>
        </Popover>
      )}
    </div>
  )
}
