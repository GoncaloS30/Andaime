import { PackageCheck, Shirt } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { BOOT_SIZES, CLOTHING_SIZES, GLOVE_SIZES, TROUSER_SIZES } from '@/domain/labels'
import type { ID, SizeKind, Sizes } from '@/domain/types'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'
import { Photo } from '@/ui/Photo'

export const SIZE_OPTIONS: Record<Exclude<SizeKind, null>, string[]> = {
  roupa: CLOTHING_SIZES,
  calcas: TROUSER_SIZES,
  botas: BOOT_SIZES,
  luvas: GLOVE_SIZES,
}
const SIZE_FIELD: Record<Exclude<SizeKind, null>, keyof Sizes> = { roupa: 'tshirt', calcas: 'calcas', botas: 'botas', luvas: 'luvas' }

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  workerId?: ID
  itemId?: ID
}

/** Fluxo 7 — registar a entrega de fardamento, EPI ou ferramenta, com o tamanho da ficha. */
export function DeliveryDialog({ open, onOpenChange, workerId, itemId }: Props) {
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const record = useDemo((s) => s.recordDelivery)
  const [wid, setWid] = useState(workerId ?? '')
  const [iid, setIid] = useState(itemId ?? '')
  const item = db.equipment[iid]
  const worker = db.workers[wid]
  const fromSheet = item?.sizeKind && worker ? (worker.sizes[SIZE_FIELD[item.sizeKind]] ?? '') : ''
  const [size, setSize] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const effectiveSize = size ?? fromSheet
  const noStock = !!item && item.stock < qty

  const save = () => {
    try {
      record({ workerId: wid, itemId: iid, size: effectiveSize, qty, date: today, note })
      toast.success(`Entrega registada: ${item?.name}`, { description: `${worker?.name}${effectiveSize ? ` · tamanho ${effectiveSize}` : ''} · stock ${item!.stock - qty}` })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível registar.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Registar entrega"
      description="O artigo sai do armazém e fica no histórico do trabalhador."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<PackageCheck className="size-4" />} disabled={!wid || !iid || qty < 1 || noStock} onClick={save} data-tour="save-delivery">
            Registar entrega
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!workerId && (
          <Field label="Trabalhador" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={wid} onChange={(e) => setWid(e.target.value)}>
                <option value="">Escolher…</option>
                {Object.values(db.workers).sort((a, b) => a.name.localeCompare(b.name)).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Artigo" className="sm:col-span-2" error={noStock ? `Só há ${item?.stock} em stock.` : null}>
          {(p) => (
            <Select {...p} value={iid} onChange={(e) => { setIid(e.target.value); setSize(null) }}>
              <option value="">Escolher…</option>
              {(['fardamento', 'epi', 'ferramenta'] as const).map((k) => (
                <optgroup key={k} label={{ fardamento: 'Fardamento', epi: 'EPI', ferramenta: 'Ferramentas' }[k]}>
                  {Object.values(db.equipment).filter((e) => e.kind === k).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · stock {e.stock}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          )}
        </Field>
        {item && (
          <div className="flex items-center gap-3 sm:col-span-2">
            <Photo photo={item.photo} format="artigo" sizes="64px" rounded="sm" className="w-16" fallback={<Shirt className="size-5 text-ink-4" aria-hidden />} />
            <p className="text-sm">
              <span className="block font-semibold">{item.name}</span>
              <span className="text-ink-3">{item.stock} em stock{item.serial ? ` · série ${item.serial}` : ''}</span>
            </p>
          </div>
        )}
        {item?.sizeKind && (
          <Field label="Tamanho" hint={fromSheet ? `Da ficha do trabalhador: ${fromSheet}` : 'Sem tamanho na ficha.'}>
            {(p) => (
              <Select {...p} value={effectiveSize} onChange={(e) => setSize(e.target.value)}>
                <option value="">—</option>
                {SIZE_OPTIONS[item.sizeKind!].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Quantidade">{(p) => <Input {...p} type="number" min={1} max={10} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />}</Field>
        <Field label="Nota" optional className="sm:col-span-2">
          {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} placeholder={item?.kind === 'ferramenta' ? 'N.º de série' : ''} />}
        </Field>
      </div>
    </Dialog>
  )
}
