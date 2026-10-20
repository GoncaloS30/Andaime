import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SiteMetrics as GaugeMetrics } from '@/domain/siteMetrics'
import { api } from './http'
import type { AuditEntry, Page } from './types'

/** Contratos F2 (trabalhadores, equipas, obras, clientes, ocorrências). Durações sempre em minutos. */

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE'
export interface TeamRef {
  id: string
  name: string
  color: string
}

export interface EmployeeSummary {
  id: string
  number: string
  fullName: string
  category: string
  status: EmployeeStatus
  archived: boolean
  team: TeamRef | null
}

export interface EmployeeDetail extends Omit<EmployeeSummary, 'archived'> {
  phone: string | null
  email: string | null
  nationality: string | null
  homeCity: string | null
  hireDate: string | null
  dailyCapacityMin: number
  hourlyCost: number | null
  skills: string[]
  sizes: Record<string, string>
  notes: string | null
  archivedAt: string | null
  account: { membershipId: string; displayName: string; role: string } | null
  /** Vista de encarregado: sem dados pessoais nem custos. */
  restricted: boolean
  /** Ex-trabalhador com os dados pessoais apagados (RGPD). */
  anonymized: boolean
  version: number
}

export interface EmployeeInput {
  number?: string
  fullName: string
  category: string
  phone?: string
  email?: string
  nationality?: string
  homeCity?: string
  hireDate?: string | null
  status?: EmployeeStatus
  dailyCapacityMin?: number
  hourlyCost?: number | null
  skills?: string[]
  sizes?: Record<string, string>
  notes?: string
  version?: number
}

export interface TeamPeriod {
  id: string
  teamId: string
  teamName: string
  teamColor: string
  joinedOn: string
  leftOn: string | null
}

export interface Contract {
  id: string
  kind: 'PERMANENT' | 'FIXED_TERM' | 'TEMPORARY' | 'POSTED' | 'OTHER'
  startDate: string
  endDate: string | null
  weeklyMin: number | null
  notes: string | null
  createdAt: string
}

export interface TeamSummary {
  id: string
  name: string
  color: string
  foremanEmployeeId: string | null
  foremanName: string | null
  memberCount: number
  memberNames: string[]
  vehicle: { id: string; plate: string } | null
  archived: boolean
  version: number
}

export interface MemberRow {
  employeeId: string
  number: string
  fullName: string
  category: string
  status: EmployeeStatus
  joinedOn: string
  leftOn: string | null
}

export interface TeamDetail {
  id: string
  name: string
  color: string
  foremanEmployeeId: string | null
  foremanName: string | null
  archived: boolean
  vehicle: { id: string; plate: string } | null
  members: MemberRow[]
  history: MemberRow[]
  version: number
}

export type SiteStatus = 'PLANNED' | 'ACTIVE' | 'SUSPENDED' | 'DONE'
export interface Ref {
  id: string
  name: string
}

export interface SiteMetricsDto {
  limitMin: number | null
  realizedMin: number
  approvedMin: number
  plannedFutureMin: number
  balanceMin: number | null
  projectionMin: number
  pctRealized: number
  pctProjection: number
  status: 'NO_LIMIT' | 'NORMAL' | 'WARNING' | 'EXCEEDS'
  overByMin: number
  /** false enquanto o registo de horas (F4) não existir: só histórico importado. */
  includesTimeEntries: boolean
}

export interface SiteSummary {
  id: string
  code: string
  name: string
  status: SiteStatus
  country: string
  city: string | null
  latitude: number | null
  longitude: number | null
  color: string
  startDate: string | null
  endDate: string | null
  client: Ref | null
  foreman: Ref | null
  openIssues: number
  archived: boolean
  metrics: SiteMetricsDto
}

export interface SiteDetail extends Omit<SiteSummary, 'archived'> {
  address: string | null
  timezone: string
  hourLimitMin: number | null
  baselineRealizedMin: number
  baselineApprovedMin: number
  description: string | null
  erpOrder: string | null
  director: Ref | null
  archivedAt: string | null
  version: number
}

