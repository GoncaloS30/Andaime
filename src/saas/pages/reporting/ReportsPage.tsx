import { BarChart3, CalendarRange, CarFront, Clock3, FileCheck2, HardHat, UsersRound } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Field, Input } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { addDaysIso, formatDate, todayIso } from '../../api/workforce'
import { errorMessage } from '../../api/http'
import { useDocumentReport, useHoursReport, usePlannedActual, usePlanningOverview, useTeamDistribution, useVehicleReport } from '../../api/reporting'
import { useActiveOrg } from '../../session'

const NUMBER = new Intl.NumberFormat('pt-PT')
const HOURS = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 })

function hours(minutes: number) {
  return `${HOURS.format(minutes / 60)} h`
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Panel>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-line-2 text-pinho">{icon}</span>
        <div><p className="text-xs text-ink-3">{label}</p><p className="font-wide text-xl font-semibold tabular-nums">{value}</p></div>
      </div>
    </Panel>
  )
}

/** Relatórios F6: apenas dados agregados no PostgreSQL, sem store nem valores de demonstração. */
export function ReportsPage() {
  const org = useActiveOrg()
  const [search, setSearch] = useSearchParams()
  const today = todayIso()
  const from = search.get('de') ?? addDaysIso(today, -27)
  const to = search.get('ate') ?? today
  const overview = usePlanningOverview(org.id, from, to)
  const teams = useTeamDistribution(org.id, from, to)
  const vehicles = useVehicleReport(org.id, from, to)
  const sites = usePlannedActual(org.id, from, to)
  const actualHours = useHoursReport(org.id, from, to, 'employee')
  const documents = useDocumentReport(org.id)
  const queries = useMemo(() => [overview, teams, vehicles, sites, actualHours, documents], [overview, teams, vehicles, sites, actualHours, documents])
  const pending = queries.some((query) => query.isPending)
  const failed = queries.find((query) => query.isError)

  const setDate = (key: 'de' | 'ate', value: string) => setSearch((current) => {
    const next = new URLSearchParams(current)
    next.set(key, value)
    return next
  }, { replace: true })

  return (
    <>
      <PageHeader eyebrow={org.name} title="Relatórios" description="Planeamento, equipas e viaturas calculados no servidor para o período selecionado.">
        <div className="mt-2 flex flex-wrap gap-3 rounded-lg border border-line bg-surface p-3">
          <Field label="De">{(props) => <Input {...props} type="date" value={from} max={to} onChange={(event) => setDate('de', event.target.value)} />}</Field>
          <Field label="Até">{(props) => <Input {...props} type="date" value={to} min={from} onChange={(event) => setDate('ate', event.target.value)} />}</Field>
          <div className="self-end pb-2 text-xs text-ink-3"><CalendarRange className="mr-1 inline size-4" />{formatDate(from)} – {formatDate(to)}</div>
        </div>
      </PageHeader>

      {pending ? <SkeletonRows rows={8} /> : failed ? (
        <ErrorState onRetry={() => queries.forEach((query) => void query.refetch())}>{errorMessage(failed.error)}</ErrorState>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Horas planeadas" value={hours(overview.data?.plannedMin ?? 0)} icon={<Clock3 className="size-5" />} />
            <Metric label="Trabalhadores" value={NUMBER.format(overview.data?.employees ?? 0)} icon={<UsersRound className="size-5" />} />
            <Metric label="Obras" value={NUMBER.format(overview.data?.sites ?? 0)} icon={<HardHat className="size-5" />} />
            <Metric label="Atribuições" value={NUMBER.format(overview.data?.assignments ?? 0)} icon={<BarChart3 className="size-5" />} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Distribuição por equipa" description="Tempo planeado e alcance no período" flush>
              {!teams.data?.length ? <EmptyState compact icon={<UsersRound />} title="Sem equipas planeadas">Não existem atribuições no período.</EmptyState> : (
                <div className="overflow-x-auto focus-visible:outline-2" tabIndex={0} role="region" aria-label="Tabela (desloque para ver todas as colunas)"><table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-line bg-cal text-left text-xs text-ink-3"><tr><th className="px-4 py-2">Equipa</th><th className="text-right">Pessoas</th><th className="text-right">Obras</th><th className="px-4 text-right">Horas</th></tr></thead>
                  <tbody>{teams.data.map((team) => <tr key={team.teamId ?? 'none'} className="border-b border-line-2 last:border-0"><td className="px-4 py-2"><span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: team.teamColor }} />{team.teamName}</td><td className="text-right tabular-nums">{team.employees}</td><td className="text-right tabular-nums">{team.sites}</td><td className="px-4 text-right font-mono text-xs">{hours(team.plannedMin)}</td></tr>)}</tbody>
                </table></div>
              )}
            </Panel>

            <Panel title="Utilização de viaturas" description="Dias e ocupação máxima observada no planeamento" flush>
              {!vehicles.data?.length ? <EmptyState compact icon={<CarFront />} title="Sem viaturas">Ainda não existem viaturas ativas.</EmptyState> : (
                <div className="overflow-x-auto focus-visible:outline-2" tabIndex={0} role="region" aria-label="Tabela (desloque para ver todas as colunas)"><table className="w-full min-w-[620px] text-sm">
                  <thead className="border-b border-line bg-cal text-left text-xs text-ink-3"><tr><th className="px-4 py-2">Viatura</th><th className="text-right">Dias</th><th className="text-right">Pico / lugares</th><th className="px-4 text-right">Horas</th></tr></thead>
                  <tbody>{vehicles.data.map((vehicle) => <tr key={vehicle.vehicleId} className="border-b border-line-2 last:border-0"><td className="px-4 py-2"><span className="font-mono text-xs font-semibold">{vehicle.plate}</span><span className="ml-2 text-xs text-ink-3">{[vehicle.make, vehicle.model].filter(Boolean).join(' ')}</span></td><td className="text-right tabular-nums">{vehicle.assignmentDays}</td><td className="text-right tabular-nums">{vehicle.peakRiders} / {vehicle.seats}</td><td className="px-4 text-right font-mono text-xs">{hours(vehicle.plannedMin)}</td></tr>)}</tbody>
                </table></div>
              )}
            </Panel>
          </div>
          <Panel title="Planeado e realizado por obra" description="Planeamento do período e histórico operacional importado" flush>
            {!sites.data?.rows.length ? <EmptyState compact icon={<HardHat />} title="Sem obras">Crie uma obra para começar a acompanhar os totais.</EmptyState> : (
              <div className="overflow-x-auto focus-visible:outline-2" tabIndex={0} role="region" aria-label="Tabela (desloque para ver todas as colunas)"><table className="w-full min-w-[780px] text-sm">
                <thead className="border-b border-line bg-cal text-left text-xs text-ink-3"><tr><th className="px-4 py-2">Obra</th><th className="text-right">Realizadas</th><th className="text-right">Aprovadas</th><th className="text-right">Planeadas</th><th className="text-right">Limite</th><th className="px-4 text-right">Projeção</th></tr></thead>
                <tbody>{sites.data.rows.map((site) => <tr key={site.siteId} className="border-b border-line-2 last:border-0"><td className="px-4 py-2"><span className="font-mono text-xs">{site.siteCode}</span><span className="ml-2">{site.siteName}</span></td><td className="text-right font-mono text-xs">{hours(site.actualMin)}</td><td className="text-right font-mono text-xs">{hours(site.approvedMin)}</td><td className="text-right font-mono text-xs">{hours(site.plannedMin)}</td><td className="text-right font-mono text-xs">{site.hourLimitMin == null ? '—' : hours(site.hourLimitMin)}</td><td className="px-4 text-right tabular-nums">{site.projectedPercent == null ? '—' : `${site.projectedPercent}%`}</td></tr>)}</tbody>
              </table></div>
            )}
          </Panel>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <Panel title="Horas aprovadas por trabalhador" description="Só folhas aprovadas no período" flush>
              {!actualHours.data?.groups.length ? <EmptyState compact icon={<Clock3 />} title="Sem horas aprovadas">Os registos aparecem depois da aprovação da folha.</EmptyState> : (
                <div className="overflow-x-auto focus-visible:outline-2" tabIndex={0} role="region" aria-label="Tabela (desloque para ver todas as colunas)"><table className="w-full min-w-[620px] text-sm">
                  <thead className="border-b border-line bg-cal text-left text-xs text-ink-3"><tr><th className="px-4 py-2">Trabalhador</th><th className="text-right">Registos</th><th className="text-right">Normal</th><th className="text-right">Extra</th><th className="px-4 text-right">Total</th></tr></thead>
                  <tbody>{actualHours.data.groups.map((group) => <tr key={group.key} className="border-b border-line-2 last:border-0"><td className="px-4 py-2">{group.label}</td><td className="text-right tabular-nums">{group.entries}</td><td className="text-right font-mono text-xs">{hours(group.normalMin)}</td><td className="text-right font-mono text-xs">{hours(group.overtimeMin)}</td><td className="px-4 text-right font-mono text-xs font-semibold">{hours(group.workedMin)}</td></tr>)}</tbody>
                </table></div>
              )}
            </Panel>
            <Panel title="Documentos" description="Estado atual de conformidade" flush>
              {!documents.data?.total ? <EmptyState compact icon={<FileCheck2 />} title="Sem documentos projetados">Os estados surgem quando forem registados no módulo documental.</EmptyState> : (
                <ul className="divide-y divide-line-2">{documents.data.statuses.map((state) => <li key={state.status} className="flex items-center justify-between px-4 py-2 text-sm"><span>{documentLabel(state.status)}</span><strong className="tabular-nums">{state.documents}</strong></li>)}</ul>
              )}
            </Panel>
          </div>
          <p className="text-xs text-ink-3">Os valores realizados/aprovados incluem o histórico importado e as projeções de registos aprovados. Dados em rascunho ou revisão não entram nos totais.</p>
        </div>
      )}
    </>
  )
}

function documentLabel(status: string) {
  return ({ VALID: 'Válidos', EXPIRING: 'A expirar', PENDING: 'Por verificar', EXPIRED: 'Expirados', REJECTED: 'Rejeitados', MISSING: 'Em falta' } as Record<string, string>)[status] ?? status
}
