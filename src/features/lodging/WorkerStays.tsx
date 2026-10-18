import { BedDouble, MapPin, Phone } from 'lucide-react'
import { Link } from 'react-router'
import { useDerived } from '@/app/hooks'
import { nightsBetween } from '@/domain/stays'
import type { ID } from '@/domain/types'
import { dateShort, isoWeek, weekStart } from '@/domain/weeks'
import { SiteCode } from '@/ui/Badge'
import { Photo } from '@/ui/Photo'
import { EmptyState } from '@/ui/States'

/** Histórico de estadias de um trabalhador, das mais recentes para trás. */
export function WorkerStays({ id }: { id: ID }) {
  const list = useDerived(({ db }) =>
    Object.values(db.stays)
      .filter((s) => s.workerId === id)
      .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
      .map((s) => ({ s, site: db.sites[s.siteId], hotel: s.hotelId ? db.hotels[s.hotelId] : undefined })),
    [id],
  )
  if (list.length === 0) return <EmptyState compact icon={<BedDouble />} title="Sem estadias">Quando dormir fora em obra, as estadias aparecem aqui.</EmptyState>
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="table-a min-w-[640px]">
        <thead>
          <tr><th scope="col">Semana</th><th scope="col">Obra</th><th scope="col">Hotel</th><th scope="col">Período</th><th scope="col" className="num">Noites</th></tr>
        </thead>
        <tbody>
          {list.map(({ s, site, hotel }) => (
            <tr key={s.id}>
              <td className="tabular">Sem. {isoWeek(s.week)}</td>
              <td>{site && <Link to={`/obras/${site.id}?tab=alojamento`} className="hover:underline"><SiteCode code={site.code} color={site.color} /></Link>}</td>
              <td>{hotel?.name ?? <span className="text-ambar-ink">Por definir</span>}</td>
              <td className="text-sm">{dateShort(s.checkIn)} → {dateShort(s.checkOut)}</td>
              <td className="num tabular">{nightsBetween(s.checkIn, s.checkOut)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Cartão da app do trabalhador: onde dorme esta semana. Não aparece se não dormir fora. */
export function WhereISleep({ workerId, today }: { workerId: ID; today: string }) {
  const items = useDerived(({ db }) =>
    Object.values(db.stays)
      .filter((s) => s.workerId === workerId && s.week === weekStart(today))
      .map((s) => ({ s, site: db.sites[s.siteId], hotel: s.hotelId ? db.hotels[s.hotelId] : undefined })),
    [workerId, today],
  )
  if (items.length === 0) return null
  return (
    <section aria-label="Onde durmo esta semana" className="rounded-lg border border-line bg-surface p-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><BedDouble className="size-4" aria-hidden /> Onde durmo esta semana</h2>
      {items.map(({ s, site, hotel }) => {
        const n = nightsBetween(s.checkIn, s.checkOut)
        return (
          <div key={s.id} className="flex gap-3">
            {hotel?.photo && <Photo photo={hotel.photo} format="viatura" alt="" sizes="96px" rounded="sm" className="w-24" fallback={null} />}
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{hotel?.name ?? 'Hotel por confirmar'}</p>
              {hotel?.address && <p className="flex items-center gap-1 text-ink-2"><MapPin className="size-3.5" aria-hidden /> {hotel.address}</p>}
              {hotel?.contact && <p className="flex items-center gap-1 text-ink-3"><Phone className="size-3.5" aria-hidden /> <a href={`tel:${hotel.contact.replace(/\s/g, '')}`} className="underline">{hotel.contact}</a></p>}
              <p className="mt-1 text-ink-2">{dateShort(s.checkIn)} → {dateShort(s.checkOut)} · {n === 1 ? '1 noite' : `${n} noites`} · {site?.name}</p>
            </div>
          </div>
        )
      })}
    </section>
  )
}