export interface SiteInput {
  code?: string
  name: string
  clientId?: string | null
  country: string
  city?: string
  address?: string
  latitude?: number | null
  longitude?: number | null
  timezone?: string
  status?: SiteStatus
  startDate?: string | null
  endDate?: string | null
  hourLimitMin?: number | null
  baselineRealizedMin?: number
  baselineApprovedMin?: number
  directorUserId?: string | null
  foremanEmployeeId?: string | null
  color?: string
  description?: string
  erpOrder?: string
  version?: number
}

export interface Client {
  id: string
  name: string
  taxId: string | null
  contactName: string | null
  email: string | null
  phone: string | null
  country: string | null
  activeSites: number
  archived: boolean
  version: number
}

export interface ClientInput {
  name: string
  taxId?: string
  contactName?: string
  email?: string
  phone?: string
  country?: string
  version?: number
}

export type IssueCategory = 'SAFETY' | 'MATERIAL' | 'EQUIPMENT' | 'ACCESS' | 'OTHER'
export interface Issue {
  id: string
  siteId: string
  siteCode: string
  siteName: string
  category: IssueCategory
  description: string
  status: 'OPEN' | 'RESOLVED'
  reportedBy: string
  reportedAt: string
  resolvedBy: string | null
  resolvedAt: string | null
  resolutionNote: string | null
  version: number
}

export const SITE_STATUS_LABEL: Record<SiteStatus, string> = { PLANNED: 'Planeada', ACTIVE: 'Em curso', SUSPENDED: 'Suspensa', DONE: 'Concluída' }
export const SITE_STATUS_TONE: Record<SiteStatus, 'ok' | 'info' | 'neutral' | 'warn'> = { PLANNED: 'info', ACTIVE: 'ok', SUSPENDED: 'warn', DONE: 'neutral' }
export const ISSUE_LABEL: Record<IssueCategory, string> = { SAFETY: 'Segurança', MATERIAL: 'Material', EQUIPMENT: 'Equipamento', ACCESS: 'Acesso à obra', OTHER: 'Outro' }
export const CONTRACT_LABEL: Record<Contract['kind'], string> = {
  PERMANENT: 'Sem termo',
  FIXED_TERM: 'A termo certo',
  TEMPORARY: 'Trabalho temporário',
  POSTED: 'Destacamento',
  OTHER: 'Outro',
}

/** Converte as métricas da API (minutos) no formato do medidor de horas do design system (horas). */
export function toGauge(m: SiteMetricsDto): GaugeMetrics {
  const h = (min: number) => Math.round((min / 60) * 10) / 10
  return {
    limit: m.limitMin === null ? null : h(m.limitMin),
    realized: h(m.realizedMin),
    approved: h(m.approvedMin),
    plannedFuture: h(m.plannedFutureMin),
    balance: m.balanceMin === null ? null : h(m.balanceMin),
    projection: h(m.projectionMin),
    pctRealized: m.pctRealized,
    pctProjection: m.pctProjection,
    status: m.status === 'NO_LIMIT' ? 'sem_limite' : m.status === 'EXCEEDS' ? 'excede' : m.status === 'WARNING' ? 'atencao' : 'normal',
    overBy: h(m.overByMin),
  }
}

// --- hooks ----------------------------------------------------------------------------

const base = (orgId: string) => `/orgs/${orgId}`
const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') search.set(k, String(v))
  const s = search.toString()
  return s ? `?${s}` : ''
}

export interface EmployeeFilters {
  q?: string
  status?: EmployeeStatus | ''
  team?: string
  category?: string
  archived?: boolean
  page?: number
}

export const useEmployees = (orgId: string, filters: EmployeeFilters) =>
  useQuery({
    queryKey: ['org', orgId, 'employees', filters],
    queryFn: () => api<Page<EmployeeSummary>>(`${base(orgId)}/employees${qs({ ...filters, size: 50 })}`),
    placeholderData: keepPreviousData,
  })

/** Lista curta para seletores (responsável, membros, encarregado de obra). */
export const useEmployeeOptions = (orgId: string, enabled = true) =>
  useQuery({
    queryKey: ['org', orgId, 'employees', 'options'],
    queryFn: () => api<Page<EmployeeSummary>>(`${base(orgId)}/employees${qs({ status: 'ACTIVE', size: 200 })}`),
    enabled,
    staleTime: 60_000,
  })

