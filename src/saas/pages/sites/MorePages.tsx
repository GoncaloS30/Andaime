import { ArrowLeft, Building2, HardHat, MapPin, MessageSquareWarning, Pencil, Plus } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Avatar } from '@/ui/Avatar'
import { Badge, SiteCode } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { HoursGauge, HoursStatus } from '@/ui/HoursGauge'
import { PageHeader, Panel } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { errorMessage, isApiError } from '../../api/http'
import { SITE_STATUS_LABEL, SITE_STATUS_TONE, toGauge, useClients, useIssues, useSaveClient, useSites, useTeams, type Client } from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { COUNTRIES } from '../auth/OnboardingPages'
import { EMAIL_PATTERN, FormError } from '../auth/AuthLayout'
import { IssueList, ReportIssueDialog } from './SitesPages'

const SiteMap = lazy(async () => ({ default: (await import('@/features/shared/SiteMap')).SiteMap }))

function ClientDialog({ client, open, onOpenChange }: { client?: Client; open: boolean; onOpenChange: (o: boolean) => void }) {
  const org = useActiveOrg()
  const save = useSaveClient(org.id, client?.id)
  const [f, setF] = useState({
    name: client?.name ?? '',
    taxId: client?.taxId ?? '',
    contactName: client?.contactName ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    country: client?.country ?? 'PT',
  })
  const [touched, setTouched] = useState(false)
  const errors = {
    name: f.name.trim().length < 2 ? 'Indique o nome.' : null,
    email: f.email.trim() && !EMAIL_PATTERN.test(f.email.trim()) ? 'Email inválido.' : null,
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={client ? `Editar ${client.name}` : 'Novo cliente'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() => {
              setTouched(true)
              if (errors.name || errors.email) return
              save.mutate({ ...f, version: client?.version }, { onSuccess: () => (toast.success(client ? 'Cliente atualizado' : 'Cliente criado'), onOpenChange(false)) })
            }}
          >
            {client ? 'Guardar' : 'Criar cliente'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={isApiError(save.error, 'tax-id-taken') ? save.error.message : save.error ? errorMessage(save.error) : null} />
        </div>
        <Field label="Nome" className="sm:col-span-2" error={touched ? errors.name : null}>
          {(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />}
        </Field>
        <Field label="NIF" optional>
          {(p) => <Input {...p} value={f.taxId} onChange={(e) => setF({ ...f, taxId: e.target.value })} />}
        </Field>
        <Field label="País" optional>
          {(p) => (
            <Select {...p} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Pessoa de contacto" optional>
          {(p) => <Input {...p} value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />}
        </Field>
        <Field label="Telefone" optional>
          {(p) => <Input {...p} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}
        </Field>
        <Field label="Email" optional className="sm:col-span-2" error={touched ? errors.email : null}>
          {(p) => <Input {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  )
}

export function ClientsPage() {
  const org = useActiveOrg()
  const clients = useClients(org.id)
  const [editing, setEditing] = useState<Client | 'new' | null>(null)
  return (
    <div className="mx-auto max-w-[1080px]">
      <Link to="/obras" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Obras
      </Link>
      <PageHeader
        title="Clientes"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Novo cliente
          </Button>
        }
      />
      <Panel flush>
        {clients.isPending ? (
          <SkeletonRows rows={4} />
        ) : clients.isError ? (
          <ErrorState onRetry={() => void clients.refetch()} />
        ) : clients.data.length === 0 ? (
          <EmptyState icon={<Building2 />} title="Ainda não há clientes">
            Registe os donos de obra para os associar às obras.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line-2">
            {clients.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{c.name}</p>
                  <p className="text-ink-3">
                    {[c.taxId && `NIF ${c.taxId}`, c.contactName, c.email, c.phone].filter(Boolean).join(' · ') || 'Sem contactos'}
                  </p>
                </div>
                <Badge>{c.activeSites} obra{c.activeSites === 1 ? '' : 's'} ativa{c.activeSites === 1 ? '' : 's'}</Badge>
                <Button variant="ghost" size="sm" icon={<Pencil className="size-4" aria-hidden />} aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {editing && <ClientDialog client={editing === 'new' ? undefined : editing} open onOpenChange={() => setEditing(null)} />}
    </div>
  )
}

export function GeoMapPage() {
  const org = useActiveOrg()
  const sites = useSites(org.id)
  const [selected, setSelected] = useState<string | null>(null)
  const located = (sites.data ?? []).filter((s) => s.latitude != null && s.longitude != null)
  const current = located.find((s) => s.id === selected) ?? null
  const risk = (status: string) => (status === 'EXCEEDS' ? 'excede' : status === 'WARNING' ? 'atencao' : status === 'NO_LIMIT' ? 'sem_limite' : 'normal') as 'excede'
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader title="Mapa de obras" description={sites.data ? `${located.length} de ${sites.data.length} obras com localização` : undefined} />
      {sites.isPending ? (
        <SkeletonRows rows={6} />
      ) : sites.isError ? (
        <ErrorState onRetry={() => void sites.refetch()} />
      ) : located.length === 0 ? (
        <Panel>
          <EmptyState icon={<MapPin />} title="Nenhuma obra com localização">
            Indique a localização na ficha de cada obra para a ver no mapa.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="h-[min(70vh,640px)]">
            <Suspense fallback={<SkeletonRows rows={6} />}>
              <SiteMap
                label="Mapa das obras"
                className="h-full"
                selected={selected}
                onSelect={setSelected}
                pins={located.map((s) => ({ site: { id: s.id, code: s.code, name: s.name, color: s.color, lat: s.latitude!, lng: s.longitude! }, risk: risk(s.metrics.status) }))}
              />
            </Suspense>
          </div>
          <Panel title={current ? current.name : 'Obras'} flush>
            {current ? (
              <div className="space-y-3 p-4 text-sm">
                <SiteCode code={current.code} color={current.color} />
                <p className="text-ink-2">
                  {current.city} · {current.client?.name ?? 'Sem cliente'}
                </p>
                <Badge tone={SITE_STATUS_TONE[current.status]} dot>
                  {SITE_STATUS_LABEL[current.status]}
                </Badge>
                <HoursGauge m={toGauge(current.metrics)} />
                <HoursStatus m={toGauge(current.metrics)} className="block" />
                <Link to={`/obras/${current.id}`} className="inline-block text-pinho hover:underline">
                  Abrir ficha da obra
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-line-2">
                {located.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setSelected(s.id)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-cal">
                      <SiteCode code={s.code} color={s.color} />
                      <span className="truncate">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}

/** Área do encarregado: as suas equipas e obras, a partir dos dados reais. */
export function ForemanHomePage() {
  const org = useActiveOrg()
  const teams = useTeams(org.id)
  const sites = useSites(org.id)
  return (
    <>
      <PageHeader eyebrow={org.name} title="Hoje" description="As suas equipas e obras. A presença e as horas da equipa chegam com as fases F3 e F4." />
      {teams.isPending || sites.isPending ? (
        <SkeletonRows rows={6} />
      ) : teams.isError || sites.isError ? (
        <ErrorState onRetry={() => (void teams.refetch(), void sites.refetch())} />
      ) : teams.data!.length === 0 && sites.data!.length === 0 ? (
        <Panel>
          <EmptyState icon={<HardHat />} title="Ainda não tem equipas nem obras">
            O escritório tem de ligar a sua conta à sua ficha de trabalhador e indicá-lo como responsável de uma equipa ou encarregado de uma obra.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="As suas equipas" flush>
            {teams.data!.length === 0 ? (
              <EmptyState compact title="Não é responsável de nenhuma equipa" />
            ) : (
              <ul className="divide-y divide-line-2">
                {teams.data!.map((t) => (
                  <li key={t.id} className="border-l-4 px-4 py-3" style={{ borderLeftColor: t.color }}>
                    <Link to={`/equipas/${t.id}`} className="font-semibold hover:underline">
                      {t.name}
                    </Link>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {t.memberNames.map((n) => (
                        <span key={n} className="inline-flex items-center gap-1 text-xs text-ink-2">
                          <Avatar name={n} size="sm" color={t.color} /> {n}
                        </span>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="As suas obras" flush>
            {sites.data!.length === 0 ? (
              <EmptyState compact title="Não é encarregado de nenhuma obra" />
            ) : (
              <ul className="divide-y divide-line-2">
                {sites.data!.map((s) => (
                  <li key={s.id} className="px-4 py-3">
                    <Link to={`/obras/${s.id}`} className="flex items-center gap-2 hover:underline">
                      <SiteCode code={s.code} color={s.color} /> <span className="font-medium">{s.name}</span>
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {s.city} · {s.openIssues} ocorrência{s.openIssues === 1 ? '' : 's'} em aberto
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </>
  )
}

export function ForemanIssuesPage() {
  const org = useActiveOrg()
  const issues = useIssues(org.id)
  const sites = useSites(org.id)
  const [reporting, setReporting] = useState(false)
  return (
    <>
      <PageHeader
        title="Problemas"
        description="Ocorrências nas suas obras: segurança, material, acesso…"
        actions={
          <Button variant="primary" icon={<MessageSquareWarning className="size-4" />} onClick={() => setReporting(true)} disabled={!sites.data?.length}>
            Comunicar ocorrência
          </Button>
        }
      />
      <Panel flush>
        {issues.isPending ? <SkeletonRows rows={4} /> : issues.isError ? <ErrorState onRetry={() => void issues.refetch()} /> : <IssueList issues={issues.data} showSite canResolve />}
      </Panel>
      {reporting && <ReportIssueDialog sites={sites.data?.map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }))} open onOpenChange={setReporting} />}
    </>
  )
}
