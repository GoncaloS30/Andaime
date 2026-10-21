import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { AlertTriangle, CalendarDays, FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/ui/Button'
import { Select } from '@/ui/Field'
import { Panel } from '@/ui/Layout'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { ApiError, api, downloadFile, errorMessage } from '../../api/http'
import { minutesToHours, todayIso } from '../../api/workforce'
import { useActiveOrg } from '../../session'

interface HrBookPreview {
  month: string
  sheets: number
  rows: number
  workedMin: number
  absenceDays: number
  /** Dias com horas em semanas ainda por aprovar: ficam fora do livro. */
  pendingDays: number
  activityCodes: { label: string; code: string }[]
  people: { employeeId: string; employeeName: string; employeeNumber: string; sheetName: string; rows: number; workedMin: number; absenceDays: number }[]
}

interface HrBookJob {
  id: string
  status: 'PENDING' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED'
  filename: string | null
  errorCode: string | null
  errorDetail: string | null
}

/** Os últimos 6 meses (o atual primeiro), em `AAAA-MM`. */
function lastMonths(today: string, count = 6): string[] {
  const [y, m] = today.split('-').map(Number) as [number, number]
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7))
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Pede o livro à fila de exportações, acompanha o job e descarrega o Excel quando estiver pronto. */
async function downloadHrBook(orgId: string, month: string) {
  let job = await api<HrBookJob>(`/orgs/${orgId}/reporting/exports`, { method: 'POST', body: { kind: 'HR_BOOK', month } })
  const deadline = Date.now() + 120_000
  while (job.status === 'PENDING' || job.status === 'RUNNING') {
    if (Date.now() >= deadline) throw new ApiError(408, 'export-timeout', 'O livro continua a ser preparado. Tente novamente dentro de momentos.')
    await wait(750)
    job = await api<HrBookJob>(`/orgs/${orgId}/reporting/exports/${job.id}`)
  }
  if (job.status !== 'READY') {
    throw new ApiError(409, job.errorCode ?? `export-${job.status.toLowerCase()}`, job.errorDetail ?? 'Não foi possível gerar o livro.')
  }
  await downloadFile(`/orgs/${orgId}/reporting/exports/${job.id}/download`, job.filename ?? `livro-horas-rh-${month}.xlsx`)
}

/**
 * Livro de horas do RH: uma folha por pessoa ("Nome-Número") com as horas aprovadas do mês, as ausências aprovadas
 * com 0 h e o motivo, e a folha "Tabelas" com os códigos de atividade da política laboral.
 */
export function HrBookPanel() {
  const org = useActiveOrg()
  const months = lastMonths(todayIso())
  const [month, setMonth] = useState(months[0]!)
  const [busy, setBusy] = useState<'xlsx' | 'ics' | null>(null)
  const year = month.slice(0, 4)
  const preview = useQuery({
    queryKey: ['org', org.id, 'reporting', 'hr-book', month],
    queryFn: () => api<HrBookPreview>(`/orgs/${org.id}/reporting/hr-book?${new URLSearchParams({ month })}`),
    placeholderData: keepPreviousData,
  })
  const data = preview.data

  const run = async (kind: 'xlsx' | 'ics') => {
    setBusy(kind)
    try {
      if (kind === 'xlsx') {
        await downloadHrBook(org.id, month)
        toast.success(`Livro de ${monthLabel(month).toLowerCase()} descarregado`)
      } else {
        await downloadFile(`/orgs/${org.id}/absences/export.ics?${new URLSearchParams({ from: `${year}-01-01`, to: `${year}-12-31` })}`, `ferias-${year}.ics`)
        toast.success(`Férias aprovadas de ${year} descarregadas`)
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Mês" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 max-w-[220px]">
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </Select>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={<CalendarDays className="size-4" />} loading={busy === 'ics'} disabled={busy !== null} onClick={() => void run('ics')}>
            Férias {year} (.ics)
          </Button>
          <Button variant="primary" icon={<FileSpreadsheet className="size-4" />} loading={busy === 'xlsx'} disabled={busy !== null || !data || data.sheets === 0} onClick={() => void run('xlsx')}>
            Descarregar Excel
          </Button>
        </div>
      </div>

      <Panel
        flush
        title={`Livro de horas · ${monthLabel(month)}`}
        description="Horas aprovadas por pessoa e dia, com obra, código de atividade da política laboral e ordem ERP. As ausências aprovadas entram com 0 h e o motivo."
      >
        {preview.isPending ? (
          <SkeletonRows rows={5} />
        ) : preview.isError ? (
          <ErrorState onRetry={() => void preview.refetch()}>{errorMessage(preview.error)}</ErrorState>
        ) : (
          <div className="flex flex-col">
            <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
              {[
                ['Folhas', String(data!.sheets)],
                ['Linhas', String(data!.rows)],
                ['Dias de ausência', String(data!.absenceDays)],
                ['Horas aprovadas', minutesToHours(data!.workedMin)],
              ].map(([label, value]) => (
                <div key={label} className="bg-surface px-4 py-3">
                  <dt className="text-xs text-ink-3">{label}</dt>
                  <dd className="font-mono text-lg font-semibold tabular text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {data!.pendingDays > 0 && (
              <p className="flex items-start gap-2 border-b border-line px-4 py-2.5 text-sm text-ink-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-tijolo" aria-hidden />
                {data!.pendingDays === 1 ? '1 dia com horas' : `${data!.pendingDays} dias com horas`} em semanas por aprovar {data!.pendingDays === 1 ? 'fica' : 'ficam'} fora do livro. Aprove as folhas para as incluir.
              </p>
            )}
            {data!.sheets === 0 ? (
              <EmptyState compact title="Sem horas aprovadas nem ausências neste mês">Escolha outro mês ou aprove as folhas da semana.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-3">
                      <th scope="col" className="px-4 py-2 font-medium">Folha</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Linhas</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Horas</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Dias de ausência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.people.map((p) => (
                      <tr key={p.employeeId} className="border-b border-line-2">
                        <th scope="row" className="max-w-[320px] truncate px-4 py-1.5 text-left font-normal">{p.sheetName}</th>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular">{p.rows}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular">{minutesToHours(p.workedMin)}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-xs tabular">{p.absenceDays || <span className="text-ink-4">·</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="px-4 py-3 text-xs text-ink-3">
              Códigos de atividade (folha “Tabelas”): {data!.activityCodes.map((c) => `${c.label} ${c.code}`).join(' · ')}
            </p>
          </div>
        )}
      </Panel>
    </div>
  )
}