export const useEmployee = (orgId: string, id: string) =>
  useQuery({ queryKey: ['org', orgId, 'employees', 'detail', id], queryFn: () => api<EmployeeDetail>(`${base(orgId)}/employees/${id}`) })

export const useEmployeeTeams = (orgId: string, id: string) =>
  useQuery({ queryKey: ['org', orgId, 'employees', 'detail', id, 'teams'], queryFn: () => api<TeamPeriod[]>(`${base(orgId)}/employees/${id}/teams`) })

export const useContracts = (orgId: string, id: string, enabled: boolean) =>
  useQuery({
    queryKey: ['org', orgId, 'employees', 'detail', id, 'contracts'],
    queryFn: () => api<Contract[]>(`${base(orgId)}/employees/${id}/contracts`),
    enabled,
  })

export const useEntityHistory = (orgId: string, entityType: 'employee' | 'team' | 'site' | 'client', id: string, enabled = true) =>
  useQuery({
    queryKey: ['org', orgId, 'audit', entityType, id],
    queryFn: () => api<Page<AuditEntry>>(`/orgs/${orgId}/audit${qs({ entityType, entityId: id, size: 50 })}`),
    enabled,
  })

function useInvalidate(orgId: string) {
  const qc = useQueryClient()
  return (...scopes: string[]) => Promise.all(scopes.map((s) => qc.invalidateQueries({ queryKey: ['org', orgId, s] })))
}

export function useSaveEmployee(orgId: string, id?: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (input: EmployeeInput) =>
      id ? api<EmployeeDetail>(`${base(orgId)}/employees/${id}`, { method: 'PATCH', body: input }) : api<EmployeeDetail>(`${base(orgId)}/employees`, { method: 'POST', body: input }),
    onSuccess: () => invalidate('employees', 'teams', 'audit'),
  })
}

export function useArchiveEmployee(orgId: string, id: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (archive: boolean) => api<EmployeeDetail>(`${base(orgId)}/employees/${id}/${archive ? 'archive' : 'restore'}`, { method: 'POST' }),
    onSuccess: () => invalidate('employees', 'teams', 'audit'),
  })
}

export function useAnonymizeEmployee(orgId: string, id: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: () => api<EmployeeDetail>(`${base(orgId)}/employees/${id}/anonymize`, { method: 'POST' }),
    onSuccess: () => invalidate('employees', 'teams', 'audit', 'time-entries', 'timesheets'),
  })
}

export function useAddContract(orgId: string, id: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (body: { kind: Contract['kind']; startDate: string; endDate?: string | null; weeklyMin?: number | null; notes?: string }) =>
      api<Contract>(`${base(orgId)}/employees/${id}/contracts`, { method: 'POST', body }),
    onSuccess: () => invalidate('employees', 'audit'),
  })
}

export function useRemoveContract(orgId: string, id: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (contractId: string) => api<void>(`${base(orgId)}/employees/${id}/contracts/${contractId}`, { method: 'DELETE' }),
    onSuccess: () => invalidate('employees', 'audit'),
  })
}

export const useTeams = (orgId: string, archived = false, enabled = true) =>
  useQuery({ queryKey: ['org', orgId, 'teams', { archived }], queryFn: () => api<TeamSummary[]>(`${base(orgId)}/teams${qs({ archived })}`), enabled })

export const useTeam = (orgId: string, id: string) =>
  useQuery({ queryKey: ['org', orgId, 'teams', 'detail', id], queryFn: () => api<TeamDetail>(`${base(orgId)}/teams/${id}`) })

export function useSaveTeam(orgId: string, id?: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (body: { name: string; color: string; foremanEmployeeId: string | null; version?: number }) =>
      id ? api<TeamDetail>(`${base(orgId)}/teams/${id}`, { method: 'PATCH', body }) : api<TeamDetail>(`${base(orgId)}/teams`, { method: 'POST', body }),
    onSuccess: () => invalidate('teams', 'employees', 'audit'),
  })
}

