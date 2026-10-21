import { BedDouble, MapPin, Phone } from 'lucide-react'
import { SiteCode } from '@/ui/Badge'
import { Panel } from '@/ui/Layout'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { nightsLabel, useEmployeeStays, useMyStays } from '../../api/lodging'
import { mondayOf } from '../../api/planning'
import { formatDate, todayIso } from '../../api/workforce'
import { useActiveOrg } from '../../session'

const LONG = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
const longDate = (iso: string) => LONG.format(new Date(`${iso}T00:00:00Z`))

const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

/** App do trabalhador: "Onde durmo esta semana". Não aparece quando não há estadia marcada. */
export function MyStaysCard() {
  const org = useActiveOrg()
  const stays = useMyStays(org.id, mondayOf(todayIso()))
  if (!stays.data || stays.data.length === 0) return null
  return (
    <Panel title="Onde durmo esta semana">
      <ul className="flex flex-col gap-3">
        {stays.data.map((s) => (
          <li key={s.id} className="rounded-md border border-line p-3">
            <p className="flex items-center gap-2 font-semibold">
              <BedDouble className="size-4 shrink-0 text-pinho" aria-hidden />
              {s.hotelName ?? 'Hotel por definir'}
            </p>
            <p className="mt-1 text-sm text-ink-2">
              Entrada {longDate(s.checkIn)} · saída {longDate(s.checkOut)} · {nightsLabel(s.nights)}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
              <SiteCode code={s.siteCode} color={s.siteColor} /> {s.siteName}
            </p>
            {(s.hotelAddress || s.hotelContact) && (
              <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-2">
                {s.hotelAddress && (
                  <li className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <a href={mapsUrl(s.hotelAddress)} target="_blank" rel="noopener noreferrer" className="text-pinho underline-offset-2 hover:underline">
                      {s.hotelAddress}
                      <span className="sr-only"> (abre o mapa noutro separador)</span>
                    </a>
                  </li>
                )}
                {s.hotelContact && (
                  <li className="flex items-center gap-1.5">
                    <Phone className="size-4 shrink-0" aria-hidden /> {s.hotelContact}
                  </li>
                )}
              </ul>
            )}
            {!s.hotelId && <p className="mt-2 text-xs text-ink-3">O escritório ainda está a tratar do hotel. Recebe um aviso quando estiver marcado.</p>}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** Ficha do trabalhador: histórico de estadias (mais recentes primeiro). */
export function EmployeeStays({ employeeId }: { employeeId: string }) {
  const org = useActiveOrg()
  const stays = useEmployeeStays(org.id, employeeId)
  const total = stays.data?.reduce((n, s) => n + s.nights, 0) ?? 0
  return (
    <Panel title="Estadias" description={stays.data?.length ? `${nightsLabel(total)} em ${stays.data.length === 1 ? '1 estadia' : `${stays.data.length} estadias`}` : undefined} flush>
      {stays.isPending ? (
        <SkeletonRows rows={3} />
      ) : stays.isError ? (
        <ErrorState onRetry={() => void stays.refetch()} />
      ) : stays.data.length === 0 ? (
        <EmptyState compact icon={<BedDouble />} title="Sem estadias marcadas" />
      ) : (
        <ul className="divide-y divide-line-2">
          {stays.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <SiteCode code={s.siteCode} color={s.siteColor} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{s.hotelName ?? 'Hotel por definir'}</span>
                <span className="block text-xs text-ink-3">{s.siteName}</span>
              </span>
              <span className="text-ink-3 tabular">
                {formatDate(s.checkIn)} → {formatDate(s.checkOut)}
              </span>
              <span className="w-20 text-right tabular text-ink-2">{nightsLabel(s.nights)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
