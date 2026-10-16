import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { BOOT_SIZES, CATEGORIES, CLOTHING_SIZES, GLOVE_SIZES, TROUSER_SIZES } from '@/domain/labels'
import type { ID, Sizes, Worker, WorkerCategory } from '@/domain/types'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { Drawer } from '@/ui/Overlay'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  workerId?: ID
}

const SIZE_FIELDS: { key: keyof Sizes; label: string; options: string[] }[] = [
  { key: 'tshirt', label: 'T-shirt', options: CLOTHING_SIZES },
  { key: 'sweat', label: 'Sweat', options: CLOTHING_SIZES },
  { key: 'parka', label: 'Parka', options: CLOTHING_SIZES },
  { key: 'calcas', label: 'Calças', options: TROUSER_SIZES },
  { key: 'botas', label: 'Botas', options: BOOT_SIZES },
  { key: 'luvas', label: 'Luvas', options: GLOVE_SIZES },
]

export function SizesFields({ sizes, onChange }: { sizes: Sizes; onChange: (s: Sizes) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {SIZE_FIELDS.map((f) => (
        <Field key={f.key} label={f.label}>
          {(p) => (
            <Select {...p} value={sizes[f.key] ?? ''} onChange={(e) => onChange({ ...sizes, [f.key]: e.target.value || undefined })}>
              <option value="">—</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ))}
    </div>
  )
}

/** Criar ou editar a ficha de um trabalhador. */
export function WorkerForm({ open, onOpenChange, workerId }: Props) {
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const create = useDemo((s) => s.createWorker)
  const update = useDemo((s) => s.updateWorker)
  const navigate = useNavigate()
  const existing = workerId ? db.workers[workerId] : undefined
  const [f, setF] = useState<Omit<Worker, 'id'>>(
    existing ?? {
      number: '',
      name: '',
      category: 'Pedreiro',
      phone: '',
      email: '',
      nationality: 'Portuguesa',
      homeCity: '',
      hireDate: today,
      status: 'ativo',
      teamId: null,
      usualVehicleId: null,
      dailyHours: 8,
      hourlyCost: 12,
      sizes: {},
    },
  )
  const [touched, setTouched] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const nameError = touched && !f.name.trim() ? 'Indique o nome.' : null
  const dupNumber = f.number.trim() && Object.values(db.workers).some((w) => w.number === f.number.trim() && w.id !== workerId)

  const save = () => {
    setTouched(true)
    if (!f.name.trim() || dupNumber) return
    if (existing) {
      update(existing.id, f)
      toast.success('Ficha atualizada')
      onOpenChange(false)
    } else {
      const id = create(f)
      toast.success(`${f.name} registado`, { description: 'Pode agora planeá-lo e entregar-lhe equipamento.' })
      onOpenChange(false)
      navigate(`/trabalhadores/${id}`)
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={existing ? `Editar ${existing.name}` : 'Novo trabalhador'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save}>
            {existing ? 'Guardar alterações' : 'Registar trabalhador'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo" className="sm:col-span-2" error={nameError}>
          {(p) => <Input {...p} value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Categoria">
          {(p) => (
            <Select {...p} value={f.category} onChange={(e) => set('category', e.target.value as WorkerCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="N.º mecanográfico" hint={existing ? undefined : 'Vazio: atribuído automaticamente.'} error={dupNumber ? 'Já existe um trabalhador com este número.' : null}>
          {(p) => <Input {...p} value={f.number} onChange={(e) => set('number', e.target.value)} inputMode="numeric" />}
        </Field>
        <Field label="Telemóvel">{(p) => <Input {...p} value={f.phone} onChange={(e) => set('phone', e.target.value)} type="tel" />}</Field>
        <Field label="Email" optional>{(p) => <Input {...p} value={f.email} onChange={(e) => set('email', e.target.value)} type="email" />}</Field>
        <Field label="Nacionalidade">{(p) => <Input {...p} value={f.nationality} onChange={(e) => set('nationality', e.target.value)} />}</Field>
        <Field label="Residência">{(p) => <Input {...p} value={f.homeCity} onChange={(e) => set('homeCity', e.target.value)} />}</Field>
        <Field label="Data de admissão">{(p) => <Input {...p} type="date" value={f.hireDate} onChange={(e) => set('hireDate', e.target.value)} />}</Field>
        <Field label="Equipa">
          {(p) => (
            <Select {...p} value={f.teamId ?? ''} onChange={(e) => set('teamId', e.target.value || null)}>
              <option value="">Sem equipa</option>
              {Object.values(db.teams).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Horas normais por dia">{(p) => <Input {...p} type="number" min={4} max={10} value={f.dailyHours} onChange={(e) => set('dailyHours', Number(e.target.value))} />}</Field>
        <Field label="Custo por hora (€)" hint="Usado nos relatórios de custo estimado.">
          {(p) => <Input {...p} type="number" min={0} step={0.5} value={f.hourlyCost} onChange={(e) => set('hourlyCost', Number(e.target.value))} />}
        </Field>
        {existing && (
          <Field label="Estado">
            {(p) => (
              <Select {...p} value={f.status} onChange={(e) => set('status', e.target.value as Worker['status'])}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </Select>
            )}
          </Field>
        )}
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 font-wide text-sm font-semibold">Tamanhos de fardamento</legend>
          <SizesFields sizes={f.sizes} onChange={(s) => set('sizes', s)} />
        </fieldset>
      </div>
    </Drawer>
  )
}
