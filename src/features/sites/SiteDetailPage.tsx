import { ArrowLeft, Building2, CalendarRange, FileUp, Info, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { GLOSSARY } from '@/copy'
import { DOC_STATE_LABEL, docState, latestDoc, requiredSiteDocTypes } from '@/domain/documents'
import { entryHours, formatHours } from '@/domain/hours'
import { COUNTRY_NAME, ISSUE_CATEGORY, SITE_STATUS } from '@/domain/labels'
import { delayWorkdays } from '@/domain/planning'
import type { SiteStatus } from '@/domain/types'
import { addDays, dateNumeric, dateShort, dayShort, weekDays, weekStart } from '@/domain/weeks'
import { selectSiteMetrics } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Badge, Plate, SiteCode } from '@/ui/Badge'
import { Photo } from '@/ui/Photo'
import { PhotoUpload } from '@/ui/PhotoUpload'
import { Button, buttonStyles } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { GaugeLegend, HoursGauge, HoursStatus } from '@/ui/HoursGauge'
import { Detail, Panel } from '@/ui/Layout'
import { Tooltip } from '@/ui/Menu'
import { EmptyState } from '@/ui/States'
import { TabPanel, Tabs } from '@/ui/Tabs'
import { ActivityList } from '../shared/ActivityList'
import { CountryTag } from '../shared/Country'
import { DocumentDialog } from '../shared/DocumentDialog'
import { SiteMap } from '../shared/SiteMap'
import { SiteLodging } from '../lodging/SiteLodging'
import { SiteDiary } from './diary/SiteDiary'
import { WeeklyBars } from './WeeklyBars'

const TABS = ['resumo', 'diario', 'alojamento', 'cliente', 'localizacao', 'responsaveis', 'equipa', 'planeamento', 'viaturas', 'horas', 'documentos', 'historico'] as const
const LABEL: Record<(typeof TABS)[number], string> = {
  resumo: 'Resumo', diario: 'Diário', alojamento: 'Alojamento', cliente: 'Cliente', localizacao: 'Localização', responsaveis: 'Responsáveis', equipa: 'Equipa',
  planeamento: 'Planeamento', viaturas: 'Viaturas', horas: 'Horas', documentos: 'Documentos', historico: 'Histórico',
}

function MetricsGrid({ siteId }: { siteId: string }) {
  const m = useDerived((s) => selectSiteMetrics(s, siteId), [siteId])
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
    <div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-x-4 gap-y-4">
        {item('Limite', m.limit ? formatHours(m.limit) : 'Sem limite', GLOSSARY.limite, true)}
        {item('Realizadas', formatHours(Math.round(m.realized)), GLOSSARY.realizadas, true)}
        {item('Aprovadas', formatHours(Math.round(m.approved)), GLOSSARY.aprovadas)}
        {item('Planeadas futuras', formatHours(Math.round(m.plannedFuture)), GLOSSARY.planeadas)}
        {item('Saldo disponível', m.balance === null ? '—' : formatHours(Math.round(m.balance)), GLOSSARY.saldo, true)}
        {item('Projeção', formatHours(Math.round(m.projection)), GLOSSARY.projecao)}
      </dl>
      <div className="mt-4">
        <HoursGauge m={m} size="lg" legend />
        <HoursStatus m={m} className="mt-2 block" />
      </div>
    </div>
  )
}

