import { Building2, LayoutGrid, Plus, Rows3, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useDerived } from '@/app/hooks'
import { ModuleGuard } from '@/app/ModuleGuard'
import { formatHours } from '@/domain/hours'
import { COUNTRY_NAME, SITE_STATUS } from '@/domain/labels'
import { delayWorkdays } from '@/domain/planning'
import { selectAllSiteMetrics } from '@/store/selectors'
import { Badge, SiteCode } from '@/ui/Badge'
import { buttonStyles } from '@/ui/Button'
import { Input, Segmented, Select } from '@/ui/Field'
import { GaugeLegend, HoursGauge, HoursStatus } from '@/ui/HoursGauge'
import { PageHeader } from '@/ui/Layout'
import { EmptyState } from '@/ui/States'
import { CountryTag } from '../shared/Country'
import { SiteCard } from './SiteCard'

export function SitesPage() {
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') ?? ''
  const status = sp.get('estado') ?? ''
  const country = sp.get('pais') ?? ''
  const risk = sp.get('risco') ?? ''
  const view = sp.get('vista') === 'tabela' ? 'tabela' : 'cartoes'
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })
  const metrics = useDerived(selectAllSiteMetrics)
  const data = useDerived(({ db }) => Object.values(db.sites).map((s) => ({ s, client: db.clients[s.clientId], foreman: s.foremanId ? db.workers[s.foremanId] : undefined, teams: Object.values(db.teams).filter((t) => t.siteId === s.id) })))
  const list = data
    .filter(({ s, client }) => !q || `${s.code} ${s.name} ${s.city} ${client?.name}`.toLowerCase().includes(q.toLowerCase()))
    .filter(({ s }) => !status || s.status === status)
    .filter(({ s }) => !country || s.country === country)
    .filter(({ s }) => !risk || (risk === 'risco' ? ['atencao', 'excede'].includes(metrics[s.id]!.status) : metrics[s.id]!.status === risk))
    .sort((a, b) => a.s.code.localeCompare(b.s.code))

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Obras"
        description={`${data.filter((d) => d.s.status === 'em_curso').length} em curso em ${new Set(data.map((d) => d.s.country)).size} países`}
        actions={<Link to="/obras/nova" className={buttonStyles('primary')} data-tour="new-site"><Plus className="size-4" aria-hidden /> Nova obra</Link>}
      />
      <ModuleGuard empty={{ icon: <Building2 />, title: 'Ainda não há obras', text: 'Crie a primeira obra com o cliente, a localização e o limite de horas.', action: <Link to="/obras/nova" className={buttonStyles('primary')}>Criar obra</Link> }}>
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
            <label className="sr-only" htmlFor="s-q">Pesquisar</label>
            <Input id="s-q" value={q} onChange={(e) => set('q', e.target.value)} placeholder="Código, nome, cidade ou cliente" className="w-64 pl-8" />
          </div>
          <label className="sr-only" htmlFor="s-st">Estado</label>
          <Select id="s-st" value={status} onChange={(e) => set('estado', e.target.value)} className="w-40">
            <option value="">Todos os estados</option>
            {Object.entries(SITE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <label className="sr-only" htmlFor="s-c">País</label>
          <Select id="s-c" value={country} onChange={(e) => set('pais', e.target.value)} className="w-40">
            <option value="">Todos os países</option>
            {Object.entries(COUNTRY_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <label className="sr-only" htmlFor="s-r">Horas</label>
          <Select id="s-r" value={risk} onChange={(e) => set('risco', e.target.value)} className="w-48">
            <option value="">Qualquer consumo</option>
            <option value="risco">Em risco (≥ 85 %)</option>
            <option value="excede">A exceder o limite</option>
            <option value="normal">Dentro do limite</option>
          </Select>
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
        {view === 'cartoes' ? (
          list.length === 0 ? (
            <div className="rounded-lg border border-line bg-surface">
              <EmptyState icon={<Search />} title="Nenhuma obra encontrada">Ajuste a pesquisa ou os filtros.</EmptyState>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map(({ s, client, foreman, teams }, i) => (
                // As primeiras capas estão à vista ao abrir: carregam já; a primeira é a candidata a LCP.
                <SiteCard key={s.id} s={s} client={client} foreman={foreman} teams={teams} m={metrics[s.id]!} priority={i === 0} eager={i < 3} />
              ))}
            </div>
          )
        ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          {list.length === 0 ? (
            <EmptyState icon={<Search />} title="Nenhuma obra encontrada">Ajuste a pesquisa ou os filtros.</EmptyState>
          ) : (
            <table className="table-a min-w-[1040px]">
              <thead>
                <tr>
                  <th scope="col">Obra</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Local</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Equipa e encarregado</th>
                  <th scope="col" className="w-[28%]">Horas face ao limite</th>
                  <th scope="col" className="num">Realizadas / limite</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ s, client, foreman, teams }) => {
                  const m = metrics[s.id]!
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/obras/${s.id}`} className="block hover:underline">
                          <SiteCode code={s.code} color={s.color} />
                          <span className="block font-semibold text-ink">{s.name}</span>
                        </Link>
                      </td>
                      <td className="max-w-48 truncate text-ink-2">{client?.name}</td>
                      <td><CountryTag country={s.country} /> <span className="text-xs text-ink-2">{s.city}</span></td>
                      <td>
                        <Badge tone={s.status === 'em_curso' ? 'ok' : s.status === 'planeada' ? 'info' : 'neutral'} dot>{SITE_STATUS[s.status]}</Badge>
                        {delayWorkdays(s) > 0 && <Badge tone="warn" className="ml-1">Atraso {delayWorkdays(s)} d</Badge>}
                      </td>
                      <td className="text-xs">
                        {teams.map((t) => t.name).join(', ') || <span className="text-ink-3">Sem equipa</span>}
                        <span className="block text-ink-3">{foreman?.name ?? 'Sem encarregado'}</span>
                      </td>
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
          )}
        </div>
        )}
        <GaugeLegend className="mt-3" />
      </ModuleGuard>
    </div>
  )
}
