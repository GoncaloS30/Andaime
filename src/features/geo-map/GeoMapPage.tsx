import { ArrowUpRight, Map as MapIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useDerived } from '@/app/hooks'
import { ModuleGuard } from '@/app/ModuleGuard'
import { formatHours } from '@/domain/hours'
import { buildIndex, key } from '@/domain/indexes'
import { COUNTRY_NAME, SITE_STATUS } from '@/domain/labels'
import type { Country, ID, SiteStatus } from '@/domain/types'
import { cn } from '@/lib/cn'
import { selectAllSiteMetrics } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { Badge, Plate, SiteCode } from '@/ui/Badge'
import { buttonStyles } from '@/ui/Button'
import { ChipToggle, Select } from '@/ui/Field'
import { HoursGauge, HoursStatus } from '@/ui/HoursGauge'
import { PageHeader } from '@/ui/Layout'
import { SiteMap } from '../shared/SiteMap'

export function GeoMapPage() {
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const metrics = useDerived(selectAllSiteMetrics)
  const [countries, setCountries] = useState<Country[]>(['PT', 'FR', 'BE', 'DE'])
  const [status, setStatus] = useState<SiteStatus | ''>('')
  const [risk, setRisk] = useState('')
  const [selected, setSelected] = useState<ID | null>(null)
  const sites = Object.values(db.sites)
    .filter((s) => countries.includes(s.country))
    .filter((s) => !status || s.status === status)
    .filter((s) => !risk || (risk === 'risco' ? ['atencao', 'excede'].includes(metrics[s.id]!.status) : metrics[s.id]!.status === 'normal'))
    .sort((a, b) => a.code.localeCompare(b.code))
  const sel = selected ? db.sites[selected] : undefined
  const idx = buildIndex(db)
  const todayPeople = sel ? (idx.bySiteDate.get(key(sel.id, today)) ?? []) : []
  const teams = sel ? Object.values(db.teams).filter((t) => t.siteId === sel.id) : []
  const vehicles = [...new Set(todayPeople.map((a) => a.vehicleId).filter(Boolean))] as string[]

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader title="Mapa de obras" description="Onde estão as obras e as equipas, com o risco de horas de cada uma." />
      <ModuleGuard empty={{ icon: <MapIcon />, title: 'Sem obras no mapa', text: 'As obras aparecem aqui assim que tiverem localização.' }}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(Object.keys(COUNTRY_NAME) as Country[]).map((c) => (
            <ChipToggle key={c} pressed={countries.includes(c)} onClick={() => setCountries((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))}>
              {COUNTRY_NAME[c]} <span className="tabular opacity-70">{Object.values(db.sites).filter((s) => s.country === c).length}</span>
            </ChipToggle>
          ))}
          <label className="sr-only" htmlFor="m-st">Estado</label>
          <Select id="m-st" value={status} onChange={(e) => setStatus(e.target.value as SiteStatus | '')} className="h-8 w-40 text-sm">
            <option value="">Todos os estados</option>
            {Object.entries(SITE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <label className="sr-only" htmlFor="m-r">Risco</label>
          <Select id="m-r" value={risk} onChange={(e) => setRisk(e.target.value)} className="h-8 w-44 text-sm">
            <option value="">Qualquer risco</option>
            <option value="risco">Em risco de horas</option>
            <option value="normal">Dentro do limite</option>
          </Select>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <SiteMap
            pins={sites.map((s) => ({ site: s, risk: metrics[s.id]!.status }))}
            selected={selected}
            onSelect={setSelected}
            className="h-[min(70dvh,640px)] min-h-80"
            label="Mapa das obras"
          />
          <aside aria-label="Obras" className="flex max-h-[min(70dvh,640px)] flex-col overflow-hidden rounded-lg border border-line bg-surface">
            {sel ? (
              <div className="flex flex-col gap-3 overflow-y-auto p-4">
                <button type="button" onClick={() => setSelected(null)} className="self-start text-xs text-ink-3 hover:text-ink">← Todas as obras</button>
                <SiteCode code={sel.code} color={sel.color} />
                <h2 className="font-expanded text-lg leading-tight font-semibold">{sel.name}</h2>
                <p className="text-sm text-ink-3">{db.clients[sel.clientId]?.name} · {sel.city}, {COUNTRY_NAME[sel.country]}</p>
                <Badge tone={sel.status === 'em_curso' ? 'ok' : 'info'} dot>{SITE_STATUS[sel.status]}</Badge>
                <div>
                  <HoursGauge m={metrics[sel.id]!} />
                  <div className="mt-1 flex justify-between text-xs">
                    <HoursStatus m={metrics[sel.id]!} />
                    <span className="font-mono tabular">{formatHours(Math.round(metrics[sel.id]!.realized), '')} / {metrics[sel.id]!.limit ? formatHours(metrics[sel.id]!.limit!) : '—'}</span>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-ink-3">Hoje em obra</dt><dd className="font-semibold">{todayPeople.length} pessoas</dd></div>
                  <div><dt className="text-xs text-ink-3">Encarregado</dt><dd>{sel.foremanId ? db.workers[sel.foremanId]?.name : '—'}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-ink-3">Equipas</dt><dd>{teams.map((t) => t.name).join(', ') || '—'}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-ink-3">Viaturas hoje</dt><dd className="flex flex-wrap gap-1">{vehicles.length ? vehicles.map((v) => <Plate key={v} plate={db.vehicles[v]?.plate ?? ''} />) : '—'}</dd></div>
                </dl>
                <Link to={`/obras/${sel.id}`} className={buttonStyles('primary', 'md', 'mt-1')}>Abrir ficha da obra <ArrowUpRight className="size-4" aria-hidden /></Link>
              </div>
            ) : (
              <ul className="divide-y divide-line-2 overflow-y-auto">
                {sites.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setSelected(s.id)} className="flex w-full flex-col gap-1 px-4 py-2.5 text-left hover:bg-cal">
                      <span className="flex items-center justify-between gap-2">
                        <SiteCode code={s.code} color={s.color} />
                        <HoursStatus m={metrics[s.id]!} />
                      </span>
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className={cn('text-xs text-ink-3')}>{s.city}, {COUNTRY_NAME[s.country]}</span>
                    </button>
                  </li>
                ))}
                {sites.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-3">Nenhuma obra com estes filtros.</li>}
              </ul>
            )}
          </aside>
        </div>
      </ModuleGuard>
    </div>
  )
}
