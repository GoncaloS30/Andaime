import { ArrowDownToLine, HardHat, PackagePlus, Plus, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { errorMessage } from '../../api/http'
import {
  CATEGORY_LABEL,
  MOVEMENT_LABEL,
  UNIT_STATUS_LABEL,
  useEquipmentAction,
  useEquipmentItems,
  useEquipmentUnits,
  useHoldings,
  useMovements,
  type EquipmentCategory,
  type EquipmentItem,
} from '../../api/operations'
import { useEmployeeOptions } from '../../api/workforce'
import { useActiveOrg } from '../../session'

type Mode = 'receive' | 'adjust' | 'deliver' | 'return'

/** Fardamento, EPI e ferramentas: stock, entregas e devoluções com registo de movimentos. */
export function EquipmentPage() {
  const org = useActiveOrg()
  const items = useEquipmentItems(org.id)
  const movements = useMovements(org.id)
  const employees = useEmployeeOptions(org.id)
  const [creating, setCreating] = useState(false)
  const [moving, setMoving] = useState<{ mode: Mode; item?: EquipmentItem; employeeId?: string } | null>(null)
  const [holder, setHolder] = useState('')
  const holdings = useHoldings(org.id, holder || null)

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title="Fardamento e EPI"
        description="Cada entrada, entrega e devolução fica registada. O stock nunca fica negativo."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button icon={<ArrowDownToLine className="size-4" />} onClick={() => setMoving({ mode: 'deliver' })}>
              Entregar
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Novo artigo
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel flush title="Artigos">
          {items.isPending ? (
            <SkeletonRows rows={6} />
          ) : items.isError ? (
            <ErrorState onRetry={() => void items.refetch()}>{errorMessage(items.error)}</ErrorState>
          ) : items.data.length === 0 ? (
            <EmptyState icon={<HardHat />} title="Sem artigos" action={<Button variant="primary" onClick={() => setCreating(true)}>Criar artigo</Button>}>
              Registe botas, coletes, capacetes e ferramentas para controlar o stock e o que cada pessoa tem.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-3">
                    <th className="px-4 py-2 font-semibold">Artigo</th>
                    <th className="px-2 py-2 text-right font-semibold">Em armazém</th>
                    <th className="px-2 py-2 text-right font-semibold">Entregues</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.data.map((i) => (
                    <tr key={i.id} className="border-b border-line-2 last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-ink">{i.name}</span>
                        {i.size && <span className="text-ink-3"> · {i.size}</span>}
                        <span className="block text-xs text-ink-3">
                          {CATEGORY_LABEL[i.category]} · {i.tracking === 'SERIAL' ? 'com número de série' : 'por quantidade'}
                        </span>
                      </td>
                      <td className={cn('px-2 text-right tabular', i.low && 'font-semibold text-tijolo')}>
                        {i.onHand} {i.low && <Badge tone="danger">abaixo de {i.minStock}</Badge>}
                      </td>
                      <td className="px-2 text-right tabular">{i.assigned}</td>
                      <td className="px-4 text-right">
                        <span className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" icon={<PackagePlus className="size-4" />} onClick={() => setMoving({ mode: 'receive', item: i })}>
                            Entrada
                          </Button>
                          {i.tracking === 'STOCK' && (
                            <Button size="sm" variant="ghost" onClick={() => setMoving({ mode: 'adjust', item: i })}>
                              Acerto
                            </Button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Com quem está">
            <Select aria-label="Trabalhador" value={holder} onChange={(e) => setHolder(e.target.value)}>
              <option value="">Escolha um trabalhador…</option>
              {(employees.data?.items ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </Select>
            {holder && (
              <div className="mt-3">
                {holdings.isPending ? (
                  <SkeletonRows rows={2} />
                ) : (holdings.data ?? []).length === 0 ? (
                  <p className="text-sm text-ink-3">Não tem nada em seu poder.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {holdings.data!.map((h) => (
                      <li key={h.itemId} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          <span className="font-semibold">{h.quantity}×</span> {h.itemName}
                          {h.size && ` (${h.size})`}
                          {h.serials.length > 0 && <span className="text-ink-3"> · {h.serials.join(', ')}</span>}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Undo2 className="size-4" />}
                          onClick={() => setMoving({ mode: 'return', item: items.data?.find((i) => i.id === h.itemId), employeeId: holder })}
                        >
                          Devolver
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Panel>
          <Panel title="Últimos movimentos" flush>
            {(movements.data ?? []).length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-3">Sem movimentos.</p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-line-2 overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-pinho/30" tabIndex={0} aria-label="Últimos movimentos">
                {movements.data!.map((m) => (
                  <li key={m.id} className="px-4 py-2 text-sm">
                    <span className="font-semibold">{MOVEMENT_LABEL[m.kind]}</span> · {m.quantity}× {m.itemName}
                    {m.serial && ` (${m.serial})`}
                    {m.employeeName && <span> · {m.employeeName}</span>}
                    <span className="block text-xs text-ink-3">
                      {new Date(m.occurredAt).toLocaleString('pt-PT')} · {m.userName}
                      {m.note && ` · ${m.note}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
      {creating && <NewItemDialog onClose={() => setCreating(false)} />}
      {moving && <MovementDialog key={`${moving.mode}-${moving.item?.id ?? ''}`} {...moving} items={items.data ?? []} onClose={() => setMoving(null)} />}
    </div>
  )
}

function NewItemDialog({ onClose }: { onClose: () => void }) {
  const org = useActiveOrg()
  const action = useEquipmentAction(org.id)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<EquipmentCategory>('PPE')
  const [tracking, setTracking] = useState<'STOCK' | 'SERIAL'>('STOCK')
  const [size, setSize] = useState('')
  const [minStock, setMinStock] = useState('0')
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Novo artigo"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={name.trim().length < 2}
            loading={action.isPending}
            onClick={() =>
              action.mutate(
                { action: 'create', name: name.trim(), category, tracking, size: size.trim() || undefined, minStock: Number(minStock) || 0 },
                { onSuccess: () => (toast.success('Artigo criado'), onClose()), onError: (e) => toast.error(errorMessage(e)) },
              )
            }
          >
            Criar
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Botas de segurança" />}</Field>
        <Field label="Categoria">
          {(p) => (
            <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as EquipmentCategory)}>
              {(Object.keys(CATEGORY_LABEL) as EquipmentCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Controlo">
          {(p) => (
            <Select {...p} value={tracking} onChange={(e) => setTracking(e.target.value as 'STOCK' | 'SERIAL')}>
              <option value="STOCK">Por quantidade</option>
              <option value="SERIAL">Por número de série</option>
            </Select>
          )}
        </Field>
        <Field label="Tamanho" optional>{(p) => <Input {...p} value={size} onChange={(e) => setSize(e.target.value)} placeholder="42, L…" />}</Field>
        {tracking === 'STOCK' && <Field label="Stock mínimo">{(p) => <Input {...p} type="number" min={0} value={minStock} onChange={(e) => setMinStock(e.target.value)} />}</Field>}
      </div>
    </Dialog>
  )
}

function MovementDialog({ mode, item, employeeId, items, onClose }: { mode: Mode; item?: EquipmentItem; employeeId?: string; items: EquipmentItem[]; onClose: () => void }) {
  const org = useActiveOrg()
  const action = useEquipmentAction(org.id)
  const employees = useEmployeeOptions(org.id, mode === 'deliver' || mode === 'return')
  const [itemId, setItemId] = useState(item?.id ?? '')
  const [employee, setEmployee] = useState(employeeId ?? '')
  const [quantity, setQuantity] = useState('1')
  const [serials, setSerials] = useState('')
  const [unitId, setUnitId] = useState('')
  const [condition, setCondition] = useState<'OK' | 'DAMAGED' | 'LOST'>('OK')
  const [note, setNote] = useState('')
  const selected = items.find((i) => i.id === itemId)
  const serial = selected?.tracking === 'SERIAL'
  const units = useEquipmentUnits(org.id, serial ? itemId : null)
  const unitOptions = (units.data ?? []).filter((u) => (mode === 'deliver' ? u.status === 'IN_STOCK' : mode === 'return' ? u.status === 'ASSIGNED' && u.holderEmployeeId === employee : false))
  const title = { receive: 'Entrada em armazém', adjust: 'Acerto de inventário', deliver: 'Entregar', return: 'Devolução' }[mode]
  const submit = () => {
    const done = { onSuccess: () => (toast.success(`${title}: registado`), onClose()), onError: (e: unknown) => toast.error(errorMessage(e)) }
    if (mode === 'receive') {
      action.mutate(serial ? { action: 'receive', itemId, serials: serials.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean), note } : { action: 'receive', itemId, quantity: Number(quantity), note }, done)
    } else if (mode === 'adjust') {
      action.mutate({ action: 'adjust', itemId, delta: Number(quantity), note }, done)
    } else {
      action.mutate({ action: mode, itemId, employeeId: employee, ...(serial ? { unitId } : { quantity: Number(quantity) }), condition: mode === 'return' ? condition : undefined, note }, done)
    }
  }
  const ready = !!itemId && (mode === 'receive' || mode === 'adjust' || !!employee) && (serial ? (mode === 'receive' ? !!serials.trim() : !!unitId) : Number(quantity) !== 0) && (mode !== 'adjust' || note.trim().length >= 3)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!ready} loading={action.isPending} onClick={submit}>
            Registar
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Artigo" className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={itemId} onChange={(e) => (setItemId(e.target.value), setUnitId(''))} disabled={!!item}>
              <option value="">Escolha…</option>
              {items
                .filter((i) => mode !== 'adjust' || i.tracking === 'STOCK')
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.size ? ` (${i.size})` : ''} · {i.onHand} em armazém
                  </option>
                ))}
            </Select>
          )}
        </Field>
        {(mode === 'deliver' || mode === 'return') && (
          <Field label="Trabalhador" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={employee} onChange={(e) => setEmployee(e.target.value)} disabled={!!employeeId}>
                <option value="">Escolha…</option>
                {(employees.data?.items ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {serial && mode === 'receive' && (
          <Field label="Números de série" hint="Um por linha ou separados por vírgulas." className="sm:col-span-2">
            {(p) => <Textarea {...p} rows={3} value={serials} onChange={(e) => setSerials(e.target.value)} />}
          </Field>
        )}
        {serial && (mode === 'deliver' || mode === 'return') && (
          <Field label="Unidade" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Escolha…</option>
                {unitOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.serial} · {UNIT_STATUS_LABEL[u.status]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {!serial && (
          <Field label={mode === 'adjust' ? 'Diferença (+/−)' : 'Quantidade'} hint={mode === 'adjust' ? 'Ex.: −2 se faltam duas unidades na contagem.' : undefined}>
            {(p) => <Input {...p} type="number" min={mode === 'adjust' ? undefined : 1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />}
          </Field>
        )}
        {mode === 'return' && (
          <Field label="Estado">
            {(p) => (
              <Select {...p} value={condition} onChange={(e) => setCondition(e.target.value as 'OK' | 'DAMAGED' | 'LOST')}>
                <option value="OK">Bom estado (volta ao armazém)</option>
                <option value="DAMAGED">Danificado</option>
                <option value="LOST">Perdido</option>
              </Select>
            )}
          </Field>
        )}
        <Field label={mode === 'adjust' ? 'Motivo' : 'Nota'} optional={mode !== 'adjust'} className="sm:col-span-2">
          {(p) => <Input {...p} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}