export function useTeamMembership(orgId: string, teamId: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (v: { action: 'join'; employeeId: string; joinedOn: string } | { action: 'leave'; employeeId: string; lastDay: string }) =>
      v.action === 'join'
        ? api<TeamDetail>(`${base(orgId)}/teams/${teamId}/members`, { method: 'POST', body: { employeeId: v.employeeId, joinedOn: v.joinedOn } })
        : api<TeamDetail>(`${base(orgId)}/teams/${teamId}/members/${v.employeeId}/leave`, { method: 'POST', body: { lastDay: v.lastDay } }),
    onSuccess: () => invalidate('teams', 'employees', 'audit'),
  })
}

export function useArchiveTeam(orgId: string, id: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({ mutationFn: () => api<TeamDetail>(`${base(orgId)}/teams/${id}/archive`, { method: 'POST' }), onSuccess: () => invalidate('teams', 'employees', 'audit') })
}

export interface SiteFilters {
  q?: string
  status?: SiteStatus | ''
  country?: string
  archived?: boolean
}

export const useSites = (orgId: string, filters: SiteFilters = {}, enabled = true) =>
  useQuery({
    queryKey: ['org', orgId, 'sites', filters],
    queryFn: () => api<SiteSummary[]>(`${base(orgId)}/sites${qs({ ...filters })}`),
    placeholderData: keepPreviousData,
    enabled,
  })

export const useSite = (orgId: string, id: string) =>
  useQuery({ queryKey: ['org', orgId, 'sites', 'detail', id], queryFn: () => api<SiteDetail>(`${base(orgId)}/sites/${id}`) })

export const useNextSiteCode = (orgId: string) =>
  useQuery({ queryKey: ['org', orgId, 'sites', 'next-code'], queryFn: () => api<{ code: string }>(`${base(orgId)}/sites/next-code`), staleTime: 0 })

export function useSaveSite(orgId: string, id?: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (input: SiteInput) =>
      id ? api<SiteDetail>(`${base(orgId)}/sites/${id}`, { method: 'PATCH', body: input }) : api<SiteDetail>(`${base(orgId)}/sites`, { method: 'POST', body: input }),
    onSuccess: () => invalidate('sites', 'clients', 'audit'),
  })
}

export function useArchiveSite(orgId: string, id: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (archive: boolean) => api<SiteDetail>(`${base(orgId)}/sites/${id}/${archive ? 'archive' : 'restore'}`, { method: 'POST' }),
    onSuccess: () => invalidate('sites', 'clients', 'audit'),
  })
}

export const useClients = (orgId: string, enabled = true) =>
  useQuery({ queryKey: ['org', orgId, 'clients'], queryFn: () => api<Client[]>(`${base(orgId)}/clients`), enabled })

export function useSaveClient(orgId: string, id?: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (input: ClientInput) =>
      id ? api<Client>(`${base(orgId)}/clients/${id}`, { method: 'PATCH', body: input }) : api<Client>(`${base(orgId)}/clients`, { method: 'POST', body: input }),
    onSuccess: () => invalidate('clients', 'sites', 'audit'),
  })
}

export const useIssues = (orgId: string, siteId?: string, status?: 'OPEN' | 'RESOLVED') =>
  useQuery({
    queryKey: ['org', orgId, 'issues', siteId ?? 'all', status ?? 'any'],
    queryFn: () => api<Issue[]>(siteId ? `${base(orgId)}/sites/${siteId}/issues${qs({ status })}` : `${base(orgId)}/issues${qs({ status })}`),
  })

export function useReportIssue(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (v: { siteId: string; category: IssueCategory; description: string }) =>
      api<Issue>(`${base(orgId)}/sites/${v.siteId}/issues`, { method: 'POST', body: { category: v.category, description: v.description } }),
    onSuccess: () => invalidate('issues', 'sites'),
  })
}

export function useResolveIssue(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (v: { issueId: string; note?: string }) => api<Issue>(`${base(orgId)}/issues/${v.issueId}/resolve`, { method: 'POST', body: { note: v.note } }),
    onSuccess: () => invalidate('issues', 'sites'),
  })
}

export function useLinkEmployee(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { membershipId: string; employeeId: string | null }) =>
      api(`/orgs/${orgId}/members/${v.membershipId}/employee`, { method: 'PUT', body: { employeeId: v.employeeId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId] }),
  })
}

/** Data local (AAAA-MM-DD) de hoje no navegador; o servidor valida contra o fuso da empresa. */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function minutesToHours(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—'
  return `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(min / 60)} h`
}
