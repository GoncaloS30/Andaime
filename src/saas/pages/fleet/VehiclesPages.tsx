import { AlertTriangle, Archive, ArrowLeft, CalendarX2, Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Badge, Plate } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { Detail, PageHeader, Panel } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { errorMessage, isApiError } from '../../api/http'
import {
  ALERT_LABEL,
  useArchiveVehicle,
  useSaveVehicle,
  useUnavailability,
  useVehicle,
  useVehicles,
  VEHICLE_STATUS_LABEL,
  VEHICLE_STATUS_TONE,
  type VehicleAlert,
  type VehicleDetail,
  type VehicleStatus,
} from '../../api/planning'
import { atLeast } from '../../api/types'
import { formatDate, todayIso } from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { FormError } from '../auth/AuthLayout'

function AlertBadges({ alerts }: { alerts: VehicleAlert[] }) {
  if (alerts.length === 0) return <Badge dot tone="ok">Em dia</Badge>
  return (
    <span className="flex flex-wrap gap-1">
      {alerts.map((a) => (
        <Badge key={a.kind} tone={a.expired ? 'danger' : 'warn'} icon={<AlertTriangle className="size-3" />}>
          {ALERT_LABEL[a.kind]} {a.expired ? 'caducado' : 'até'} {formatDate(a.date)}
        </Badge>
      ))}
    </span>
  )
}

