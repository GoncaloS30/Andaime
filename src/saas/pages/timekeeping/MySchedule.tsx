import { Car, HardHat, MapPin, Users } from 'lucide-react'
import { Panel } from '@/ui/Layout'
import { EmptyState, SkeletonRows } from '@/ui/States'
import { useMyAssignments, type MyAssignment } from '../../api/planning'
import { addDaysIso, todayIso } from '../../api/workforce'
import { useActiveOrg } from '../../session'

const DAY = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'short' })
const dayLabel = (iso: string, today: string) =>
  iso === today ? 'Hoje' : iso === addDaysIso(today, 1) ? 'Amanhã' : DAY.format(new Date(`${iso}T12:00:00`))

function mapsUrl(a: MyAssignment) {
  const s = a.site
  const q = s.latitude != null && s.longitude != null ? `${s.latitude},${s.longitude}` : [s.address, s.city].filter(Boolean).join(', ')
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
}

/** "Os meus dias": hoje e os próximos 13 dias, com a obra, o horário, a viatura, o encarregado e os colegas. */
export function MySchedule() {
  const org = useActiveOrg()
  const today = todayIso()
  const days = useMyAssignments(org.id, today, addDaysIso(today, 13))

  return (
    <Panel title="Os meus dias" description="Onde vai trabalhar hoje e nos próximos dias.">
      {days.isPending ? (
        <SkeletonRows rows={3} />
      ) : (days.data ?? []).length === 0 ? (
        <EmptyState compact icon={<HardHat />} title="Sem trabalho marcado">
          Quando lhe atribuírem uma obra, aparece aqui.
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-3">
          {days.data!.map((a) => {
            const maps = mapsUrl(a)
            const isToday = a.date === today
            return (
              <li key={a.id} className={isToday ? 'rounded-md border-l-4 border-pinho bg-lima-soft/40 p-3' : 'rounded-md border border-line p-3'}>
                <p className="text-xs font-semibold text-ink-3 uppercase">{dayLabel(a.date, today)}</p>
                <p className="mt-0.5 flex items-center gap-2 font-semibold">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-xs" style={{ background: a.site.color }} />
                  <span className="font-mono text-xs">{a.site.code}</span> {a.site.name}
                </p>
                <p className="mt-1 font-mono text-sm tabular">
                  {a.start.slice(0, 5)}–{a.end.slice(0, 5)}
                  {a.foreman && <span className="ml-2 font-sans text-xs text-pinho">Encarregado do dia</span>}
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-2">
                  {(a.site.address || a.site.city) && (
                    <li className="flex items-start gap-1.5">
                      <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {maps ? (
                        <a href={maps} target="_blank" rel="noopener noreferrer" className="text-pinho underline-offset-2 hover:underline">
                          {[a.site.address, a.site.city].filter(Boolean).join(', ')}
                          <span className="sr-only"> (abre o mapa noutro separador)</span>
                        </a>
                      ) : (
                        [a.site.address, a.site.city].filter(Boolean).join(', ')
                      )}
                    </li>
                  )}
                  {a.vehicle && (
                    <li className="flex items-center gap-1.5">
                      <Car className="size-4 shrink-0" aria-hidden />
                      <span className="font-mono">{a.vehicle.plate}</span>
                      {(a.vehicle.make || a.vehicle.model) && <span>· {[a.vehicle.make, a.vehicle.model].filter(Boolean).join(' ')}</span>}
                    </li>
                  )}
                  {a.foremanName && (
                    <li className="flex items-center gap-1.5">
                      <HardHat className="size-4 shrink-0" aria-hidden /> Encarregado: {a.foremanName}
                    </li>
                  )}
                  {a.colleagues.length > 0 && (
                    <li className="flex items-start gap-1.5">
                      <Users className="mt-0.5 size-4 shrink-0" aria-hidden /> Com {a.colleagues.join(', ')}
                    </li>
                  )}
                  {a.note && <li className="text-ink-3">{a.note}</li>}
                </ul>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
