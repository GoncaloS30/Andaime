import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isApiError } from './http'

/** Contratos F3 (planeamento e viaturas). Horas locais da obra (HH:mm[:ss]); durações em minutos. */

export type Severity = 'BLOCK' | 'WARN' | 'OFF'

export interface Fix {
  id: string
  label: string
  kind: 'REMOVE_ASSIGNMENTS' | 'SET_VEHICLE' | 'SET_FOREMAN' | 'OPEN_SITE'
  params: Record<string, unknown>
}

export interface Conflict {
  id: string
  type: string
  severity: Severity
  date: string
  title: string
  explanation: string
  employeeIds: string[]
  siteIds: string[]
  vehicleIds: string[]
  assignmentIds: string[]
  fixes: Fix[]
}

export interface Assignment {
  id: string
  employeeId: string
  siteId: string
  date: string
  start: string
  end: string
  breakMin: number
  plannedMin: number
  teamId: string | null
  vehicleId: string | null
  foreman: boolean
  note: string | null
  batchId: string | null
  version: number
}

export interface Board {
  from: string
  to: string
  assignments: Assignment[]
  conflicts: Conflict[]
  readOnly: boolean
}

export type CommandKind = 'ASSIGN' | 'SCHEDULE' | 'UPDATE' | 'BULK_UPDATE' | 'DUPLICATE' | 'DELETE' | 'TRANSFER' | 'COPY_WEEK'

export interface Command {
  kind: CommandKind
  items?: { assignmentId: string; version?: number }[]
  employeeId?: string
  employeeIds?: string[]
  siteId?: string
  date?: string
  from?: string
  to?: string
  weekdays?: number[]
  start?: string
  end?: string
  breakMin?: number | null
  vehicleId?: string | null
  clearVehicle?: boolean
  foreman?: boolean
  foremanEmployeeId?: string | null
  note?: string
  sourceWeek?: string
  targetWeek?: string
  teamIds?: string[]
  acknowledgedConflictIds?: string[]
}

export interface Skipped {
  employeeId: string
  date: string
  reason: 'PAST' | 'INACTIVE' | 'ALREADY_PLANNED'
}

export interface CommandResult {
  preview: boolean
  changeSetId: string | null
  label: string
  created: number
  updated: number
  deleted: number
  createdIds: string[]
  skipped: Skipped[]
  newConflicts: Conflict[]
}

export interface ChangeSet {
  id: string
  kind: string
  label: string
  createdAt: string
  reverted: boolean
  canRevert: boolean
}

export const SKIPPED_LABEL: Record<Skipped['reason'], string> = {
  PAST: 'dia já passado',
  INACTIVE: 'trabalhador inativo',
  ALREADY_PLANNED: 'já tinha planeamento',
}

/** Conflitos devolvidos num 409 de planeamento (`planning-conflicts` ou `confirmation-required`). */
export function conflictsOf(error: unknown): Conflict[] {
  return isApiError(error) && Array.isArray(error.details.conflicts) ? (error.details.conflicts as Conflict[]) : []
}

const base = (orgId: string) => `/orgs/${orgId}`

