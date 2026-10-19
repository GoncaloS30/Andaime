import { lazy, Suspense, useState } from 'react'
import { SERIES } from '@/domain/palette'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { SkeletonRows } from '@/ui/States'
import { isApiError } from '../../api/http'
import { useMembers } from '../../api/hooks'
import { useClients, useEmployeeOptions, useNextSiteCode, type SiteDetail, type SiteInput, type SiteStatus } from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { COUNTRIES, TIMEZONES } from '../auth/OnboardingPages'

const SiteMap = lazy(async () => ({ default: (await import('@/features/shared/SiteMap')).SiteMap }))

interface State {
  code: string
  name: string
  clientId: string
  country: string
  city: string
  address: string
  latitude: string
  longitude: string
  timezone: string
  status: SiteStatus | ''
  startDate: string
  endDate: string
  limitHours: string
  realizedHours: string
  approvedHours: string
  directorUserId: string
  foremanEmployeeId: string
  color: string
  description: string
  erpOrder: string
}

const hoursOf = (min: number | null | undefined) => (min ? String(Math.round((min / 60) * 10) / 10) : '')

function initial(site?: SiteDetail): State {
  return {
    code: site?.code ?? '',
    name: site?.name ?? '',
    clientId: site?.client?.id ?? '',
    country: site?.country ?? 'PT',
    city: site?.city ?? '',
    address: site?.address ?? '',
    latitude: site?.latitude != null ? String(site.latitude) : '',
    longitude: site?.longitude != null ? String(site.longitude) : '',
    timezone: site?.timezone ?? '',
    status: site?.status ?? '',
    startDate: site?.startDate ?? '',
    endDate: site?.endDate ?? '',
    limitHours: hoursOf(site?.hourLimitMin),
    realizedHours: hoursOf(site?.baselineRealizedMin),
    approvedHours: hoursOf(site?.baselineApprovedMin),
    directorUserId: site?.director?.id ?? '',
    foremanEmployeeId: site?.foreman?.id ?? '',
    color: site?.color ?? '',
    description: site?.description ?? '',
    erpOrder: site?.erpOrder ?? '',
  }
}

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

/**
 * Formulário de obra (criar e editar). Devolve o pedido já validado; quem o usa decide o que fazer
 * (página nova ou gaveta de edição). O servidor valida tudo de novo.
 */
