import { BarChart3, FileDown, FileSpreadsheet } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { ModuleGuard } from '@/app/ModuleGuard'
import { availability } from '@/domain/availability'
import { DOC_STATE_LABEL, docState, type DocState } from '@/domain/documents'
import { entryHours } from '@/domain/hours'
import { buildIndex } from '@/domain/indexes'
import { COUNTRY_NAME } from '@/domain/labels'
import { workdaysBetween } from '@/domain/planning'
import { addDays, dateShort, dayShort, weekStart } from '@/domain/weeks'
import { downloadCSV, downloadXLSX, type Column } from '@/lib/exportTable'
import { selectAllSiteMetrics } from '@/store/selectors'
import { Button } from '@/ui/Button'
import { PageHeader, Panel } from '@/ui/Layout'
import { TabPanel, Tabs } from '@/ui/Tabs'

type Row = Record<string, string | number | null>

interface Col extends Column {
  num?: boolean
  bar?: number
  render?: (r: Row) => ReactNode
}

function ReportTable({ id, title, description, columns, rows, footnote }: { id: string; title: string; description: string; columns: Col[]; rows: Row[]; footnote?: string }) {
  const exportCols = columns.map(({ key, label }) => ({ key, label }))
  return (
    <Panel
      id={id}
      title={title}
      description={description}
      actions={
        <>
          <Button size="sm" variant="ghost" icon={<FileDown className="size-3.5" />} onClick={() => { downloadCSV(`${title} - Andaime`, exportCols, rows); toast.success('CSV exportado') }}>CSV</Button>
          <Button size="sm" variant="ghost" icon={<FileSpreadsheet className="size-3.5" />} onClick={async () => { await downloadXLSX(`${title} - Andaime`, title, exportCols, rows); toast.success('Excel exportado') }}>Excel</Button>
        </>
      }
      flush
    >
      <div className="overflow-x-auto">
        <table className="table-a min-w-[720px]">
          <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.num ? 'num' : undefined}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? 'num font-mono text-xs' : undefined}>
                    {c.render ? c.render(r) : c.bar !== undefined ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line-2" aria-hidden>
                          <span className="block h-full rounded-full bg-pinho" style={{ width: `${Math.min(100, ((Number(r[c.key]) || 0) / (c.bar || 1)) * 100)}%` }} />
                        </span>
                        <span className="w-14 text-right">{typeof r[c.key] === 'number' ? (r[c.key] as number).toLocaleString('pt-PT') : r[c.key]}</span>
                      </span>
                    ) : typeof r[c.key] === 'number' ? (r[c.key] as number).toLocaleString('pt-PT') : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footnote && <p className="border-t border-line-2 px-4 py-2 text-xs text-ink-3">{footnote}</p>}
    </Panel>
  )
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function ReportsPage() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('vista') ?? 'horas'
  const data = useDerived(({ db, session }) => {
    const today = session.today
    const from = addDays(weekStart(today), -28)
    const idx = buildIndex(db)
    const metrics = selectAllSiteMetrics({ db, session })
    // Horas por obra e por equipa (últimas 4 semanas + atual)
    const bySite = new Map<string, { realized: number; approved: number; extra: number; cost: number }>()
    const byTeam = new Map<string, { realized: number; extra: number; cost: number; people: Set<string> }>()
    for (const e of Object.values(db.entries)) {
      if (e.date < from || !e.clockOut || !['submetido', 'revisto', 'aprovado'].includes(e.status)) continue
      const h = entryHours(e, session.settings)
      const w = db.workers[e.workerId]
      const cost = h.worked * (w?.hourlyCost ?? 0) + h.extra * (w?.hourlyCost ?? 0) * 0.5
      const s = bySite.get(e.siteId) ?? { realized: 0, approved: 0, extra: 0, cost: 0 }
      s.realized += h.worked
      if (e.status === 'aprovado') s.approved += h.worked
      s.extra += h.extra
      s.cost += cost
      bySite.set(e.siteId, s)
      const tid = w?.teamId ?? 'sem'
      const t = byTeam.get(tid) ?? { realized: 0, extra: 0, cost: 0, people: new Set() }
      t.realized += h.worked
      t.extra += h.extra
      t.cost += cost
      t.people.add(e.workerId)
      byTeam.set(tid, t)
    }
    const hoursSites: Row[] = [...bySite.entries()].map(([sid, v]) => ({ obra: `${db.sites[sid]?.code} ${db.sites[sid]?.name}`, realizadas: r1(v.realized), aprovadas: r1(v.approved), extra: r1(v.extra), custo: Math.round(v.cost) })).sort((a, b) => Number(b.realizadas) - Number(a.realizadas))
    const hoursTeams: Row[] = [...byTeam.entries()].map(([tid, v]) => ({ equipa: db.teams[tid]?.name ?? 'Sem equipa', pessoas: v.people.size, realizadas: r1(v.realized), extra: r1(v.extra), custo: Math.round(v.cost) })).sort((a, b) => Number(b.realizadas) - Number(a.realizadas))
    // Ocupação do planeamento: próximas 2 semanas
    const days = workdaysBetween(today, addDays(weekStart(today), 13))
    const planning: Row[] = Object.values(db.teams).map((t) => {
      const capacity = t.memberIds.reduce((s, m) => s + days.filter((d) => availability(db.workers[m]!, d, idx).state !== 'ausente').length * (db.workers[m]?.dailyHours ?? 8), 0)
      const planned = Object.values(db.assignments).filter((a) => t.memberIds.includes(a.workerId) && a.date >= today && a.date <= days[days.length - 1]!).reduce((s, a) => s + a.hours, 0)
      return { equipa: t.name, capacidade: capacity, planeadas: planned, ocupacao: capacity ? Math.round((planned / capacity) * 100) : 0 }
    })
    // Disponibilidade diária
    const avail: Row[] = days.map((d) => {
      const states = Object.values(db.workers).filter((w) => w.status === 'ativo').map((w) => availability(w, d, idx).state)
      return { dia: `${dayShort(d)} ${dateShort(d)}`, livres: states.filter((x) => x === 'livre').length, parciais: states.filter((x) => x === 'parcial').length, atribuidos: states.filter((x) => x === 'atribuido').length, ausentes: states.filter((x) => x === 'ausente').length }
    })
    // Obras
    const sites: Row[] = Object.values(db.sites).map((s) => {
      const m = metrics[s.id]!
      return { obra: `${s.code} ${s.name}`, pais: COUNTRY_NAME[s.country], limite: m.limit ?? null, realizadas: Math.round(m.realized), aprovadas: Math.round(m.approved), planeadas: Math.round(m.plannedFuture), saldo: m.balance === null ? null : Math.round(m.balance), projecao: m.limit ? Math.round(m.pctProjection * 100) : null }
    })
    // Viaturas
    const vdays = workdaysBetween(addDays(today, -28), today)
    const vehicles: Row[] = Object.values(db.vehicles).map((v) => {
      const used = new Set(Object.values(db.assignments).filter((a) => a.vehicleId === v.id && a.date >= vdays[0]! && a.date <= today).map((a) => a.date)).size
      return { viatura: `${v.plate} ${v.make} ${v.model}`, equipa: v.teamId ? (db.teams[v.teamId]?.name ?? '') : 'Reserva', dias: used, utilizacao: Math.round((used / vdays.length) * 100), seguro: v.insuranceUntil, inspecao: v.inspectionUntil }
    })
    // Documentos
    const docCount = new Map<DocState, number>()
    for (const d of Object.values(db.documents)) {
      const st = docState(d, today)
      docCount.set(st, (docCount.get(st) ?? 0) + 1)
    }
    const docs: Row[] = (['valido', 'a_expirar', 'por_verificar', 'expirado', 'rejeitado'] as DocState[]).map((st) => ({ estado: DOC_STATE_LABEL[st], documentos: docCount.get(st) ?? 0 }))
    return { hoursSites, hoursTeams, planning, avail, sites, vehicles, docs, days: days.length }
  })
  const max = (rows: Row[], k: string) => Math.max(1, ...rows.map((r) => Number(r[k]) || 0))
  const eur = (r: Row) => (Number(r.custo) || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader title="Relatórios" description="Números calculados a partir dos mesmos dados do planeamento e das horas. Exporte qualquer tabela em CSV ou Excel." />
      <ModuleGuard empty={{ icon: <BarChart3 />, title: 'Sem dados para relatórios', text: 'Os relatórios enchem-se com o planeamento e as horas registadas.' }}>
        <Tabs value={tab} onValueChange={(v) => setSp(v === 'horas' ? {} : { vista: v }, { replace: true })} label="Relatórios" tabs={[{ value: 'horas', label: 'Horas' }, { value: 'planeamento', label: 'Planeamento' }, { value: 'disponibilidade', label: 'Disponibilidade' }, { value: 'obras', label: 'Obras' }, { value: 'viaturas', label: 'Viaturas' }, { value: 'documentos', label: 'Documentos' }]}>
          <TabPanel value="horas" className="flex flex-col gap-4">
            <ReportTable id="r-obras" title="Horas por obra" description="Últimas 4 semanas e semana atual · realizadas válidas" rows={data.hoursSites} footnote="Custo estimado: horas × custo/hora do trabalhador, com acréscimo de 50 % nas horas extra. Valores de demonstração." columns={[{ key: 'obra', label: 'Obra' }, { key: 'realizadas', label: 'Realizadas (h)', num: true, bar: max(data.hoursSites, 'realizadas') }, { key: 'aprovadas', label: 'Aprovadas (h)', num: true }, { key: 'extra', label: 'Extra (h)', num: true }, { key: 'custo', label: 'Custo estimado', num: true, render: eur }]} />
            <ReportTable id="r-equipas" title="Horas por equipa" description="Mesmo período" rows={data.hoursTeams} columns={[{ key: 'equipa', label: 'Equipa' }, { key: 'pessoas', label: 'Pessoas', num: true }, { key: 'realizadas', label: 'Realizadas (h)', num: true, bar: max(data.hoursTeams, 'realizadas') }, { key: 'extra', label: 'Extra (h)', num: true }, { key: 'custo', label: 'Custo estimado', num: true, render: eur }]} />
          </TabPanel>
          <TabPanel value="planeamento">
            <ReportTable id="r-plan" title="Ocupação do planeamento" description={`De hoje até ao fim da próxima semana (${data.days} dias úteis)`} rows={data.planning} footnote="Capacidade: dias úteis sem ausência × horas normais de cada elemento." columns={[{ key: 'equipa', label: 'Equipa' }, { key: 'capacidade', label: 'Capacidade (h)', num: true }, { key: 'planeadas', label: 'Planeadas (h)', num: true }, { key: 'ocupacao', label: 'Ocupação (%)', num: true, bar: 100 }]} />
          </TabPanel>
          <TabPanel value="disponibilidade">
            <ReportTable id="r-disp" title="Disponibilidade por dia" description="Trabalhadores ativos" rows={data.avail} columns={[{ key: 'dia', label: 'Dia' }, { key: 'livres', label: 'Livres', num: true, bar: max(data.avail, 'livres') }, { key: 'parciais', label: 'Parciais', num: true }, { key: 'atribuidos', label: 'Atribuídos', num: true }, { key: 'ausentes', label: 'Ausentes', num: true }]} />
          </TabPanel>
          <TabPanel value="obras">
            <ReportTable id="r-sites" title="Obras e limite de horas" description="Inclui o histórico anterior importado" rows={data.sites} columns={[{ key: 'obra', label: 'Obra' }, { key: 'pais', label: 'País' }, { key: 'limite', label: 'Limite (h)', num: true }, { key: 'realizadas', label: 'Realizadas (h)', num: true }, { key: 'aprovadas', label: 'Aprovadas (h)', num: true }, { key: 'planeadas', label: 'Planeadas (h)', num: true }, { key: 'saldo', label: 'Saldo (h)', num: true }, { key: 'projecao', label: 'Projeção (%)', num: true, bar: 100 }]} />
          </TabPanel>
          <TabPanel value="viaturas">
            <ReportTable id="r-v" title="Utilização das viaturas" description="Dias úteis com viagens nas últimas 4 semanas" rows={data.vehicles} columns={[{ key: 'viatura', label: 'Viatura' }, { key: 'equipa', label: 'Equipa' }, { key: 'dias', label: 'Dias', num: true }, { key: 'utilizacao', label: 'Utilização (%)', num: true, bar: 100 }, { key: 'seguro', label: 'Seguro até' }, { key: 'inspecao', label: 'Inspeção até' }]} />
          </TabPanel>
          <TabPanel value="documentos">
            <ReportTable id="r-d" title="Documentos por estado" description="Todos os documentos registados" rows={data.docs} columns={[{ key: 'estado', label: 'Estado' }, { key: 'documentos', label: 'Documentos', num: true, bar: max(data.docs, 'documentos') }]} />
          </TabPanel>
        </Tabs>
        <p className="mt-3 text-xs text-ink-3">Relatórios de demonstração com dados fictícios.</p>
      </ModuleGuard>
    </div>
  )
}
