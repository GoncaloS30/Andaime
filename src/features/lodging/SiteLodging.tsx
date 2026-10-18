import { BedDouble, Hotel as HotelIcon, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { nightsBetween } from '@/domain/stays'
import type { Hotel, Site } from '@/domain/types'
import { dateShort } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { Field, Input, Textarea } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'
import { Photo } from '@/ui/Photo'
import { PhotoUpload } from '@/ui/PhotoUpload'
import { EmptyState } from '@/ui/States'

/** Hotéis da obra: opções onde a equipa pode ficar (não reservas), com o uso de cada um. */
export function SiteLodging({ site }: { site: Site }) {
  const data = useDerived(({ db }) => {
    const hotels = Object.values(db.hotels).filter((h) => h.siteId === site.id).sort((a, b) => a.name.localeCompare(b.name, 'pt'))
    const stays = Object.values(db.stays).filter((s) => s.siteId === site.id)
    return hotels.map((h) => {
      const mine = stays.filter((s) => s.hotelId === h.id)
      return { h, nights: mine.reduce((n, s) => n + nightsBetween(s.checkIn, s.checkOut), 0), last: mine.map((s) => s.checkOut).sort().at(-1) }
    })
  }, [site.id])
  const remove = useDemo((s) => s.removeHotel)
  const undo = useDemo((s) => s.undo)
  const [editing, setEditing] = useState<Hotel | 'novo' | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-3">Opções de alojamento quando a obra é longe de casa. Quem fica onde decide-se nas Dormidas, semana a semana.</p>
        <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing('novo')}>Acrescentar hotel</Button>
      </div>
      {data.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState icon={<HotelIcon />} title="Sem hotéis nesta obra" action={<Button variant="primary" onClick={() => setEditing('novo')}>Acrescentar hotel</Button>}>
            Acrescente os hotéis onde a equipa costuma ficar. Aparecem como opção nas Dormidas.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.map(({ h, nights, last }) => (
            <li key={h.id} className="flex gap-3 rounded-lg border border-line bg-surface p-3">
              <div className="w-32 shrink-0 space-y-1.5">
                <Photo photo={h.photo} format="viatura" sizes="128px" rounded="sm" fallback={<HotelIcon className="size-6 text-ink-4" aria-hidden />} />
                <PhotoUpload target={{ type: 'hotel', id: h.id }} current={h.photo} alt={`Fachada do ${h.name}`} label="Foto" compact />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{h.name}</h3>
                <p className="text-sm text-ink-2">{h.address || '—'}</p>
                {h.contact && <p className="flex items-center gap-1 text-sm text-ink-3"><Phone className="size-3.5" aria-hidden /> {h.contact}</p>}
                {h.notes && <p className="mt-1 text-xs text-ink-3">{h.notes}</p>}
                <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
                  <BedDouble className="size-3.5" aria-hidden />
                  {nights ? `${nights === 1 ? '1 noite' : `${nights} noites`} · última saída ${dateShort(last!)}` : 'Ainda sem estadias'}
                </p>
                <div className="mt-2 flex gap-1">
                  <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(h)}>Editar</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="size-3.5" />}
                    onClick={() => {
                      remove(h.id)
                      toast('Hotel removido', { description: 'As estadias neste hotel ficaram por definir.', action: { label: 'Anular', onClick: () => undo() } })
                    }}
                  >
                    Remover
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <HotelDialog site={site} hotel={editing === 'novo' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function HotelDialog({ site, hotel, onClose }: { site: Site; hotel: Hotel | null; onClose: () => void }) {
  const create = useDemo((s) => s.createHotel)
  const update = useDemo((s) => s.updateHotel)
  const [f, setF] = useState({ name: hotel?.name ?? '', address: hotel?.address ?? '', contact: hotel?.contact ?? '', notes: hotel?.notes ?? '' })
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    try {
      if (hotel) update(hotel.id, f)
      else create({ siteId: site.id, ...f })
      toast.success(hotel ? 'Hotel atualizado' : 'Hotel acrescentado', { description: `${site.code} · ${f.name}` })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível guardar o hotel.')
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow={`${site.code} · ${site.name}`}
      title={hotel ? 'Editar hotel' : 'Acrescentar hotel'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>{hotel ? 'Guardar' : 'Acrescentar'}</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Nome" error={error}>{(p) => <Input {...p} value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setError(null) }} />}</Field>
        <Field label="Morada">{(p) => <Input {...p} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />}</Field>
        <Field label="Contacto">{(p) => <Input {...p} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />}</Field>
        <Field label="Notas" optional>{(p) => <Textarea {...p} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />}</Field>
      </div>
    </Dialog>
  )
}
