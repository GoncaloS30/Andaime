import { PackageCheck, Shirt } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { findItemByName } from '@/domain/equipment'
import { BOOT_SIZES, CLOTHING_SIZES, GLOVE_SIZES, TROUSER_SIZES } from '@/domain/labels'
import type { EquipmentKind, ID, SizeKind, Sizes } from '@/domain/types'
import { demoStore, useDemo } from '@/store/store'
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
const NEW = '__novo'
const KIND_OPTIONS: [EquipmentKind, string][] = [['fardamento', 'Fardamento'], ['epi', 'EPI'], ['ferramenta', 'Ferramenta']]
const SIZE_KIND_OPTIONS: [string, string][] = [['', 'Sem tamanho'], ['roupa', 'Roupa (XS–3XL)'], ['calcas', 'Calças (36–56)'], ['botas', 'Botas (36–48)'], ['luvas', 'Luvas (7–11)']]
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
  const addItem = useDemo((s) => s.addEquipmentItem)
  const [wid, setWid] = useState(workerId ?? '')
  const [iid, setIid] = useState(itemId ?? '')
  const [draft, setDraft] = useState({ name: '', kind: 'epi' as EquipmentKind, sizeKind: '' as string, stock: 5 })
  const creating = iid === NEW
  const match = creating && draft.name.trim() ? findItemByName(db.equipment, draft.name) : null
  const newItem = creating && !match ? { kind: draft.kind, sizeKind: (draft.sizeKind || null) as SizeKind, stock: draft.stock, name: draft.name } : null
  const item = creating ? (match ?? newItem) : db.equipment[iid]
  const worker = db.workers[wid]
  const fromSheet = item?.sizeKind && worker ? (worker.sizes[SIZE_FIELD[item.sizeKind]] ?? '') : ''
  const [size, setSize] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const effectiveSize = size ?? fromSheet
  const noStock = !!item && item.stock < qty
  const missingName = creating && !draft.name.trim()

  const save = () => {
    try {
      let itemId = iid
      if (creating) {
        const r = addItem({ name: draft.name, kind: draft.kind, sizeKind: (draft.sizeKind || null) as SizeKind, stock: draft.stock })
        itemId = r.id
        if (r.existed) toast.info(`${demoStore.getState().db.equipment[r.id]?.name} já estava no catálogo`, { description: 'Usámos o artigo que já existia.' })
      }
      record({ workerId: wid, itemId, size: effectiveSize, qty, date: today, note })
      const after = demoStore.getState().db.equipment[itemId]
      toast.success(`Entrega registada: ${after?.name}`, { description: `${worker?.name}${effectiveSize ? ` · tamanho ${effectiveSize}` : ''} · stock ${after?.stock}` })
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
          <Button variant="primary" icon={<PackageCheck className="size-4" />} disabled={!wid || !iid || qty < 1 || noStock || missingName} onClick={save} data-tour="save-delivery">
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
              <option value={NEW}>+ Novo artigo no catálogo…</option>
            </Select>
          )}
        </Field>
        {!creating && db.equipment[iid] && (
          <div className="flex items-center gap-3 sm:col-span-2">
            <Photo photo={db.equipment[iid]!.photo} format="artigo" sizes="64px" rounded="sm" className="w-16" fallback={<Shirt className="size-5 text-ink-4" aria-hidden />} />
            <p className="text-sm">
              <span className="block font-semibold">{db.equipment[iid]!.name}</span>
              <span className="text-ink-3">{db.equipment[iid]!.stock} em stock{db.equipment[iid]!.serial ? ` · série ${db.equipment[iid]!.serial}` : ''}</span>
            </p>
          </div>
        )}
        {creating && (
          <fieldset className="grid gap-4 rounded-md border border-line bg-cal p-3 sm:col-span-2 sm:grid-cols-2">
            <legend className="px-1 text-xs font-medium text-ink-2">Novo artigo</legend>
            <Field label="Nome" className="sm:col-span-2" hint={match ? `Já existe no catálogo: ${match.name} (stock ${match.stock}). Vai ser usado esse.` : 'Fica no catálogo do armazém para as próximas entregas.'}>
              {(p) => <Input {...p} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Joelheiras de gel" />}
            </Field>
            {!match && (
              <>
                <Field label="Tipo">
                  {(p) => (
                    <Select {...p} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as EquipmentKind })}>
                      {KIND_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Tamanhos">
                  {(p) => (
                    <Select {...p} value={draft.sizeKind} onChange={(e) => { setDraft({ ...draft, sizeKind: e.target.value }); setSize(null) }}>
                      {SIZE_KIND_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Stock inicial" hint="Inclui o que vai ser entregue agora.">
                  {(p) => <Input {...p} type="number" min={0} max={999} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: Math.max(0, Number(e.target.value)) })} />}
                </Field>
              </>
            )}
          </fieldset>
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
