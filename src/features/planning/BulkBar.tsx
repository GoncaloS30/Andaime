import { Clock, MapPin, Trash2, Truck, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { ID } from '@/domain/types'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { Popover } from '@/ui/Menu'

/** Ações em lote sobre as atribuições selecionadas (Shift/Ctrl + clique). */
export function BulkBar({ ids, onClear }: { ids: ID[]; onClear: () => void }) {
  const db = useDemo((s) => s.db)
  const bulk = useDemo((s) => s.bulkUpdate)
  const remove = useDemo((s) => s.removeAssignments)
  const undo = useDemo((s) => s.undo)
  const [site, setSite] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('17:00')
  if (ids.length === 0) return null
  const done = (msg: string) => toast.success(msg, { action: { label: 'Anular', onClick: () => undo() } })

  return (
    <div
      role="toolbar"
      aria-label={`${ids.length} atribuições selecionadas`}
      className="fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-pinho p-1.5 pl-3 text-white shadow-e2 animate-sheet-in md:bottom-6"
    >
      <span className="mr-1 text-sm font-semibold whitespace-nowrap tabular">{ids.length} selecionadas</span>
      <Popover
        label="Mudar obra"
        trigger={
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" icon={<MapPin className="size-3.5" />}>
            Obra
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          <Field label="Mudar para a obra">
            {(p) => (
              <Select {...p} value={site} onChange={(e) => setSite(e.target.value)}>
                <option value="">Escolher…</option>
                {Object.values(db.sites).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button size="sm" variant="primary" disabled={!site} onClick={() => { bulk(ids, { siteId: site }); done(`${ids.length} atribuições movidas para ${db.sites[site]?.code}`); onClear() }}>
            Aplicar
          </Button>
        </div>
      </Popover>
      <Popover
        label="Atribuir viatura"
        trigger={
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" icon={<Truck className="size-3.5" />}>
            Viatura
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          <Field label="Viatura">
            {(p) => (
              <Select {...p} value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
                <option value="">Sem viatura</option>
                {Object.values(db.vehicles).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} · {v.seats} lugares
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button size="sm" variant="primary" onClick={() => { bulk(ids, { vehicleId: vehicle || null }); done('Viatura atribuída'); onClear() }}>
            Aplicar
          </Button>
        </div>
      </Popover>
      <Popover
        label="Horário"
        trigger={
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" icon={<Clock className="size-3.5" />}>
            Horário
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="Entrada">{(p) => <Input {...p} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label="Saída">{(p) => <Input {...p} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
          <Button size="sm" variant="primary" className="col-span-2" onClick={() => { bulk(ids, { start, end }); done('Horário alterado'); onClear() }}>
            Aplicar
          </Button>
        </div>
      </Popover>
      <Button
        size="sm"
        variant="ghost"
        className="text-white hover:bg-tijolo hover:text-white"
        icon={<Trash2 className="size-3.5" />}
        onClick={() => { remove(ids); done(`${ids.length} atribuições removidas`); onClear() }}
      >
        Remover
      </Button>
      <button type="button" onClick={onClear} aria-label="Limpar seleção" className="ml-1 rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
        <X className="size-4" />
      </button>
    </div>
  )
}
