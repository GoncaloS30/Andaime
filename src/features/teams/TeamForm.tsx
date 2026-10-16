import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { SERIES } from '@/domain/palette'
import { LEADER_CATEGORIES } from '@/domain/labels'
import type { ID } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { Drawer } from '@/ui/Overlay'

/** Criar equipa: nome, cor, obra, viatura, elementos e responsável. */
export function TeamForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDemo((s) => s.db)
  const createTeam = useDemo((s) => s.createTeam)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(SERIES[9])
  const [siteId, setSiteId] = useState<ID>('')
  const [vehicleId, setVehicleId] = useState<ID>('')
  const [members, setMembers] = useState<ID[]>([])
  const [foremanId, setForemanId] = useState<ID>('')
  const [touched, setTouched] = useState(false)
  const workers = Object.values(db.workers).filter((w) => w.status === 'ativo').sort((a, b) => Number(!!a.teamId) - Number(!!b.teamId) || a.name.localeCompare(b.name))
  const freeVehicles = Object.values(db.vehicles).filter((v) => !v.teamId && v.status === 'operacional')
  const tooMany = vehicleId && members.length > (db.vehicles[vehicleId]?.seats ?? 99)

  const save = () => {
    setTouched(true)
    if (!name.trim()) return
    const id = createTeam({ name, color, siteId: siteId || null, vehicleId: vehicleId || null, memberIds: members, foremanId: foremanId || null })
    toast.success(`Equipa ${name} criada`, { description: members.some((m) => db.workers[m]?.teamId) ? 'Os elementos que estavam noutras equipas foram transferidos.' : undefined })
    onOpenChange(false)
    navigate(`/equipas/${id}`)
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Nova equipa"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save}>Criar equipa</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da equipa" className="sm:col-span-2" error={touched && !name.trim() ? 'Indique o nome.' : null}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Estrutura Porto" />}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Cor</legend>
          <div className="flex flex-wrap gap-1.5">
            {SERIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cn('size-7 rounded-full ring-offset-2', color === c && 'ring-2 ring-pinho')}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>
        <Field label="Obra">
          {(p) => (
            <Select {...p} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Sem obra</option>
              {Object.values(db.sites).map((s) => (
                <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Viatura" hint={freeVehicles.length ? `${freeVehicles.length} viaturas livres` : 'Não há viaturas livres'} error={tooMany ? `A viatura só tem ${db.vehicles[vehicleId]?.seats} lugares.` : null}>
          {(p) => (
            <Select {...p} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Sem viatura</option>
              {Object.values(db.vehicles).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.seats} lugares{v.teamId ? ` · com ${db.teams[v.teamId]?.name}` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Elementos ({members.length})</legend>
          <ul className="max-h-72 divide-y divide-line-2 overflow-y-auto rounded-md border border-line">
            {workers.map((w) => (
              <li key={w.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-cal">
                  <input type="checkbox" className="size-4 accent-pinho" checked={members.includes(w.id)} onChange={() => setMembers((x) => (x.includes(w.id) ? x.filter((y) => y !== w.id) : [...x, w.id]))} />
                  <Avatar name={w.name} size="xs" color={db.teams[w.teamId ?? '']?.color} />
                  <span className="min-w-0 flex-1 text-sm">
                    {w.name}
                    <span className="block text-xs text-ink-3">{w.category}{w.teamId ? ` · está em ${db.teams[w.teamId]?.name}` : ' · sem equipa'}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <Field label="Responsável" className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={foremanId} onChange={(e) => setForemanId(e.target.value)}>
              <option value="">Nenhum</option>
              {members.map((m) => db.workers[m]).filter((w) => w && LEADER_CATEGORIES.includes(w.category)).map((w) => (
                <option key={w!.id} value={w!.id}>{w!.name} · {w!.category}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Drawer>
  )
}
