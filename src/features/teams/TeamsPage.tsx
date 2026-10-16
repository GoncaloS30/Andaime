import { Plus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useDerived } from '@/app/hooks'
import { ModuleGuard } from '@/app/ModuleGuard'
import { availability } from '@/domain/availability'
import { buildIndex } from '@/domain/indexes'
import { weekDays, weekStart } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { PhotoStack } from '@/ui/Avatar'
import { Badge, Plate, SiteCode } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { PageHeader } from '@/ui/Layout'
import { TeamForm } from './TeamForm'

export function TeamsPage() {
  const [creating, setCreating] = useState(false)
  const rows = useDerived(({ db, session }) => {
    const idx = buildIndex(db)
    const days = weekDays(weekStart(session.today)).slice(0, 5)
    return Object.values(db.teams)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => {
        const members = t.memberIds.map((m) => db.workers[m]!).filter(Boolean)
        const absent = members.filter((m) => availability(m, session.today, idx).state === 'ausente').length
        const freeDays = members.reduce((s, m) => s + days.filter((d) => availability(m, d, idx).state === 'livre').length, 0)
        return { t, members, absent, freeDays, site: t.siteId ? db.sites[t.siteId] : undefined, vehicle: t.vehicleId ? db.vehicles[t.vehicleId] : undefined, foreman: t.foremanId ? db.workers[t.foremanId] : undefined }
      })
  })
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title="Equipas"
        description={`${rows.length} equipas · ${rows.reduce((s, r) => s + r.members.length, 0)} trabalhadores em equipa`}
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Nova equipa</Button>}
      />
      <ModuleGuard empty={{ icon: <UsersRound />, title: 'Ainda não há equipas', text: 'Agrupe trabalhadores com um responsável e uma viatura para planear mais depressa.' }}>
        <ul className="overflow-hidden rounded-lg border border-line bg-surface">
          {rows.map(({ t, members, absent, freeDays, site, vehicle, foreman }) => (
            <li key={t.id} className="border-b border-line-2 last:border-0">
              <Link to={`/equipas/${t.id}`} className="grid items-center gap-3 border-l-4 px-4 py-3 transition-colors hover:bg-cal md:grid-cols-[1.3fr_1.4fr_1fr_1fr_0.9fr]" style={{ borderLeftColor: t.color }}>
                <span className="min-w-0">
                  <span className="block font-wide text-base font-semibold">{t.name}</span>
                  <span className="block truncate text-xs text-ink-3">{foreman ? `Responsável: ${foreman.name}` : 'Sem responsável'}</span>
                </span>
                <span className="flex items-center gap-2">
                  <PhotoStack people={members.map((m) => ({ ...m, color: t.color }))} max={5} />
                  <span className="text-xs text-ink-3">{members.length} elementos</span>
                </span>
                <span>{site ? <><SiteCode code={site.code} color={site.color} /><span className="block truncate text-xs text-ink-3">{site.name}</span></> : <span className="text-xs text-ink-3">Sem obra</span>}</span>
                <span>
                  {vehicle ? (
                    <span className="flex items-center gap-2">
                      <Plate plate={vehicle.plate} />
                      <span className={cn('text-xs tabular', members.length > vehicle.seats ? 'font-semibold text-tijolo-ink' : 'text-ink-3')}>
                        {members.length}/{vehicle.seats} lugares
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-ink-3">Sem viatura</span>
                  )}
                </span>
                <span className="flex flex-wrap gap-1">
                  {absent > 0 && <Badge tone="danger" dot>{absent} ausente{absent > 1 ? 's' : ''} hoje</Badge>}
                  {freeDays > 0 && <Badge tone="ok" dot>{freeDays} dias livres</Badge>}
                  {!absent && !freeDays && <Badge dot>Semana planeada</Badge>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </ModuleGuard>
      {creating && <TeamForm open onOpenChange={setCreating} />}
    </div>
  )
}