export function SiteDetailPage() {
  const { id = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? (sp.get('tab') as (typeof TABS)[number]) : 'resumo'
  const setTab = (t: string) => setSp((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n }, { replace: true })
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const settings = useDemo((s) => s.session.settings)
  const updateSite = useDemo((s) => s.updateSite)
  const resolveIssue = useDemo((s) => s.resolveIssue)
  const s = db.sites[id]
  const [limit, setLimit] = useState<string>(s?.hourLimit?.toString() ?? '')
  const [docType, setDocType] = useState<string | null>(null)

  const weekly = useDerived(({ db: d, session }) => {
    const ws = weekStart(session.today)
    return [-5, -4, -3, -2, -1, 0, 1].map((o) => {
      const w = addDays(ws, o * 7)
      const end = addDays(w, 6)
      let realized = 0
      for (const e of Object.values(d.entries)) if (e.siteId === id && e.date >= w && e.date <= end && ['submetido', 'revisto', 'aprovado'].includes(e.status)) realized += entryHours(e, session.settings).worked
      let planned = 0
      for (const a of Object.values(d.assignments)) if (a.siteId === id && a.date >= w && a.date <= end && a.date >= session.today) planned += a.hours
      return { week: w, realized: Math.round(realized), planned, current: o === 0 }
    })
  }, [id])

  if (!s) return <EmptyState title="Obra não encontrada" action={<Link to="/obras" className="text-pinho underline">Voltar às obras</Link>}>Pode ter sido removida ao repor a demonstração.</EmptyState>
  const client = db.clients[s.clientId]
  const teams = Object.values(db.teams).filter((t) => t.siteId === id)
  const director = db.managers[s.directorId]
  const foreman = s.foremanId ? db.workers[s.foremanId] : undefined
  const days = weekDays(weekStart(today)).concat(weekDays(addDays(weekStart(today), 7)))
  const assigned = Object.values(db.assignments).filter((a) => a.siteId === id && a.date >= days[0]! && a.date <= days[13]!)
  const people = [...new Set(assigned.map((a) => a.workerId))].map((w) => db.workers[w]!).filter(Boolean)
  const vehicles = [...new Set(assigned.map((a) => a.vehicleId).filter(Boolean))] as string[]
  const leaders = Object.values(db.workers).filter((w) => w.category === 'Encarregado' || w.category === 'Chefe de equipa')
  const issues = Object.values(db.issues).filter((i) => i.siteId === id).sort((a, b) => b.at.localeCompare(a.at))
  const docTypes = requiredSiteDocTypes(db, s.country)

  return (
    <div className="mx-auto max-w-[1280px]">
      <Link to="/obras" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Obras
      </Link>
      <header className="mb-4 grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <SiteCode code={s.code} color={s.color} />
          <h1 className="font-expanded text-2xl font-semibold tracking-tight">{s.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <CountryTag country={s.country} full /> · {s.city} · {client?.name}
            <Badge tone={s.status === 'em_curso' ? 'ok' : s.status === 'planeada' ? 'info' : 'neutral'} dot>{SITE_STATUS[s.status]}</Badge>
          </p>
          <Link to={`/planeamento?vista=obras&obra=${id}`} className={buttonStyles('secondary', 'md', 'mt-3')}>
            <CalendarRange className="size-4" aria-hidden /> Planeamento da obra
          </Link>
        </div>
        <div className="order-first space-y-2 md:order-none">
          <Photo photo={s.photo} format="capa" priority sizes="(min-width: 768px) 320px, 100vw" fallback={<Building2 className="size-8 text-ink-4" aria-hidden />} />
          <PhotoUpload target={{ type: 'obra', id }} current={s.photo} alt={`Obra ${s.name}, em ${s.city}`} label="Alterar capa" />
        </div>
      </header>

      <Panel className="mb-4" title="Horas" description="Realizadas, aprovadas e planeadas face ao limite">
        <MetricsGrid siteId={id} />
      </Panel>

      <Tabs value={tab} onValueChange={setTab} label="Ficha da obra" tabs={TABS.map((t) => ({ value: t, label: LABEL[t], count: t === 'historico' ? issues.filter((i) => i.status === 'aberto').length : undefined, tone: 'warn' }))}>
        <TabPanel value="resumo">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Obra">
              <p className="mb-4 text-sm text-ink-2">{s.description}</p>
              <dl className="grid grid-cols-2 gap-4">
                <Detail label="Início">{dateNumeric(s.startDate)}</Detail>
                <Detail label="Fim contratual">{dateNumeric(s.contractEnd)}</Detail>
                <Detail label="Previsão de fim">
                  {dateNumeric(s.endDate)}
                  {delayWorkdays(s) > 0 && <Badge tone="warn" className="ml-1.5">+{delayWorkdays(s)} dias úteis face ao contrato</Badge>}
                </Detail>
                <Detail label="Fuso horário">{s.timezone}</Detail>
                <Detail label="Ordem ERP">{s.erpOrder}</Detail>
              </dl>
              <Field label="Estado da obra" className="mt-4 max-w-56">
                {(p) => (
                  <Select {...p} value={s.status} onChange={(e) => { updateSite(id, { status: e.target.value as SiteStatus }); toast.success('Estado da obra atualizado') }}>
                    {Object.entries(SITE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                )}
              </Field>
            </Panel>
            <Panel title="Pessoas nas próximas duas semanas" flush>
              {people.length === 0 ? <p className="px-4 py-4 text-sm text-ink-3">Ninguém planeado.</p> : (
                <ul className="flex flex-wrap gap-2 p-4">
                  {people.map((w) => (
                    <li key={w.id}><Link to={`/trabalhadores/${w.id}`} className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pr-2.5 pl-0.5 text-xs hover:border-ink-4"><Avatar name={w.name} photo={w.photo} size="xs" color={db.teams[w.teamId ?? '']?.color} />{w.name}</Link></li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </TabPanel>
        <TabPanel value="cliente">
          <Panel title={client?.name ?? 'Cliente'}>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Detail label="NIF / identificação">{client?.nif || '—'}</Detail>
              <Detail label="Contacto">{client?.contactName}</Detail>
              <Detail label="Email">{client?.email}</Detail>
              <Detail label="País">{client ? COUNTRY_NAME[client.country] : '—'}</Detail>
              <Detail label="Outras obras">{Object.values(db.sites).filter((x) => x.clientId === s.clientId && x.id !== id).map((x) => x.code).join(', ') || 'Nenhuma'}</Detail>
            </dl>
          </Panel>
        </TabPanel>
        <TabPanel value="localizacao">
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <SiteMap pins={[{ site: s }]} className="h-80" label={`Localização de ${s.name}`} />
            <Panel title="Morada">
              <p className="text-sm">{s.address}</p>
              <p className="mt-2 font-mono text-xs text-ink-3">{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</p>
            </Panel>
          </div>
        </TabPanel>
        <TabPanel value="responsaveis">
          <Panel title="Responsáveis">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Diretor de obra">
                {(p) => (
                  <Select {...p} value={s.directorId} onChange={(e) => { updateSite(id, { directorId: e.target.value }); toast.success('Diretor de obra atualizado') }}>
                    {Object.values(db.managers).map((m) => <option key={m.id} value={m.id}>{m.name} · {m.title}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Encarregado da obra" hint="Vê esta obra na experiência de encarregado.">
                {(p) => (
                  <Select {...p} value={s.foremanId ?? ''} onChange={(e) => { updateSite(id, { foremanId: e.target.value || null }); toast.success('Encarregado atualizado') }}>
                    <option value="">Sem encarregado</option>
                    {leaders.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.category}</option>)}
                  </Select>
                )}
              </Field>
            </div>
            <p className="mt-3 text-sm text-ink-3">Atual: {director?.name} (direção) · {foreman?.name ?? 'sem encarregado'} (terreno)</p>
          </Panel>
        </TabPanel>
        <TabPanel value="equipa">
          <Panel title="Equipas associadas" flush>
            {teams.length === 0 ? <p className="px-4 py-4 text-sm text-ink-3">Nenhuma equipa tem esta obra como habitual. Associe uma em Equipas ou no Planeamento.</p> : (
              <ul className="divide-y divide-line-2">
                {teams.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 border-l-4 px-4 py-3" style={{ borderLeftColor: t.color }}>
                    <Link to={`/equipas/${t.id}`} className="flex-1 font-semibold hover:underline">{t.name}</Link>
                    <span className="text-xs text-ink-3">{t.memberIds.length} elementos</span>
                    {t.vehicleId && <Plate plate={db.vehicles[t.vehicleId]?.plate ?? ''} />}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabPanel>
        <TabPanel value="planeamento">
          <Panel title="Duas semanas" flush description="Pessoas por dia nesta obra">
            <div className="overflow-x-auto">
              <table className="table-a min-w-[860px]">
                <thead><tr>{days.map((d) => <th key={d} scope="col" className={d === today ? 'text-pinho' : ''}>{dayShort(d)} {d.slice(8)}</th>)}</tr></thead>
                <tbody>
                  <tr>
                    {days.map((d) => {
                      const n = assigned.filter((a) => a.date === d).length
                      return <td key={d} className="font-mono text-sm tabular">{n || '·'}</td>
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
        </TabPanel>
        <TabPanel value="viaturas">
          <Panel title="Viaturas nas próximas duas semanas" flush>
            {vehicles.length === 0 ? <p className="px-4 py-4 text-sm text-ink-3">Nenhuma viatura planeada.</p> : (
              <ul className="divide-y divide-line-2">
                {vehicles.map((vid) => {
                  const v = db.vehicles[vid]!
                  const d = new Set(assigned.filter((a) => a.vehicleId === vid).map((a) => a.date)).size
                  return (
                    <li key={vid} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <Plate plate={v.plate} />
                      <Link to={`/viaturas/${vid}`} className="flex-1 hover:underline">{v.make} {v.model}</Link>
                      <span className="text-xs text-ink-3">{d} dias · {v.seats} lugares</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </TabPanel>
        <TabPanel value="horas">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Panel title="Por semana">
              <WeeklyBars data={weekly} label={`Horas realizadas e planeadas por semana em ${s.code}`} />
            </Panel>
            <Panel title="Limite de horas" description="Horas contratadas ou limite definido internamente.">
              <Field label="Limite (h)" hint="Deixe vazio para obra sem limite. A alteração fica no histórico.">
                {(p) => <Input {...p} type="number" min={0} step={100} value={limit} onChange={(e) => setLimit(e.target.value)} />}
              </Field>
              <Button
                className="mt-3"
                variant="primary"
                icon={<Pencil className="size-4" />}
                disabled={limit === (s.hourLimit?.toString() ?? '')}
                onClick={() => { updateSite(id, { hourLimit: limit === '' ? null : Number(limit) }); toast.success('Limite de horas atualizado', { description: 'O dashboard e os alertas já refletem o novo limite.' }) }}
              >
                Guardar limite
              </Button>
              {s.baselineRealized > 0 && (
                <p className="mt-3 text-xs text-ink-3">
                  Inclui {formatHours(s.baselineRealized)} realizadas antes do período de dados desta demonstração (histórico importado).
                </p>
              )}
              <GaugeLegend className="mt-4" />
            </Panel>
          </div>
          <p className="mt-2 text-xs text-ink-3">Pausas descontadas segundo as definições ({settings.defaultBreak} min).</p>
        </TabPanel>
        <TabPanel value="documentos">
          <Panel title="Documentos da obra" description="Requisitos ilustrativos por país; não constituem aconselhamento jurídico." flush>
            <ul className="divide-y divide-line-2">
              {docTypes.map((t) => {
                const d = latestDoc(db, id, t.id)
                const st = docState(d, today)
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{t.name}</span>
                      <span className="block text-xs text-ink-3">{d ? `${d.number} · ${d.expiresAt ? `até ${dateNumeric(d.expiresAt)}` : 'sem validade'}` : 'Sem registo'}</span>
                    </span>
                    <Badge tone={st === 'valido' ? 'ok' : st === 'a_expirar' || st === 'por_verificar' ? 'warn' : 'danger'} dot>{DOC_STATE_LABEL[st]}</Badge>
                    <Button size="sm" variant={st === 'valido' ? 'ghost' : 'primary'} icon={<FileUp className="size-3.5" />} onClick={() => setDocType(t.id)}>{d ? 'Atualizar' : 'Registar'}</Button>
                  </li>
                )
              })}
            </ul>
          </Panel>
          {docType && <DocumentDialog open onOpenChange={() => setDocType(null)} ownerType="obra" ownerId={id} typeId={docType} />}
        </TabPanel>
        <TabPanel value="alojamento">
          <SiteLodging site={s} />
        </TabPanel>
        <TabPanel value="diario">
          <SiteDiary site={s} />
        </TabPanel>
        <TabPanel value="historico">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Problemas reportados" flush>
              {issues.length === 0 ? <p className="px-4 py-4 text-sm text-ink-3">Sem problemas reportados.</p> : (
                <ul className="divide-y divide-line-2">
                  {issues.map((i) => (
                    <li key={i.id} className="px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge tone={i.status === 'aberto' ? 'warn' : 'ok'} dot>{i.status === 'aberto' ? 'Aberto' : 'Resolvido'}</Badge>
                        <span className="text-xs text-ink-3">{ISSUE_CATEGORY[i.category]} · {i.reportedBy} · {dateShort(i.at.slice(0, 10))}</span>
                      </div>
                      <p className="mt-1">{i.text}</p>
                      {i.status === 'aberto' && <Button size="sm" variant="ghost" className="mt-1" onClick={() => { resolveIssue(i.id); toast.success('Problema marcado como resolvido') }}>Marcar como resolvido</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Atividade">
              <ActivityList events={db.activity.filter((e) => e.refs.siteId === id)} limit={30} />
            </Panel>
          </div>
        </TabPanel>
      </Tabs>
    </div>
  )
}
