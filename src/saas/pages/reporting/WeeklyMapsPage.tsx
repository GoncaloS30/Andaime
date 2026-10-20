import { ChevronLeft, ChevronRight, Download, FileSpreadsheet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button, IconButton } from '@/ui/Button'
import { Field, Segmented, Select } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { downloadWeeklyMap, useWeeklyMap, type WeeklyActual, type WeeklyMap, type WeeklyMapFilters, type WeeklyMapTemplate } from '../../api/reporting'
import { errorMessage } from '../../api/http'
import { addDaysIso, formatDate, todayIso, useClients, useEmployeeOptions, useSites, useTeams } from '../../api/workforce'
import { mondayOf } from '../../api/planning'
import { useActiveOrg } from '../../session'

const DAY = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: '2-digit', timeZone: 'UTC' })
const HOURS = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 })

function hours(minutes: number) {
  return `${HOURS.format(minutes / 60)} h`
}

function day(iso: string) {
  return DAY.format(new Date(`${iso}T00:00:00Z`)).replace('.', '')
}

function filterValue(value: string | null) {
  return value || undefined
}

function templateValue(value: string | null): WeeklyMapTemplate {
  return value === 'obra' || value === 'horas' || value === 'erp' ? value : 'equipa'
}

function isActual(report: WeeklyMap | WeeklyActual): report is WeeklyActual {
  return 'rows' in report
}

