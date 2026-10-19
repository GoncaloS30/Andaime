import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { BOOT_SIZES, CATEGORIES, CLOTHING_SIZES, GLOVE_SIZES, TROUSER_SIZES } from '@/domain/labels'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { Drawer } from '@/ui/Overlay'
import { errorMessage, isApiError } from '../../api/http'
import { useSaveEmployee, type EmployeeDetail, type EmployeeInput } from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { EMAIL_PATTERN, FormError } from '../auth/AuthLayout'

const SIZE_FIELDS: { key: string; label: string; options: string[] }[] = [
  { key: 'tshirt', label: 'T-shirt', options: CLOTHING_SIZES },
  { key: 'sweat', label: 'Sweat', options: CLOTHING_SIZES },
  { key: 'parka', label: 'Parka', options: CLOTHING_SIZES },
  { key: 'calcas', label: 'Calças', options: TROUSER_SIZES },
  { key: 'botas', label: 'Botas', options: BOOT_SIZES },
  { key: 'luvas', label: 'Luvas', options: GLOVE_SIZES },
]

interface FormState {
  number: string
  fullName: string
  category: string
  phone: string
  email: string
  nationality: string
  homeCity: string
  hireDate: string
  status: 'ACTIVE' | 'INACTIVE'
  dailyHours: string
  hourlyCost: string
  skills: string
  sizes: Record<string, string>
  notes: string
}

function initial(existing?: EmployeeDetail): FormState {
  return {
    number: existing?.number ?? '',
    fullName: existing?.fullName ?? '',
    category: existing?.category ?? 'Pedreiro',
    phone: existing?.phone ?? '',
    email: existing?.email ?? '',
    nationality: existing?.nationality ?? '',
    homeCity: existing?.homeCity ?? '',
    hireDate: existing?.hireDate ?? '',
    status: existing?.status ?? 'ACTIVE',
    dailyHours: String((existing?.dailyCapacityMin ?? 480) / 60),
    hourlyCost: existing?.hourlyCost != null ? String(existing.hourlyCost) : '',
    skills: existing?.skills.join(', ') ?? '',
    sizes: existing?.sizes ?? {},
    notes: existing?.notes ?? '',
  }
}