export const useBoard = (orgId: string, from: string, to: string) =>
  useQuery({
    queryKey: ['org', orgId, 'planning', 'board', from, to],
    queryFn: () => api<Board>(`${base(orgId)}/planning/board?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
  })

export const useChangeSets = (orgId: string, enabled = true) =>
  useQuery({
    queryKey: ['org', orgId, 'planning', 'change-sets'],
    queryFn: () => api<ChangeSet[]>(`${base(orgId)}/planning/change-sets?limit=10`),
    enabled,
  })

function useInvalidatePlanning(orgId: string) {
  const qc = useQueryClient()
  return () =>
    Promise.all(['planning', 'sites', 'vehicles', 'audit'].map((s) => qc.invalidateQueries({ queryKey: ['org', orgId, s] })))
}

/** Pré-visualização: o servidor aplica o comando e desfaz, devolvendo os conflitos novos. */
export function usePreview(orgId: string) {
  return useMutation({ mutationFn: (command: Command) => api<CommandResult>(`${base(orgId)}/planning/preview`, { method: 'POST', body: command }) })
}

export function useCommand(orgId: string) {
  const invalidate = useInvalidatePlanning(orgId)
  return useMutation({
    mutationFn: (command: Command) => api<CommandResult>(`${base(orgId)}/planning/commands`, { method: 'POST', body: command }),
    onSettled: invalidate,
  })
}

export function useRevert(orgId: string) {
  const invalidate = useInvalidatePlanning(orgId)
  return useMutation({
    mutationFn: (changeSetId: string) => api<CommandResult>(`${base(orgId)}/planning/change-sets/${changeSetId}/revert`, { method: 'POST' }),
    onSettled: invalidate,
  })
}

// --- viaturas -------------------------------------------------------------------------------

export type VehicleStatus = 'OPERATIONAL' | 'WORKSHOP' | 'INACTIVE'

export interface VehicleAlert {
  kind: 'INSURANCE' | 'INSPECTION' | 'MAINTENANCE'
  date: string
  expired: boolean
}

export interface VehicleSummary {
  id: string
  plate: string
  make: string | null
  model: string | null
  seats: number
  status: VehicleStatus
  km: number
  insuranceUntil: string | null
  inspectionUntil: string | null
  maintenanceDue: string | null
  team: { id: string; name: string; color: string } | null
  alerts: VehicleAlert[]
  archived: boolean
}

export interface VehicleDetail extends Omit<VehicleSummary, 'archived'> {
  notes: string | null
  unavailability: { id: string; startsOn: string; endsOn: string; reason: string }[]
  upcoming: { date: string; siteCode: string; siteName: string; siteId: string; riders: number }[]
  archivedAt: string | null
  version: number
}

export interface VehicleInput {
  plate: string
  make?: string
  model?: string
  seats: number
  status?: VehicleStatus
  km?: number | null
  insuranceUntil?: string | null
  inspectionUntil?: string | null
  maintenanceDue?: string | null
  notes?: string
  version?: number
}

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = { OPERATIONAL: 'Operacional', WORKSHOP: 'Na oficina', INACTIVE: 'Inativa' }
export const VEHICLE_STATUS_TONE: Record<VehicleStatus, 'ok' | 'warn' | 'neutral'> = { OPERATIONAL: 'ok', WORKSHOP: 'warn', INACTIVE: 'neutral' }
export const ALERT_LABEL: Record<VehicleAlert['kind'], string> = { INSURANCE: 'Seguro', INSPECTION: 'Inspeção', MAINTENANCE: 'Manutenção' }

export const useVehicles = (orgId: string, filters: { q?: string; status?: VehicleStatus | ''; archived?: boolean } = {}, enabled = true) => {
  const search = new URLSearchParams()
  if (filters.q) search.set('q', filters.q)
  if (filters.status) search.set('status', filters.status)
  if (filters.archived) search.set('archived', 'true')
  const s = search.toString()
  return useQuery({
    queryKey: ['org', orgId, 'vehicles', filters],
    queryFn: () => api<VehicleSummary[]>(`${base(orgId)}/vehicles${s ? `?${s}` : ''}`),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export const useVehicle = (orgId: string, id: string) =>
  useQuery({ queryKey: ['org', orgId, 'vehicles', 'detail', id], queryFn: () => api<VehicleDetail>(`${base(orgId)}/vehicles/${id}`) })

function useInvalidateFleet(orgId: string) {
  const qc = useQueryClient()
  return () => Promise.all(['vehicles', 'teams', 'planning', 'audit'].map((s) => qc.invalidateQueries({ queryKey: ['org', orgId, s] })))
}

export function useSaveVehicle(orgId: string, id?: string) {
  const invalidate = useInvalidateFleet(orgId)
  return useMutation({
    mutationFn: (input: VehicleInput) =>
      id ? api<VehicleDetail>(`${base(orgId)}/vehicles/${id}`, { method: 'PATCH', body: input }) : api<VehicleDetail>(`${base(orgId)}/vehicles`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  })
}

export function useArchiveVehicle(orgId: string, id: string) {
  const invalidate = useInvalidateFleet(orgId)
  return useMutation({
    mutationFn: (archive: boolean) => api<VehicleDetail>(`${base(orgId)}/vehicles/${id}/${archive ? 'archive' : 'restore'}`, { method: 'POST' }),
    onSuccess: invalidate,
  })
}

export function useUnavailability(orgId: string, id: string) {
  const invalidate = useInvalidateFleet(orgId)
  return useMutation({
    mutationFn: (v: { action: 'add'; startsOn: string; endsOn: string; reason: string } | { action: 'remove'; unavailabilityId: string }) =>
      v.action === 'add'
        ? api<VehicleDetail>(`${base(orgId)}/vehicles/${id}/unavailability`, { method: 'POST', body: { startsOn: v.startsOn, endsOn: v.endsOn, reason: v.reason } })
        : api<VehicleDetail>(`${base(orgId)}/vehicles/${id}/unavailability/${v.unavailabilityId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useLinkTeamVehicle(orgId: string) {
  const invalidate = useInvalidateFleet(orgId)
  return useMutation({
    mutationFn: (v: { teamId: string; vehicleId: string | null; from?: string }) =>
      api<void>(`${base(orgId)}/teams/${v.teamId}/vehicle`, { method: 'PUT', body: { vehicleId: v.vehicleId, from: v.from } }),
    onSuccess: invalidate,
  })
}

// --- datas ------------------------------------------------------------------------------------

/** Segunda-feira da semana de uma data ISO. */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  const offset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}

/** Dia da semana ISO (1 = segunda … 7 = domingo). */
export function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1
}

export const hhmm = (time: string) => time.slice(0, 5)