/** Mapas F6 alimentados exclusivamente pelo read model SQL do servidor. */
export function WeeklyMapsPage() {
  const org = useActiveOrg()
  const [search, setSearch] = useSearchParams()
  const week = mondayOf(search.get('semana') || todayIso())
  const template = templateValue(search.get('template'))
  const filters: WeeklyMapFilters = useMemo(
    () => ({
      teamId: filterValue(search.get('equipa')),
      siteId: filterValue(search.get('obra')),
      employeeId: filterValue(search.get('trabalhador')),
      clientId: filterValue(search.get('cliente')),
    }),
    [search],
  )
  const report = useWeeklyMap(org.id, week, template, filters)
  const teams = useTeams(org.id)
  const sites = useSites(org.id)
  const employees = useEmployeeOptions(org.id)
  const clients = useClients(org.id)
  const [exporting, setExporting] = useState(false)
  const hasData = report.data ? (isActual(report.data) ? report.data.rows.length > 0 : report.data.groups.length > 0) : false

  const set = (key: string, value?: string) => {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  const exportExcel = async () => {
    setExporting(true)
    try {
      await downloadWeeklyMap(org.id, week, template, filters)
      toast.success('Excel exportado', { description: `Semana ${report.data?.weekNumber ?? ''} gerada com os dados atuais.` })
    } catch (error) {
      toast.error('Não foi possível gerar o Excel', { description: errorMessage(error) })
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={org.name}
        title="Mapas semanais"
        description="Planeamento consolidado por equipa ou por obra. O Excel é gerado no servidor com os dados atuais."
        actions={
          <Button
            variant="primary"
            icon={<Download className="size-4" aria-hidden />}
            loading={exporting}
            disabled={!hasData}
            onClick={() => void exportExcel()}
          >
            Exportar Excel
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4" aria-label="Opções do mapa">
          <Panel>
            <div className="flex items-center justify-between rounded-md border border-line bg-cal p-1">
              <IconButton label="Semana anterior" onClick={() => set('semana', addDaysIso(week, -7))}>
                <ChevronLeft className="size-4" />
              </IconButton>
              <div className="text-center">
                <strong className="block text-sm">Semana {report.data?.weekNumber ?? '—'}</strong>
                <span className="text-xs text-ink-3">{formatDate(week)} – {formatDate(addDaysIso(week, 6))}</span>
              </div>
              <IconButton label="Semana seguinte" onClick={() => set('semana', addDaysIso(week, 7))}>
                <ChevronRight className="size-4" />
              </IconButton>
            </div>
          </Panel>

          <Panel title="Formato">
            <Segmented
              className="w-full"
              label="Formato do mapa"
              value={template}
              onChange={(value) => set('template', value === 'equipa' ? undefined : value)}
              options={[
                { value: 'equipa', label: 'Equipa' }, { value: 'obra', label: 'Obra' },
                { value: 'horas', label: 'Horas' }, { value: 'erp', label: 'ERP' },
              ]}
            />
            <p className="mt-3 text-xs text-ink-3">Equipa e obra usam o planeamento; horas e ERP incluem apenas registos aprovados.</p>
          </Panel>

          <Panel title="Filtros">
            <div className="flex flex-col gap-3">
              <Field label="Equipa">{(props) => <Select {...props} value={filters.teamId ?? ''} onChange={(event) => set('equipa', event.target.value)}><option value="">Todas</option>{teams.data?.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</Select>}</Field>
              <Field label="Obra">{(props) => <Select {...props} value={filters.siteId ?? ''} onChange={(event) => set('obra', event.target.value)}><option value="">Todas</option>{sites.data?.map((site) => <option key={site.id} value={site.id}>{site.code} · {site.name}</option>)}</Select>}</Field>
              <Field label="Cliente">{(props) => <Select {...props} value={filters.clientId ?? ''} onChange={(event) => set('cliente', event.target.value)}><option value="">Todos</option>{clients.data?.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</Select>}</Field>
              <Field label="Trabalhador">{(props) => <Select {...props} value={filters.employeeId ?? ''} onChange={(event) => set('trabalhador', event.target.value)}><option value="">Todos</option>{employees.data?.items.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</Select>}</Field>
            </div>
          </Panel>
        </aside>

        <Panel
          title={{ equipa: 'Mapa por equipa', obra: 'Mapa por obra', horas: 'Folha de horas', erp: 'Exportação ERP' }[template]}
          description={report.data ? isActual(report.data)
            ? `${report.data.totals.employees} pessoas · ${report.data.totals.sites} obras · ${hours(report.data.totals.workedMin)} aprovadas`
            : `${report.data.totals.employees} pessoas · ${report.data.totals.sites} obras · ${hours(report.data.totals.plannedMin)} planeadas` : undefined}
          flush
        >
          {report.isPending ? (
            <SkeletonRows rows={8} />
          ) : report.isError ? (
            <ErrorState onRetry={() => void report.refetch()}>{errorMessage(report.error)}</ErrorState>
          ) : !hasData ? (
            <EmptyState icon={<FileSpreadsheet />} title="Sem planeamento nesta semana">
              {template === 'horas' || template === 'erp'
                ? 'Não existem registos de horas aprovados para esta semana e filtros.'
                : 'Altere a semana ou os filtros, ou crie primeiro as atribuições no planeamento.'}
            </EmptyState>
          ) : isActual(report.data) ? <ActualMap report={report.data} erp={template === 'erp'} />
            : template === 'equipa' ? <TeamMap report={report.data} /> : <SiteMap report={report.data} />}
        </Panel>
      </div>
    </>
  )
}

function TeamMap({ report }: { report: WeeklyMap }) {
  return (
    <div className="overflow-x-auto focus-visible:outline-2" tabIndex={0} role="region" aria-label="Tabela (desloque para ver todas as colunas)">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b border-line bg-cal text-left text-xs text-ink-3">
          <tr><th className="px-3 py-2">Equipa / trabalhadores</th><th>Dias</th><th>Obra</th><th>Trabalho</th><th>Horário</th><th>Viatura</th><th className="px-3 text-right">Horas</th></tr>
        </thead>
        {report.groups.map((group) => (
          <tbody key={group.key} className="border-b border-line-2">
            <tr className="bg-line-2/45 font-semibold">
              <td className="border-l-4 px-3 py-2" style={{ borderLeftColor: group.teamColor }}>{group.teamName}</td>
              <td className="whitespace-nowrap">{group.dates.map(day).join(', ')}</td>
              <td><span className="font-mono text-xs">{group.siteCode}</span> {group.siteName}</td>
              <td className="max-w-56 text-xs font-normal">{group.notes.join(' · ')}</td>
              <td className="whitespace-nowrap font-mono text-xs">{group.schedule}</td>
              <td className="font-mono text-xs">{group.vehicles.join(', ') || '—'}</td>
              <td className="px-3 text-right tabular-nums">{hours(group.totalMin)}</td>
            </tr>
            {group.workers.map((worker) => (
              <tr key={worker.employeeId} className="text-ink-2">
                <td className="px-5 py-1">{worker.name}{worker.foreman && <span className="ml-1 text-xs text-ambar-ink">(resp.)</span>}</td>
                <td className="text-xs">{Object.keys(worker.minutesByDate).map(day).join(', ')}</td>
                <td colSpan={4} />
                <td className="px-3 text-right tabular-nums">{hours(worker.totalMin)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

function SiteMap({ report }: { report: WeeklyMap }) {
  const sites = [...new Set(report.groups.map((group) => group.siteId))]
  return (
    <div className="flex flex-col gap-5 p-4">
      {sites.map((siteId) => {
        const groups = report.groups.filter((group) => group.siteId === siteId)
        const first = groups[0]!
        return (
          <div key={siteId} className="overflow-x-auto rounded-md border border-line focus-visible:outline-2" tabIndex={0} role="region" aria-label="Tabela da obra (desloque para ver todas as colunas)">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="bg-pinho px-3 py-2 text-left font-semibold text-white">{first.siteCode} — {first.siteName}<span className="font-normal text-white/70">{first.city ? ` · ${first.city}` : ''}{first.clientName ? ` · ${first.clientName}` : ''}</span></caption>
              <thead className="bg-cal text-xs text-ink-3"><tr><th className="px-3 py-2 text-left">Trabalhador</th><th className="text-left">Equipa</th>{report.days.map((date) => <th key={date} className="text-right">{day(date)}</th>)}<th className="px-3 text-right">Total</th></tr></thead>
              <tbody>
                {groups.flatMap((group) => group.workers.map((worker) => (
                  <tr key={`${group.key}-${worker.employeeId}`} className="border-t border-line-2">
                    <td className="px-3 py-1.5">{worker.name}</td><td className="text-xs text-ink-3">{group.teamName}</td>
                    {report.days.map((date) => <td key={date} className="text-right font-mono text-xs">{worker.minutesByDate[date] ? hours(worker.minutesByDate[date]) : ''}</td>)}
                    <td className="px-3 text-right font-mono text-xs font-semibold">{hours(worker.totalMin)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function ActualMap({ report, erp }: { report: WeeklyActual; erp: boolean }) {
  return (
    <div className="overflow-x-auto focus-visible:outline-2" tabIndex={0} role="region" aria-label="Tabela (desloque para ver todas as colunas)">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-line bg-cal text-left text-xs text-ink-3"><tr>
          <th className="px-3 py-2">N.º / trabalhador</th><th>Data</th><th>Obra</th>
          {erp ? <><th>Ordem ERP</th><th>Código</th></> : <><th>Entrada</th><th>Saída</th></>}
          <th className="text-right">Normal</th><th className="text-right">Extra</th><th className="px-3 text-right">Total</th>
        </tr></thead>
        <tbody>{report.rows.map((row, index) => (
          <tr key={`${row.employeeId}-${row.date}-${row.siteId}-${index}`} className="border-b border-line-2 last:border-0">
            <td className="px-3 py-2"><span className="mr-2 font-mono text-xs text-ink-3">{row.employeeNumber}</span>{row.employeeName}</td>
            <td>{formatDate(row.date)}</td><td><span className="font-mono text-xs">{row.siteCode}</span> {row.siteName}</td>
            {erp ? <><td>{row.erpOrder || '—'}</td><td className="font-mono text-xs">{row.activityCode}</td></>
              : <><td className="font-mono text-xs">{row.clockIn?.slice(0, 5) ?? '—'}</td><td className="font-mono text-xs">{row.clockOut?.slice(0, 5) ?? '—'}</td></>}
            <td className="text-right font-mono text-xs">{hours(row.normalMin)}</td><td className="text-right font-mono text-xs">{hours(row.overtimeMin)}</td><td className="px-3 text-right font-mono text-xs font-semibold">{hours(row.workedMin)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}
