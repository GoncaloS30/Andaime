import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ApiError, api } from './http'

export type WeeklyMapTemplate = 'equipa' | 'obra' | 'horas' | 'erp'

export interface WeeklyMapFilters {
  teamId?: string
  siteId?: string
  employeeId?: string
  clientId?: string
}

export interface WeeklyMapWorker {
  employeeId: string
  name: string
  number: string
  category: string
  foreman: boolean
  minutesByDate: Record<string, number>
  totalMin: number
}

export interface WeeklyMapGroup {
  key: string
  teamId: string | null
  teamName: string
  teamColor: string
  siteId: string
  siteCode: string
  siteName: string
  clientName: string
  city: string
  country: string
  dates: string[]
  start: string | null
  end: string | null
  schedule: string
  vehicles: string[]
  foremanName: string | null
  workers: WeeklyMapWorker[]
  totalMin: number
  notes: string[]
}

export interface WeeklyMap {
  weekStart: string
  weekNumber: number
  days: string[]
  groups: WeeklyMapGroup[]
  totals: { plannedMin: number; employees: number; sites: number; vehicles: number }
}

export interface ActualTimeRow {
  employeeId: string
  employeeNumber: string
  employeeName: string
  teamId: string | null
  teamName: string | null
  siteId: string
  siteCode: string
  siteName: string
  erpOrder: string | null
  date: string
  clockIn: string | null
  clockOut: string | null
  workedMin: number
  normalMin: number
  overtimeMin: number
  activityCode: string
  status: 'APPROVED'
}

export interface WeeklyActual {
  weekStart: string
  weekNumber: number
  rows: ActualTimeRow[]
  totals: { workedMin: number; normalMin: number; overtimeMin: number; employees: number; sites: number }
}

export interface PlanningOverview {
  from: string
  to: string
  plannedMin: number
  assignments: number
  employees: number
  teams: number
  sites: number
  vehicles: number
}

export interface TeamDistribution {
  teamId: string | null
  teamName: string
  teamColor: string
  plannedMin: number
  employees: number
  sites: number
  assignmentDays: number
}

export interface VehicleReport {
  vehicleId: string
  plate: string
  make: string | null
  model: string | null
  status: string
  seats: number
  plannedMin: number
  employees: number
  sites: number
  assignmentDays: number
  peakRiders: number
}

export interface PlannedActualReport {
  from: string
  to: string
  includesTimeEntries: boolean
  rows: Array<{
    siteId: string
    siteCode: string
    siteName: string
    country: string
    hourLimitMin: number | null
    actualMin: number
    approvedMin: number
    plannedMin: number
    remainingMin: number | null
    projectedPercent: number | null
  }>
  totals: { actualMin: number; approvedMin: number; plannedMin: number }
}

export interface HoursReport {
  from: string
  to: string
  groupBy: 'employee' | 'team' | 'site' | 'week'
  groups: Array<{ key: string; label: string; workedMin: number; normalMin: number; overtimeMin: number; entries: number; employees: number; sites: number }>
  totals: { workedMin: number; normalMin: number; overtimeMin: number; employees: number; sites: number }
}

export interface DocumentReport {
  total: number
  statuses: Array<{ status: 'VALID' | 'EXPIRING' | 'PENDING' | 'EXPIRED' | 'REJECTED' | 'MISSING'; documents: number }>
}

export interface ExportJob {
  id: string
  kind: 'WEEKLY_MAP'
  template: Uppercase<WeeklyMapTemplate>
  parameters: { week: string } & WeeklyMapFilters
  status: 'PENDING' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED'
  filename: string | null
  contentType: string | null
  contentSize: number | null
  errorCode: string | null
  errorDetail: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  expiresAt: string
}

function params(week: string, template: WeeklyMapTemplate, filters: WeeklyMapFilters) {
  const search = new URLSearchParams({ week, template })
  for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value)
  return search
}

