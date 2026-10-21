import { BedDouble, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, IconButton } from '@/ui/Button'
import { Field, Input, Textarea } from '@/ui/Field'
import { Panel } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { errorMessage, isApiError } from '../../api/http'
import { nightsLabel, useHotels, useRemoveHotel, useSaveHotel, type Hotel } from '../../api/lodging'
import { formatDate } from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { FormError } from '../auth/AuthLayout'

/** Separador "Alojamento" da ficha da obra: hotéis da obra e o uso de cada um (gestor). */
export function SiteLodging({ siteId, archived }: { siteId: string; archived: boolean }) {
  const org = useActiveOrg()
  const hotels = useHotels(org.id, siteId)
  const remove = useRemoveHotel(org.id)
  const [editing, setEditing] = useState<Hotel | 'new' | null>(null)
  const [removing, setRemoving] = useState<Hotel | null>(null)

  return (
    <Panel
      title="Hotéis da obra"
      description="Onde a equipa dorme. Remover um hotel não apaga estadias: as que ainda não terminaram ficam com o hotel por definir."
      actions={
        !archived && (
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Novo hotel
          </Button>
        )
      }
      flush
    >
      {hotels.isPending ? (
        <SkeletonRows rows={3} />
      ) : hotels.isError ? (
        <ErrorState onRetry={() => void hotels.refetch()} />
      ) : hotels.data.length === 0 ? (
        <EmptyState compact icon={<BedDouble />} title="Sem hotéis nesta obra">
          Acrescente os hotéis onde a equipa costuma ficar; aparecem logo nas Dormidas.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line-2">
          {hotels.data.map((h) => (
            <li key={h.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{h.name}</p>
                <p className="text-ink-3">{[h.address, h.contact].filter(Boolean).join(' · ') || 'Sem morada nem contacto'}</p>
                {h.notes && <p className="mt-0.5 text-xs text-ink-3">{h.notes}</p>}
              </div>
              <div className="text-right text-xs text-ink-3">
                <p className="text-sm text-ink-2 tabular">{nightsLabel(h.nights)}</p>
                <p>{h.lastCheckIn ? `Última entrada ${formatDate(h.lastCheckIn)}` : 'Ainda sem estadias'}</p>
              </div>
              {!archived && (
                <div className="flex gap-1">
                  <IconButton label={`Editar ${h.name}`} size="sm" onClick={() => setEditing(h)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton label={`Remover ${h.name}`} size="sm" onClick={() => setRemoving(h)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <HotelDialog siteId={siteId} hotel={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {removing && (
        <Dialog
          open
          onOpenChange={(open) => !open && setRemoving(null)}
          title={`Remover ${removing.name}?`}
          description="As estadias que ainda não terminaram passam a ter o hotel por definir; as passadas guardam o hotel no histórico."
          footer={
            <>
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(removing.id, {
                    onSuccess: () => (toast.success('Hotel removido'), setRemoving(null)),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                Remover hotel
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-2">{nightsLabel(removing.nights)} registadas neste hotel.</p>
        </Dialog>
      )}
    </Panel>
  )
}

function HotelDialog({ siteId, hotel, onClose }: { siteId: string; hotel?: Hotel; onClose: () => void }) {
  const org = useActiveOrg()
  const save = useSaveHotel(org.id, hotel?.id)
  const [name, setName] = useState(hotel?.name ?? '')
  const [address, setAddress] = useState(hotel?.address ?? '')
  const [contact, setContact] = useState(hotel?.contact ?? '')
  const [notes, setNotes] = useState(hotel?.notes ?? '')
  const [touched, setTouched] = useState(false)
  const nameError = name.trim().length < 2 ? 'Indique o nome do hotel.' : null
  const server = save.error && isApiError(save.error) ? save.error.fieldErrors : {}

  const submit = () => {
    setTouched(true)
    if (nameError) return
    save.mutate(
      { siteId: hotel ? undefined : siteId, name: name.trim(), address: address.trim(), contact: contact.trim(), notes: notes.trim(), version: hotel?.version },
      { onSuccess: () => (toast.success(hotel ? 'Hotel atualizado' : 'Hotel acrescentado'), onClose()) },
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={hotel ? `Editar ${hotel.name}` : 'Novo hotel'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {hotel ? 'Guardar' : 'Acrescentar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormError message={save.error && !Object.keys(server).length ? errorMessage(save.error) : null} />
        <Field label="Nome" error={(touched ? nameError : null) ?? server.name ?? null}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Morada" optional error={server.address}>
          {(p) => <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} />}
        </Field>
        <Field label="Contacto" optional hint="Telefone ou email da receção." error={server.contact}>
          {(p) => <Input {...p} value={contact} onChange={(e) => setContact(e.target.value)} />}
        </Field>
        <Field label="Notas" optional error={server.notes}>
          {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}