function VehicleForm({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing?: VehicleDetail }) {
  const org = useActiveOrg()
  const save = useSaveVehicle(org.id, existing?.id)
  const navigate = useNavigate()
  const [plate, setPlate] = useState(existing?.plate ?? '')
  const [make, setMake] = useState(existing?.make ?? '')
  const [model, setModel] = useState(existing?.model ?? '')
  const [seats, setSeats] = useState(String(existing?.seats ?? 9))
  const [status, setStatus] = useState<VehicleStatus>(existing?.status ?? 'OPERATIONAL')
  const [km, setKm] = useState(existing ? String(existing.km) : '')
  const [insurance, setInsurance] = useState(existing?.insuranceUntil ?? '')
  const [inspection, setInspection] = useState(existing?.inspectionUntil ?? '')
  const [maintenance, setMaintenance] = useState(existing?.maintenanceDue ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [touched, setTouched] = useState(false)
  const plateError = plate.trim().length < 2 ? 'Indique a matrícula.' : null
  const seatsError = !(Number(seats) >= 1 && Number(seats) <= 60) ? 'Entre 1 e 60 lugares.' : null
  const fe = isApiError(save.error) ? save.error.fieldErrors : {}

  const submit = () => {
    setTouched(true)
    if (plateError || seatsError) return
    save.mutate(
      {
        plate: plate.trim(),
        make: make.trim() || undefined,
        model: model.trim() || undefined,
        seats: Number(seats),
        status,
        km: km === '' ? null : Number(km),
        insuranceUntil: insurance || null,
        inspectionUntil: inspection || null,
        maintenanceDue: maintenance || null,
        notes: notes.trim() || undefined,
        version: existing?.version,
      },
      {
        onSuccess: (v) => {
          toast.success(existing ? 'Viatura atualizada' : `Viatura ${v.plate} criada`)
          onOpenChange(false)
          if (!existing) navigate(`/viaturas/${v.id}`)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={existing ? `Editar ${existing.plate}` : 'Nova viatura'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            {existing ? 'Guardar' : 'Criar viatura'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={save.error ? errorMessage(save.error) : null} />
        </div>
        <Field label="Matrícula" error={(touched ? plateError : null) ?? fe.plate}>
          {(p) => <Input {...p} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} autoFocus placeholder="AA-00-AA" />}
        </Field>
        <Field label="Lugares" error={(touched ? seatsError : null) ?? fe.seats}>
          {(p) => <Input {...p} type="number" min={1} max={60} value={seats} onChange={(e) => setSeats(e.target.value)} />}
        </Field>
        <Field label="Marca" optional>{(p) => <Input {...p} value={make} onChange={(e) => setMake(e.target.value)} />}</Field>
        <Field label="Modelo" optional>{(p) => <Input {...p} value={model} onChange={(e) => setModel(e.target.value)} />}</Field>
        <Field label="Estado">
          {(p) => (
            <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as VehicleStatus)}>
              {(Object.keys(VEHICLE_STATUS_LABEL) as VehicleStatus[]).map((s) => (
                <option key={s} value={s}>
                  {VEHICLE_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Quilómetros" optional>{(p) => <Input {...p} type="number" min={0} value={km} onChange={(e) => setKm(e.target.value)} />}</Field>
        <Field label="Seguro válido até" optional>{(p) => <Input {...p} type="date" value={insurance} onChange={(e) => setInsurance(e.target.value)} />}</Field>
        <Field label="Inspeção válida até" optional>{(p) => <Input {...p} type="date" value={inspection} onChange={(e) => setInspection(e.target.value)} />}</Field>
        <Field label="Próxima manutenção" optional>{(p) => <Input {...p} type="date" value={maintenance} onChange={(e) => setMaintenance(e.target.value)} />}</Field>
        <Field label="Notas" optional className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}

export function VehiclesPage() {
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<VehicleStatus | ''>('')
  const [archived, setArchived] = useState(false)
  const vehicles = useVehicles(org.id, { q, status, archived })
  const [creating, setCreating] = useState(false)
  const withAlerts = vehicles.data?.filter((v) => v.alerts.length > 0).length ?? 0
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title="Viaturas"
        description={vehicles.data ? `${vehicles.data.length} viaturas${withAlerts ? ` · ${withAlerts} com documentos a caducar` : ''}` : undefined}
        actions={
          manager && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nova viatura
            </Button>
          )
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input aria-label="Pesquisar viaturas" placeholder="Matrícula, marca ou modelo" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as VehicleStatus | '')} className="max-w-[200px]">
          <option value="">Todos os estados</option>
          {(Object.keys(VEHICLE_STATUS_LABEL) as VehicleStatus[]).map((s) => (
            <option key={s} value={s}>
              {VEHICLE_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Button variant={archived ? 'secondary' : 'ghost'} size="sm" onClick={() => setArchived(!archived)} aria-pressed={archived}>
          Arquivadas
        </Button>
      </div>
      {vehicles.isPending ? (
        <SkeletonRows rows={6} />
      ) : vehicles.isError ? (
        <ErrorState onRetry={() => void vehicles.refetch()} />
      ) : vehicles.data.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState icon={<Truck />} title="Sem viaturas" action={manager && !archived && <Button variant="primary" onClick={() => setCreating(true)}>Criar viatura</Button>}>
            Registe as carrinhas para as ligar às equipas e ao planeamento.
          </EmptyState>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line bg-surface">
          {vehicles.data.map((v) => (
            <li key={v.id} className="border-b border-line-2 last:border-0">
              <Link to={`/viaturas/${v.id}`} className="grid items-center gap-3 px-4 py-3 transition-colors hover:bg-cal md:grid-cols-[1fr_1fr_0.8fr_1.6fr]">
                <span className="flex min-w-0 items-center gap-2">
                  <Plate plate={v.plate} />
                  <span className="truncate text-sm text-ink-2">{[v.make, v.model].filter(Boolean).join(' ') || '—'}</span>
                </span>
                <span className="text-sm text-ink-2">
                  {v.seats} lugares · {v.team ? v.team.name : 'Sem equipa'}
                </span>
                <span>
                  <Badge tone={VEHICLE_STATUS_TONE[v.status]}>{VEHICLE_STATUS_LABEL[v.status]}</Badge>
                </span>
                <AlertBadges alerts={v.alerts} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <VehicleForm open onOpenChange={setCreating} />}
    </div>
  )
}

export function VehicleDetailPage() {
  const { id = '' } = useParams()
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const vehicle = useVehicle(org.id, id)
  const archive = useArchiveVehicle(org.id, id)
  const unavailability = useUnavailability(org.id, id)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [startsOn, setStartsOn] = useState(todayIso())
  const [endsOn, setEndsOn] = useState(todayIso())
  const [reason, setReason] = useState('')

  if (vehicle.isPending) return <SkeletonRows rows={6} />
  if (vehicle.isError) return <ErrorState onRetry={() => void vehicle.refetch()}>{errorMessage(vehicle.error)}</ErrorState>
  const v = vehicle.data
  return (
    <div className="mx-auto max-w-[1100px]">
      <Link to="/viaturas" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Viaturas
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Plate plate={v.plate} className="h-7 text-base" /> {[v.make, v.model].filter(Boolean).join(' ')}
          </span>
        }
        description={`${v.seats} lugares · ${v.km.toLocaleString('pt-PT')} km${v.archivedAt ? ' · arquivada' : ''}`}
        actions={
          manager && (
            <div className="flex gap-2">
              <Button variant="ghost" icon={<Archive className="size-4" />} loading={archive.isPending} onClick={() => archive.mutate(!v.archivedAt, { onSuccess: () => toast.success(v.archivedAt ? 'Viatura reposta' : 'Viatura arquivada') })}>
                {v.archivedAt ? 'Repor' : 'Arquivar'}
              </Button>
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Editar
              </Button>
            </div>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Estado">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Estado">
              <Badge tone={VEHICLE_STATUS_TONE[v.status]}>{VEHICLE_STATUS_LABEL[v.status]}</Badge>
            </Detail>
            <Detail label="Equipa">{v.team ? <Link to={`/equipas/${v.team.id}`} className="underline">{v.team.name}</Link> : 'Sem equipa'}</Detail>
            <Detail label="Seguro">{formatDate(v.insuranceUntil)}</Detail>
            <Detail label="Inspeção">{formatDate(v.inspectionUntil)}</Detail>
            <Detail label="Próxima manutenção">{formatDate(v.maintenanceDue)}</Detail>
            <Detail label="Alertas">
              <AlertBadges alerts={v.alerts} />
            </Detail>
          </dl>
          {v.notes && <p className="mt-4 text-sm whitespace-pre-line text-ink-2">{v.notes}</p>}
        </Panel>
        <Panel
          title="Indisponibilidade"
          actions={manager && <Button size="sm" variant="secondary" icon={<CalendarX2 className="size-4" />} onClick={() => setAdding(true)}>Marcar</Button>}
        >
          {v.unavailability.length === 0 ? (
            <p className="text-sm text-ink-3">Sem períodos marcados. Uma viatura indisponível não pode ser planeada.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {v.unavailability.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 rounded-sm border border-line-2 px-3 py-2">
                  <span className="text-sm">
                    <span className="font-semibold">{formatDate(u.startsOn)}{u.endsOn !== u.startsOn ? ` – ${formatDate(u.endsOn)}` : ''}</span> · {u.reason}
                  </span>
                  {manager && (
                    <IconButton label="Remover período" size="sm" onClick={() => unavailability.mutate({ action: 'remove', unavailabilityId: u.id })}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Próximas saídas" className="lg:col-span-2">
          {v.upcoming.length === 0 ? (
            <p className="text-sm text-ink-3">Sem planeamento com esta viatura nos próximos dias.</p>
          ) : (
            <ul className="divide-y divide-line-2">
              {v.upcoming.map((u) => (
                <li key={`${u.date}-${u.siteId}`} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {formatDate(u.date)} · <Link to={`/obras/${u.siteId}`} className="underline">{u.siteCode} {u.siteName}</Link>
                  </span>
                  <span className={u.riders > v.seats ? 'font-semibold text-tijolo' : 'text-ink-3'}>
                    {u.riders}/{v.seats} pessoas
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {editing && <VehicleForm open onOpenChange={setEditing} existing={v} />}
      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title="Marcar indisponibilidade"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={!reason.trim() || endsOn < startsOn}
              loading={unavailability.isPending}
              onClick={() =>
                unavailability.mutate(
                  { action: 'add', startsOn, endsOn, reason: reason.trim() },
                  { onSuccess: () => (toast.success('Indisponibilidade marcada'), setAdding(false), setReason('')), onError: (e) => toast.error(errorMessage(e)) },
                )
              }
            >
              Marcar
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="De">{(p) => <Input {...p} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />}</Field>
          <Field label="Até">{(p) => <Input {...p} type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} />}</Field>
          <Field label="Motivo" className="sm:col-span-2">{(p) => <Input {...p} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Revisão, avaria…" />}</Field>
        </div>
      </Dialog>
    </div>
  )
}