export const useWeeklyMap = (orgId: string, week: string, template: WeeklyMapTemplate, filters: WeeklyMapFilters) =>
  useQuery({
    queryKey: ['org', orgId, 'reporting', 'weekly-map', week, template, filters],
    queryFn: () => api<WeeklyMap | WeeklyActual>(`/orgs/${orgId}/reporting/weekly-map?${params(week, template, filters)}`),
    placeholderData: keepPreviousData,
  })

function range(from: string, to: string) {
  return new URLSearchParams({ from, to })
}

export const usePlanningOverview = (orgId: string, from: string, to: string) =>
  useQuery({
    queryKey: ['org', orgId, 'reporting', 'overview', from, to],
    queryFn: () => api<PlanningOverview>(`/orgs/${orgId}/reporting/overview?${range(from, to)}`),
    placeholderData: keepPreviousData,
  })

export const useTeamDistribution = (orgId: string, from: string, to: string) =>
  useQuery({
    queryKey: ['org', orgId, 'reporting', 'team-distribution', from, to],
    queryFn: () => api<TeamDistribution[]>(`/orgs/${orgId}/reporting/team-distribution?${range(from, to)}`),
    placeholderData: keepPreviousData,
  })

export const useVehicleReport = (orgId: string, from: string, to: string) =>
  useQuery({
    queryKey: ['org', orgId, 'reporting', 'vehicles', from, to],
    queryFn: () => api<VehicleReport[]>(`/orgs/${orgId}/reporting/vehicles?${range(from, to)}`),
    placeholderData: keepPreviousData,
  })

export const usePlannedActual = (orgId: string, from: string, to: string) =>
  useQuery({
    queryKey: ['org', orgId, 'reporting', 'planned-vs-actual', from, to],
    queryFn: () => api<PlannedActualReport>(`/orgs/${orgId}/reporting/planned-vs-actual?${range(from, to)}`),
    placeholderData: keepPreviousData,
  })

export const useHoursReport = (orgId: string, from: string, to: string, groupBy: HoursReport['groupBy']) =>
  useQuery({
    queryKey: ['org', orgId, 'reporting', 'hours', groupBy, from, to],
    queryFn: () => api<HoursReport>(`/orgs/${orgId}/reporting/hours?${new URLSearchParams({ from, to, groupBy })}`),
    placeholderData: keepPreviousData,
  })

export const useDocumentReport = (orgId: string) =>
  useQuery({
    queryKey: ['org', orgId, 'reporting', 'documents'],
    queryFn: () => api<DocumentReport>(`/orgs/${orgId}/reporting/documents`),
  })

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function exportStatus(orgId: string, exportId: string) {
  return api<ExportJob>(`/orgs/${orgId}/reporting/exports/${exportId}`)
}

/** Cria um job persistente, acompanha-o e descarrega o resultado pronto. */
export async function downloadWeeklyMap(orgId: string, week: string, template: WeeklyMapTemplate, filters: WeeklyMapFilters) {
  let job = await api<ExportJob>(`/orgs/${orgId}/reporting/exports`, {
    method: 'POST', body: { week, template, ...filters },
  })
  const deadline = Date.now() + 120_000
  while (job.status === 'PENDING' || job.status === 'RUNNING') {
    if (Date.now() >= deadline) throw new ApiError(408, 'export-timeout', 'A exportação continua a ser preparada. Tente novamente dentro de momentos.')
    await wait(750)
    job = await exportStatus(orgId, job.id)
  }
  if (job.status !== 'READY') {
    throw new ApiError(409, job.errorCode ?? `export-${job.status.toLowerCase()}`, job.errorDetail ?? 'Não foi possível gerar o Excel.')
  }
  const response = await fetch(`/api/orgs/${orgId}/reporting/exports/${job.id}/download`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  })
  if (!response.ok) {
    let problem: { code?: string; detail?: string } = {}
    try {
      problem = await response.json()
    } catch {
      // Resposta sem Problem Details, por exemplo quando o proxy não está disponível.
    }
    throw new ApiError(response.status, problem.code ?? `http-${response.status}`, problem.detail ?? 'Não foi possível gerar o Excel.')
  }
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? job.filename ?? `mapa-${template}-${week}.xlsx`
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}
