import { Archive, ArchiveRestore, ArrowLeft, Building2, Info, LayoutGrid, MessageSquareWarning, Pencil, Plus, Rows3, Search } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { GLOSSARY } from '@/copy'
import { formatHours } from '@/domain/hours'
import { Badge, SiteCode } from '@/ui/Badge'
import { Button, buttonStyles } from '@/ui/Button'
import { Field, Input, Segmented, Select, Textarea } from '@/ui/Field'
import { GaugeLegend, HoursGauge, HoursStatus } from '@/ui/HoursGauge'
import { Detail, PageHeader, Panel } from '@/ui/Layout'
import { Tooltip } from '@/ui/Menu'
import { Dialog, Drawer } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { TabPanel, Tabs } from '@/ui/Tabs'
import { errorMessage, isApiError } from '../../api/http'
import { atLeast } from '../../api/types'
import {
  formatDate,
  ISSUE_LABEL,
  SITE_STATUS_LABEL,
  SITE_STATUS_TONE,
  toGauge,
  useArchiveSite,
  usePhoto,
  useIssues,
  useReportIssue,
  useResolveIssue,
  useSaveSite,
  useSite,
  useSites,
  type Issue,
  type IssueCategory,
  type SiteMetricsDto,
  type SiteStatus,
} from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { COUNTRIES } from '../auth/OnboardingPages'
import { HistoryList } from '../workforce/HistoryList'
import { PhotoControls } from '../shared/PhotoControls'
import { SiteForm } from './SiteForm'

const SiteMap = lazy(async () => ({ default: (await import('@/features/shared/SiteMap')).SiteMap }))

const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code

function CountryTag({ country, full }: { country: string; full?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-3">
      <span className="rounded-xs border border-line px-1 font-mono text-[10px] font-semibold text-ink-2">{country}</span>
      {full && countryName(country)}
    </span>
  )
}

/** Nota honesta: até haver registo de horas, as métricas só têm o histórico importado. */
function MetricsNote({ m }: { m: SiteMetricsDto }) {
  if (m.includesTimeEntries) return null
  return <p className="text-xs text-ink-3">Inclui só as horas importadas na criação da obra. As horas registadas no Andaime entram com a fase F4.</p>
}