/** Criar ou editar a ficha de um trabalhador (gestor). */
export function EmployeeForm({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing?: EmployeeDetail }) {
  const org = useActiveOrg()
  const save = useSaveEmployee(org.id, existing?.id)
  const navigate = useNavigate()
  const [f, setF] = useState<FormState>(() => initial(existing))
  const [touched, setTouched] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }))
  const server = save.error && isApiError(save.error) ? save.error.fieldErrors : {}

  const hours = Number(f.dailyHours.replace(',', '.'))
  const cost = f.hourlyCost.trim() === '' ? null : Number(f.hourlyCost.replace(',', '.'))
  const errors = {
    fullName: f.fullName.trim().length < 2 ? 'Indique o nome completo.' : null,
    email: f.email.trim() && !EMAIL_PATTERN.test(f.email.trim()) ? 'Email inválido.' : null,
    dailyHours: !(hours >= 1 && hours <= 16) ? 'Entre 1 e 16 horas.' : null,
    hourlyCost: cost !== null && !(cost >= 0) ? 'Valor inválido.' : null,
    number: f.number.trim() && !/^[A-Za-z0-9-]{1,20}$/.test(f.number.trim()) ? 'Só letras, números e hífen.' : null,
  }
  const valid = Object.values(errors).every((e) => !e)

  const submit = () => {
    setTouched(true)
    if (!valid) return
    const input: EmployeeInput = {
      number: f.number.trim() || undefined,
      fullName: f.fullName.trim(),
      category: f.category,
      phone: f.phone.trim(),
      email: f.email.trim(),
      nationality: f.nationality.trim(),
      homeCity: f.homeCity.trim(),
      hireDate: f.hireDate || null,
      status: f.status,
      dailyCapacityMin: Math.round(hours * 60),
      hourlyCost: cost,
      skills: f.skills.split(',').map((s) => s.trim()).filter(Boolean),
      sizes: Object.fromEntries(Object.entries(f.sizes).filter(([, v]) => v)),
      notes: f.notes.trim(),
      version: existing?.version,
    }
    save.mutate(input, {
      onSuccess: (employee) => {
        toast.success(existing ? 'Ficha atualizada' : `${employee.fullName} registado com o n.º ${employee.number}`)
        onOpenChange(false)
        if (!existing) navigate(`/trabalhadores/${employee.id}`)
      },
    })
  }

  const err = (k: keyof typeof errors) => (touched ? errors[k] : null) ?? server[k] ?? null

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={existing ? `Editar ${existing.fullName}` : 'Novo trabalhador'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            {existing ? 'Guardar alterações' : 'Registar trabalhador'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError
            message={
              isApiError(save.error, 'number-taken')
                ? save.error.message
                : isApiError(save.error, 'stale')
                  ? 'Outra pessoa alterou esta ficha entretanto. Feche e abra de novo para ver a versão atual.'
                  : save.error && !Object.keys(server).length
                    ? errorMessage(save.error)
                    : null
            }
          />
        </div>
        <Field label="Nome completo" className="sm:col-span-2" error={err('fullName')}>
          {(p) => <Input {...p} value={f.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Categoria">
          {(p) => (
            <Select {...p} value={f.category} onChange={(e) => set('category', e.target.value)}>
              {[...new Set([...CATEGORIES, f.category])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="N.º mecanográfico" hint={existing ? undefined : 'Vazio: atribuído automaticamente.'} error={err('number')}>
          {(p) => <Input {...p} value={f.number} onChange={(e) => set('number', e.target.value)} inputMode="numeric" />}
        </Field>
        <Field label="Telemóvel" optional>
          {(p) => <Input {...p} value={f.phone} onChange={(e) => set('phone', e.target.value)} type="tel" />}
        </Field>
        <Field label="Email" optional error={err('email')}>
          {(p) => <Input {...p} value={f.email} onChange={(e) => set('email', e.target.value)} type="email" />}
        </Field>
        <Field label="Nacionalidade" optional>
          {(p) => <Input {...p} value={f.nationality} onChange={(e) => set('nationality', e.target.value)} />}
        </Field>
        <Field label="Residência" optional>
          {(p) => <Input {...p} value={f.homeCity} onChange={(e) => set('homeCity', e.target.value)} />}
        </Field>
        <Field label="Data de admissão" optional>
          {(p) => <Input {...p} type="date" value={f.hireDate} onChange={(e) => set('hireDate', e.target.value)} />}
        </Field>
        <Field label="Horas normais por dia" error={err('dailyHours')}>
          {(p) => <Input {...p} type="number" min={1} max={16} step={0.5} value={f.dailyHours} onChange={(e) => set('dailyHours', e.target.value)} />}
        </Field>
        <Field label="Custo por hora (€)" optional hint="Visível só a gestores. Usado nos relatórios de custo." error={err('hourlyCost')}>
          {(p) => <Input {...p} type="number" min={0} step={0.5} value={f.hourlyCost} onChange={(e) => set('hourlyCost', e.target.value)} />}
        </Field>
        {existing && (
          <Field label="Estado">
            {(p) => (
              <Select {...p} value={f.status} onChange={(e) => set('status', e.target.value as FormState['status'])}>
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
              </Select>
            )}
          </Field>
        )}
        <Field label="Competências" optional hint="Separadas por vírgulas, ex.: cofragem, soldadura, plataformas elevatórias." className="sm:col-span-2">
          {(p) => <Input {...p} value={f.skills} onChange={(e) => set('skills', e.target.value)} />}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 font-wide text-sm font-semibold">Tamanhos de fardamento</legend>
          <div className="grid grid-cols-3 gap-3">
            {SIZE_FIELDS.map((s) => (
              <Field key={s.key} label={s.label}>
                {(p) => (
                  <Select {...p} value={f.sizes[s.key] ?? ''} onChange={(e) => set('sizes', { ...f.sizes, [s.key]: e.target.value })}>
                    <option value="">—</option>
                    {s.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
          </div>
        </fieldset>
        <Field label="Notas internas" optional className="sm:col-span-2">
          {(p) => <Textarea {...p} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
      </div>
    </Drawer>
  )
}