export function SiteForm({
  site,
  onSubmit,
  pending,
  error,
  submitLabel,
  onCancel,
}: {
  site?: SiteDetail
  onSubmit: (input: SiteInput) => void
  pending: boolean
  error: unknown
  submitLabel: string
  onCancel: () => void
}) {
  const org = useActiveOrg()
  const clients = useClients(org.id)
  const employees = useEmployeeOptions(org.id)
  const members = useMembers(org.id)
  const nextCode = useNextSiteCode(org.id)
  const [f, setF] = useState<State>(() => initial(site))
  const [touched, setTouched] = useState(false)
  const set = <K extends keyof State>(k: K, v: State[K]) => setF((x) => ({ ...x, [k]: v }))
  const server = isApiError(error) ? error.fieldErrors : {}

  const lat = num(f.latitude)
  const lng = num(f.longitude)
  const limit = num(f.limitHours)
  const realized = num(f.realizedHours) ?? 0
  const approved = num(f.approvedHours) ?? 0
  const errors = {
    name: f.name.trim().length < 2 ? 'Indique o nome da obra.' : null,
    code: f.code.trim() && !/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/.test(f.code.trim()) ? 'Só letras, números e hífen.' : null,
    coordinates:
      (lat === null) !== (lng === null)
        ? 'Indique latitude e longitude, ou nenhuma.'
        : lat !== null && (Math.abs(lat) > 90 || Math.abs(lng!) > 180 || Number.isNaN(lat) || Number.isNaN(lng!))
          ? 'Coordenadas inválidas.'
          : null,
    endDate: f.startDate && f.endDate && f.endDate < f.startDate ? 'Anterior ao início.' : null,
    limit: limit !== null && !(limit >= 1) ? 'Indique um limite positivo ou deixe vazio.' : null,
    baseline: approved > realized ? 'As aprovadas não podem exceder as realizadas.' : null,
  }
  const valid = Object.values(errors).every((e) => !e)
  const directors = (members.data ?? []).filter((m) => m.status === 'ACTIVE' && ['OWNER', 'ADMIN', 'MANAGER'].includes(m.role))

  const submit = () => {
    setTouched(true)
    if (!valid) return
    onSubmit({
      code: f.code.trim() || undefined,
      name: f.name.trim(),
      clientId: f.clientId || null,
      country: f.country,
      city: f.city.trim(),
      address: f.address.trim(),
      latitude: lat,
      longitude: lng,
      timezone: f.timezone || undefined,
      status: f.status || undefined,
      startDate: f.startDate || null,
      endDate: f.endDate || null,
      hourLimitMin: limit === null ? null : Math.round(limit * 60),
      baselineRealizedMin: Math.round(realized * 60),
      baselineApprovedMin: Math.round(approved * 60),
      directorUserId: f.directorUserId || null,
      foremanEmployeeId: f.foremanEmployeeId || null,
      color: f.color || undefined,
      description: f.description.trim(),
      erpOrder: f.erpOrder.trim(),
      version: site?.version,
    })
  }
  const err = (k: keyof typeof errors) => (touched ? errors[k] : null)

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-wide text-md font-semibold sm:col-span-2">Identificação</h2>
        <Field label="Nome da obra" className="sm:col-span-2" error={err('name') ?? server.name}>
          {(p) => <Input {...p} value={f.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <Field label="Código" hint={site ? undefined : `Vazio: ${nextCode.data?.code ?? 'atribuído automaticamente'}.`} error={err('code') ?? server.code}>
          {(p) => <Input {...p} value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />}
        </Field>
        <Field label="Cliente" optional hint={clients.data?.length === 0 ? 'Crie clientes em Obras → Clientes.' : undefined}>
          {(p) => (
            <Select {...p} value={f.clientId} onChange={(e) => set('clientId', e.target.value)}>
              <option value="">Sem cliente</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Estado" hint={site ? undefined : 'Vazio: em curso se já começou, senão planeada.'}>
          {(p) => (
            <Select {...p} value={f.status} onChange={(e) => set('status', e.target.value as State['status'])}>
              {!site && <option value="">Automático</option>}
              <option value="PLANNED">Planeada</option>
              <option value="ACTIVE">Em curso</option>
              <option value="SUSPENDED">Suspensa</option>
              <option value="DONE">Concluída</option>
            </Select>
          )}
        </Field>
        <Field label="Ordem ERP" optional>
          {(p) => <Input {...p} value={f.erpOrder} onChange={(e) => set('erpOrder', e.target.value)} />}
        </Field>
        <Field label="Início" optional>
          {(p) => <Input {...p} type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />}
        </Field>
        <Field label="Fim previsto" optional error={err('endDate')}>
          {(p) => <Input {...p} type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} />}
        </Field>
        <Field label="Descrição" optional className="sm:col-span-2">
          {(p) => <Textarea {...p} value={f.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-wide text-md font-semibold sm:col-span-2">Localização</h2>
        <Field label="País">
          {(p) => (
            <Select {...p} value={f.country} onChange={(e) => (set('country', e.target.value), set('timezone', ''))}>
              {[...COUNTRIES, ...(COUNTRIES.some((c) => c.code === f.country) ? [] : [{ code: f.country, name: f.country, timezone: '' }])].map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Fuso horário" hint="Usado para os horários locais da obra no planeamento e nas horas.">
          {(p) => (
            <Select {...p} value={f.timezone} onChange={(e) => set('timezone', e.target.value)}>
              <option value="">Do país ({COUNTRIES.find((c) => c.code === f.country)?.timezone ?? 'empresa'})</option>
              {[...new Set([...(f.timezone ? [f.timezone] : []), ...TIMEZONES])].map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Cidade" optional>
          {(p) => <Input {...p} value={f.city} onChange={(e) => set('city', e.target.value)} />}
        </Field>
        <Field label="Morada" optional>
          {(p) => <Input {...p} value={f.address} onChange={(e) => set('address', e.target.value)} />}
        </Field>
        <Field label="Latitude" optional error={err('coordinates')}>
          {(p) => <Input {...p} inputMode="decimal" value={f.latitude} onChange={(e) => set('latitude', e.target.value)} />}
        </Field>
        <Field label="Longitude" optional>
          {(p) => <Input {...p} inputMode="decimal" value={f.longitude} onChange={(e) => set('longitude', e.target.value)} />}
        </Field>
        <div className="h-64 sm:col-span-2">
          <Suspense fallback={<SkeletonRows rows={3} />}>
            <SiteMap
              label="Escolher a localização da obra no mapa"
              pins={[]}
              picked={lat !== null && lng !== null && !errors.coordinates ? { lat, lng } : null}
              onPick={(la, ln) => (set('latitude', String(la)), set('longitude', String(ln)))}
              className="h-full"
            />
          </Suspense>
          <p className="mt-1 text-xs text-ink-3">Carregue no mapa para marcar a obra.</p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-wide text-md font-semibold sm:col-span-2">Responsáveis e horas</h2>
        <Field label="Diretor de obra" optional>
          {(p) => (
            <Select {...p} value={f.directorUserId} onChange={(e) => set('directorUserId', e.target.value)}>
              <option value="">Sem diretor</option>
              {directors.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Encarregado" optional hint="Com a conta ligada à ficha, vê esta obra e comunica ocorrências.">
          {(p) => (
            <Select {...p} value={f.foremanEmployeeId} onChange={(e) => set('foremanEmployeeId', e.target.value)}>
              <option value="">Sem encarregado</option>
              {employees.data?.items.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} · {e.category}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Limite de horas" optional hint="Horas contratadas para a obra." error={err('limit')}>
          {(p) => <Input {...p} type="number" min={1} value={f.limitHours} onChange={(e) => set('limitHours', e.target.value)} />}
        </Field>
        <div />
        <Field label="Horas já realizadas antes do Andaime" optional hint="Histórico importado (ex.: de outro sistema).">
          {(p) => <Input {...p} type="number" min={0} value={f.realizedHours} onChange={(e) => set('realizedHours', e.target.value)} />}
        </Field>
        <Field label="Dessas, já aprovadas" optional error={err('baseline')}>
          {(p) => <Input {...p} type="number" min={0} value={f.approvedHours} onChange={(e) => set('approvedHours', e.target.value)} />}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">Cor</legend>
          <div className="flex flex-wrap gap-2">
            {SERIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                aria-pressed={c === f.color}
                onClick={() => set('color', c)}
                className={cn('size-7 rounded-full ring-offset-2', c === f.color && 'ring-2 ring-pinho')}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>
      </section>

      <div className="flex justify-end gap-2 border-t border-line-2 pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="primary" onClick={submit} loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