export function SitesPage() {
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const [sp, setSp] = useSearchParams()
  const filters = { q: sp.get('q') ?? '', status: (sp.get('estado') ?? '') as SiteStatus | '', country: sp.get('pais') ?? '', archived: sp.get('arquivadas') === 'sim' }
  const view = sp.get('vista') === 'tabela' ? 'tabela' : 'cartoes'
  const set = (k: string, v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p)
        if (v) n.set(k, v)
        else n.delete(k)
        return n
      },
      { replace: true },
    )
  const sites = useSites(org.id, filters)
  const list = sites.data ?? []
  const active = list.filter((s) => s.status === 'ACTIVE')
  const filtering = !!(filters.q || filters.status || filters.country || filters.archived)

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Obras"
        description={sites.data ? `${active.length} em curso em ${new Set(active.map((s) => s.country)).size} ${new Set(active.map((s) => s.country)).size === 1 ? 'país' : 'países'}` : undefined}
        actions={
          manager && (
            <>
              <Link to="/obras/clientes" className={buttonStyles('secondary')}>
                Clientes
              </Link>
              <Link to="/obras/nova" className={buttonStyles('primary')}>
                <Plus className="size-4" aria-hidden /> Nova obra
              </Link>
            </>
          )
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
          <label className="sr-only" htmlFor="s-q">
            Pesquisar
          </label>
          <Input id="s-q" value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Código, nome, cidade ou cliente" className="w-64 pl-8" />
        </div>
        <label className="sr-only" htmlFor="s-st">
          Estado
        </label>
        <Select id="s-st" value={filters.status} onChange={(e) => set('estado', e.target.value)} className="w-40">
          <option value="">Todos os estados</option>
          {Object.entries(SITE_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="s-c">
          País
        </label>
        <Select id="s-c" value={filters.country} onChange={(e) => set('pais', e.target.value)} className="w-40">
          <option value="">Todos os países</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
        {manager && (
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <input type="checkbox" checked={filters.archived} onChange={(e) => set('arquivadas', e.target.checked ? 'sim' : '')} />
            Arquivadas
          </label>
        )}
        <Segmented
          className="ml-auto"
          label="Vista"
          value={view}
          onChange={(v) => set('vista', v === 'tabela' ? 'tabela' : '')}
          options={[
            { value: 'cartoes', label: 'Cartões', icon: <LayoutGrid className="size-3.5" aria-hidden /> },
            { value: 'tabela', label: 'Tabela', icon: <Rows3 className="size-3.5" aria-hidden /> },
          ]}
        />
      </div>
      {sites.isPending ? (
        <SkeletonRows rows={6} />
      ) : sites.isError ? (
        <ErrorState onRetry={() => void sites.refetch()} />
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          {filtering ? (
            <EmptyState icon={<Search />} title="Nenhuma obra encontrada">
              Ajuste a pesquisa ou os filtros.
            </EmptyState>
          ) : (
            <EmptyState
              icon={<Building2 />}
              title={manager ? 'Ainda não há obras' : 'Sem obras no seu âmbito'}
              action={
                manager && (
                  <Link to="/obras/nova" className={buttonStyles('primary')}>
                    Criar obra
                  </Link>
                )
              }
            >
              {manager ? 'Crie a primeira obra com o cliente, a localização e o limite de horas.' : 'Vê aqui as obras de que é encarregado.'}
            </EmptyState>
          )}
        </div>
      ) : view === 'cartoes' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => {
            const m = toGauge(s.metrics)
            return (
              <article key={s.id} className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-ink-4">
                <Link to={`/obras/${s.id}`} className="block border-t-4 px-3 pt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pinho focus-visible:ring-inset" style={{ borderTopColor: s.color }}>
                  <span className="font-mono text-[11px] font-semibold text-ink-3">
                    {s.code} · {s.country}
                  </span>
                  <h2 className="font-semibold text-ink group-hover:underline">{s.name}</h2>
                  <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
                    <CountryTag country={s.country} />
                    {s.city && <span className="shrink-0">{s.city}</span>}
                    {s.client && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{s.client.name}</span>
                      </>
                    )}
                  </p>
                </Link>
                <div className="mt-auto space-y-2 px-3 pt-2.5 pb-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex shrink-0 items-center gap-1">
                      <Badge tone={SITE_STATUS_TONE[s.status]} dot>
                        {SITE_STATUS_LABEL[s.status]}
                      </Badge>
                      {s.openIssues > 0 && <Badge tone="warn">{s.openIssues} ocorrência{s.openIssues > 1 ? 's' : ''}</Badge>}
                    </span>
                    <span className="truncate text-ink-3">{s.foreman?.name ?? 'Sem encarregado'}</span>
                  </div>
                  <HoursGauge m={m} size="sm" />
                  <HoursStatus m={m} className="block" />
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="table-a min-w-[960px]">
            <thead>
              <tr>
                <th scope="col">Obra</th>
                <th scope="col">Cliente</th>
                <th scope="col">Local</th>
                <th scope="col">Estado</th>
                <th scope="col">Encarregado</th>
                <th scope="col" className="w-[26%]">
                  Horas face ao limite
                </th>
                <th scope="col" className="num">
                  Realizadas / limite
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const m = toGauge(s.metrics)
                return (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/obras/${s.id}`} className="block hover:underline">
                        <SiteCode code={s.code} color={s.color} />
                        <span className="block font-semibold text-ink">{s.name}</span>
                      </Link>
                    </td>
                    <td className="max-w-48 truncate text-ink-2">{s.client?.name ?? '—'}</td>
                    <td>
                      <CountryTag country={s.country} /> <span className="text-xs text-ink-2">{s.city}</span>
                    </td>
                    <td>
                      <Badge tone={SITE_STATUS_TONE[s.status]} dot>
                        {SITE_STATUS_LABEL[s.status]}
                      </Badge>
                    </td>
                    <td className="text-xs">{s.foreman?.name ?? <span className="text-ink-3">—</span>}</td>
                    <td>
                      <HoursGauge m={m} size="sm" />
                      <HoursStatus m={m} className="mt-1 block" />
                    </td>
                    <td className="num font-mono text-xs">
                      {formatHours(Math.round(m.realized), '')} / {m.limit ? formatHours(m.limit) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.length > 0 && (
        <div className="mt-3 space-y-1">
          <GaugeLegend />
          {list.some((s) => !s.metrics.includesTimeEntries) && <MetricsNote m={list[0]!.metrics} />}
        </div>
      )}
    </div>
  )
}

export function NewSitePage() {
  const org = useActiveOrg()
  const save = useSaveSite(org.id)
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/obras" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Obras
      </Link>
      <PageHeader title="Nova obra" description="Só o nome e o país são obrigatórios; o resto pode completar depois." />
      <Panel>
        <div className="p-4">
          {save.error != null && !isApiError(save.error, 'validation') && (
            <p role="alert" className="mb-4 rounded-md border border-tijolo/30 bg-tijolo-soft px-3 py-2 text-sm text-tijolo-ink">
              {errorMessage(save.error)}
            </p>
          )}
          <SiteForm
            pending={save.isPending}
            error={save.error}
            submitLabel="Criar obra"
            onCancel={() => navigate('/obras')}
            onSubmit={(input) =>
              save.mutate(input, {
                onSuccess: (site) => {
                  toast.success(`Obra ${site.code} criada`)
                  navigate(`/obras/${site.id}`)
                },
              })
            }
          />
        </div>
      </Panel>
    </div>
  )
}

function MetricsGrid({ metrics }: { metrics: SiteMetricsDto }) {
  const m = toGauge(metrics)
  const item = (label: string, value: string, help: string, strong?: boolean) => (
    <div className="flex flex-col gap-0.5 border-l border-line-2 pl-3 first:border-0 first:pl-0">
      <dt className="flex items-center gap-1 text-xs text-ink-3">
        {label}
        <Tooltip content={help}>
          <button type="button" aria-label={`O que é: ${label}`} className="text-ink-4 hover:text-ink">
            <Info className="size-3" />
          </button>
        </Tooltip>
      </dt>
      <dd className={strong ? 'font-expanded text-xl font-semibold tabular' : 'font-expanded text-lg font-semibold tabular text-ink-2'}>{value}</dd>
    </div>
  )
  return (
    <div className="p-4">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-x-4 gap-y-4">
        {item('Limite', m.limit ? formatHours(m.limit) : 'Sem limite', GLOSSARY.limite, true)}
        {item('Realizadas', formatHours(Math.round(m.realized)), GLOSSARY.realizadas, true)}
        {item('Aprovadas', formatHours(Math.round(m.approved)), GLOSSARY.aprovadas)}
        {item('Planeadas futuras', formatHours(Math.round(m.plannedFuture)), GLOSSARY.planeadas)}
        {item('Saldo disponível', m.balance === null ? '—' : formatHours(Math.round(m.balance)), GLOSSARY.saldo, true)}
        {item('Projeção', formatHours(Math.round(m.projection)), GLOSSARY.projecao)}
      </dl>
      <div className="mt-4 space-y-2">
        <HoursGauge m={m} size="lg" legend />
        <HoursStatus m={m} className="block" />
        <MetricsNote m={metrics} />
      </div>
    </div>
  )
}

const ISSUE_CATEGORIES = Object.keys(ISSUE_LABEL) as IssueCategory[]

export function ReportIssueDialog({ siteId, sites, open, onOpenChange }: { siteId?: string; sites?: { id: string; label: string }[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const org = useActiveOrg()
  const report = useReportIssue(org.id)
  const [site, setSite] = useState(siteId ?? '')
  const [category, setCategory] = useState<IssueCategory>('SAFETY')
  const [text, setText] = useState('')
  const invalid = !site || text.trim().length < 3
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Comunicar ocorrência"
      description="O escritório vê a ocorrência na ficha da obra."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={invalid}
            loading={report.isPending}
            onClick={() =>
              report.mutate(
                { siteId: site, category, description: text.trim() },
                { onSuccess: () => (toast.success('Ocorrência comunicada'), setText(''), onOpenChange(false)), onError: (e) => toast.error(errorMessage(e)) },
              )
            }
          >
            Comunicar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {sites && (
          <Field label="Obra">
            {(p) => (
              <Select {...p} value={site} onChange={(e) => setSite(e.target.value)}>
                <option value="">Escolher…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Tipo">
          {(p) => (
            <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as IssueCategory)}>
              {ISSUE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {ISSUE_LABEL[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="O que aconteceu">
          {(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />}
        </Field>
      </div>
    </Dialog>
  )
}

const dateTime = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' })

export function IssueList({ issues, showSite, canResolve }: { issues: Issue[]; showSite?: boolean; canResolve: boolean }) {
  const org = useActiveOrg()
  const resolve = useResolveIssue(org.id)
  if (issues.length === 0) return <EmptyState compact title="Sem ocorrências" />
  return (
    <ul className="divide-y divide-line-2">
      {issues.map((i) => (
        <li key={i.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone={i.category === 'SAFETY' ? 'danger' : 'warn'}>{ISSUE_LABEL[i.category]}</Badge>
              {showSite && <SiteCode code={i.siteCode} color="#7d847f" />}
              {i.status === 'RESOLVED' && <Badge tone="ok">Resolvida</Badge>}
            </p>
            <p className="mt-1 text-ink">{i.description}</p>
            <p className="mt-0.5 text-xs text-ink-3">
              {i.reportedBy} · {dateTime.format(new Date(i.reportedAt))}
              {i.resolvedAt && ` · resolvida por ${i.resolvedBy} a ${dateTime.format(new Date(i.resolvedAt))}`}
              {i.resolutionNote && ` — ${i.resolutionNote}`}
            </p>
          </div>
          {canResolve && i.status === 'OPEN' && (
            <Button
              size="sm"
              loading={resolve.isPending && resolve.variables?.issueId === i.id}
              onClick={() => resolve.mutate({ issueId: i.id }, { onSuccess: () => toast.success('Ocorrência resolvida'), onError: (e) => toast.error(errorMessage(e)) })}
            >
              Marcar resolvida
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

export function SiteDetailPage() {
  const { id = '' } = useParams()
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const site = useSite(org.id, id)
  const issues = useIssues(org.id, id)
  const save = useSaveSite(org.id, id)
  const archive = useArchiveSite(org.id, id)
  const photo = usePhoto(org.id, 'sites', id)
  const [tab, setTab] = useState('resumo')
  const [editing, setEditing] = useState(false)
  const [reporting, setReporting] = useState(false)

  if (site.isPending) return <SkeletonRows rows={8} />
  if (site.isError)
    return isApiError(site.error, 'not-found') ? (
      <EmptyState title="Obra não encontrada" action={<Link to="/obras" className="text-pinho underline">Voltar às obras</Link>}>
        Não existe ou não está no seu âmbito.
      </EmptyState>
    ) : (
      <ErrorState onRetry={() => void site.refetch()} />
    )
  const s = site.data
  const openCount = issues.data?.filter((i) => i.status === 'OPEN').length ?? 0

  return (
    <div className="mx-auto max-w-[1280px]">
      <Link to="/obras" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Obras
      </Link>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-end gap-4">
          {s.photoUrl && (
            <img src={s.photoUrl} alt={`Fotografia da obra ${s.name}`} className="size-20 shrink-0 rounded-md border border-line object-cover" />
          )}
          <div className="min-w-0">
          <SiteCode code={s.code} color={s.color} />
          <h1 className="font-expanded text-2xl font-semibold tracking-tight">{s.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <CountryTag country={s.country} full />
            {s.city && <>· {s.city}</>}
            {s.client && <>· {s.client.name}</>}
            <Badge tone={SITE_STATUS_TONE[s.status]} dot>
              {SITE_STATUS_LABEL[s.status]}
            </Badge>
            {s.archivedAt && <Badge>Arquivada</Badge>}
          </p>
          {manager && !s.archivedAt && (
            <div className="mt-1 -ml-2">
              <PhotoControls
                hasPhoto={!!s.photoUrl}
                subject={s.name}
                uploading={photo.upload.isPending}
                removing={photo.remove.isPending}
                onUpload={(file) => photo.upload.mutateAsync(file)}
                onRemove={() => photo.remove.mutateAsync()}
              />
            </div>
          )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<MessageSquareWarning className="size-4" />} onClick={() => setReporting(true)}>
            Ocorrência
          </Button>
          {manager && !s.archivedAt && (
            <Button variant="primary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Editar obra
            </Button>
          )}
          {manager && (
            <Button
              variant="ghost"
              icon={s.archivedAt ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              loading={archive.isPending}
              onClick={() => archive.mutate(!s.archivedAt, { onSuccess: () => toast.success(s.archivedAt ? 'Obra reposta' : 'Obra arquivada'), onError: (e) => toast.error(errorMessage(e)) })}
            >
              {s.archivedAt ? 'Repor' : 'Arquivar'}
            </Button>
          )}
        </div>
      </header>

      <Panel className="mb-4" title="Horas" description="Realizadas, aprovadas e planeadas face ao limite">
        <MetricsGrid metrics={s.metrics} />
      </Panel>

      <Tabs
        value={tab}
        onValueChange={setTab}
        label="Ficha da obra"
        tabs={[
          { value: 'resumo', label: 'Resumo' },
          { value: 'localizacao', label: 'Localização' },
          { value: 'ocorrencias', label: 'Ocorrências', count: openCount, tone: 'warn' },
          ...(manager ? [{ value: 'historico', label: 'Histórico' }] : []),
        ]}
      >
        <TabPanel value="resumo">
          <Panel>
            <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Cliente">{s.client?.name ?? '—'}</Detail>
              <Detail label="Diretor de obra">{s.director?.name ?? '—'}</Detail>
              <Detail label="Encarregado">{s.foreman ? manager ? <Link className="text-pinho hover:underline" to={`/trabalhadores/${s.foreman.id}`}>{s.foreman.name}</Link> : s.foreman.name : '—'}</Detail>
              <Detail label="Início">{formatDate(s.startDate)}</Detail>
              <Detail label="Fim previsto">{formatDate(s.endDate)}</Detail>
              <Detail label="Ordem ERP">{s.erpOrder ?? '—'}</Detail>
            </dl>
            {s.description && <p className="border-t border-line-2 px-4 py-3 text-sm text-ink-2">{s.description}</p>}
          </Panel>
          <p className="mt-3 text-xs text-ink-3">A equipa planeada, as viaturas e as horas por semana aparecem aqui com o planeamento (F3) e o registo de horas (F4).</p>
        </TabPanel>
        <TabPanel value="localizacao">
          <Panel>
            <dl className="grid gap-4 p-4 sm:grid-cols-3">
              <Detail label="Morada">{s.address ?? '—'}</Detail>
              <Detail label="Fuso horário">{s.timezone}</Detail>
              <Detail label="Coordenadas">{s.latitude != null ? `${s.latitude}, ${s.longitude}` : '—'}</Detail>
            </dl>
            {s.latitude != null && s.longitude != null && (
              <div className="h-80 px-4 pb-4">
                <Suspense fallback={<SkeletonRows rows={4} />}>
                  <SiteMap label={`Localização da obra ${s.name}`} className="h-full" pins={[{ site: { id: s.id, code: s.code, name: s.name, color: s.color, lat: s.latitude, lng: s.longitude, photo: s.photoUrl ?? undefined } }]} />
                </Suspense>
              </div>
            )}
          </Panel>
        </TabPanel>
        <TabPanel value="ocorrencias">
          <Panel flush>{issues.isPending ? <SkeletonRows rows={3} /> : issues.isError ? <ErrorState onRetry={() => void issues.refetch()} /> : <IssueList issues={issues.data} canResolve />}</Panel>
        </TabPanel>
        {manager && (
          <TabPanel value="historico">
            <HistoryList entityType="site" id={id} />
          </TabPanel>
        )}
      </Tabs>

      {editing && (
        <Drawer open onOpenChange={setEditing} size="xl" title={`Editar ${s.code}`}>
          {save.error != null && !isApiError(save.error, 'validation') && (
            <p role="alert" className="mb-4 rounded-md border border-tijolo/30 bg-tijolo-soft px-3 py-2 text-sm text-tijolo-ink">
              {isApiError(save.error, 'stale') ? 'Outra pessoa alterou esta obra entretanto. Feche e abra de novo.' : errorMessage(save.error)}
            </p>
          )}
          <SiteForm
            site={s}
            pending={save.isPending}
            error={save.error}
            submitLabel="Guardar alterações"
            onCancel={() => setEditing(false)}
            onSubmit={(input) => save.mutate(input, { onSuccess: () => (toast.success('Obra atualizada'), setEditing(false)) })}
          />
        </Drawer>
      )}
      {reporting && <ReportIssueDialog siteId={id} open onOpenChange={setReporting} />}
    </div>
  )
}
