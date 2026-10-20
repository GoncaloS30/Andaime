import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './http'

/** Contratos F4 (ponto, registos de horas, folhas semanais). Instantes ISO UTC; horas locais da obra; minutos. */

export type EntryStatus = 'OPEN' | 'CLOSED' | 'CANCELLED'
export type SheetStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'

export interface TimeEntry {
  id: string
  employeeId: string
  employeeName: string
  siteId: string
  siteCode: string
  assignmentId: string | null
  workDate: string
  timezone: string
  startedAt: string
  endedAt: string | null
  startLocal: string
  endLocal: string | null
  onBreak: boolean
  breakMin: number
  workedMin: number | null
  status: EntryStatus
  source: 'CLOCK' | 'FOREMAN' | 'MANAGER'
  note: string | null
  revisions: number
  version: number
}

export interface Planned {
  assignmentId: string
  employeeId: string
  employeeName: string
  siteId: string
  siteCode: string
  siteName: string
  date: string
  start: string
  end: string
  plannedMin: number
  confirmed: boolean
}

export interface ClockStatus {
  employeeId: string
  open: TimeEntry | null
  today: Planned[]
  weekWorkedMin: number
  weekOvertimeMin: number
}

export interface TimesheetSummary {
  employeeId: string
  employeeName: string
  teamName: string | null
  weekStart: string
  status: SheetStatus
  plannedMin: number
  workedMin: number
  normalMin: number
  overtimeMin: number
  openEntries: number
  missingDays: number
  version: number
}

export interface TimesheetDay {
  date: string
  plannedMin: number
  workedMin: number
  normalMin: number
  overtimeMin: number
  restDay: boolean
  entries: TimeEntry[]
}

export interface TimesheetDetail {
  summary: TimesheetSummary
  days: TimesheetDay[]
  decisionNote: string | null
  submittedAt: string | null
  decidedAt: string | null
  decidedBy: string | null
}

export interface Revision {
  id: string
  before: string | null
  after: string
  reason: string
  userName: string
  createdAt: string
}

export const SHEET_LABEL: Record<SheetStatus, string> = { DRAFT: 'Por submeter', SUBMITTED: 'Submetida', APPROVED: 'Aprovada', REJECTED: 'Devolvida' }
export const SHEET_TONE: Record<SheetStatus, 'neutral' | 'info' | 'ok' | 'warn'> = { DRAFT: 'neutral', SUBMITTED: 'info', APPROVED: 'ok', REJECTED: 'warn' }
export const SOURCE_LABEL: Record<TimeEntry['source'], string> = { CLOCK: 'Ponto', FOREMAN: 'Encarregado', MANAGER: 'Escritório' }

const base = (orgId: string) => `/orgs/${orgId}`

function useInvalidate(orgId: string) {
  const qc = useQueryClient()
  return () => Promise.all(['clock', 'time-entries', 'timesheets', 'sites', 'audit'].map((s) => qc.invalidateQueries({ queryKey: ['org', orgId, s] })))
}

export const useClock = (orgId: string) =>
  useQuery({ queryKey: ['org', orgId, 'clock'], queryFn: () => api<ClockStatus>(`${base(orgId)}/me/clock`), refetchInterval: 60_000 })

/** Toque no ponto. A chave de idempotência acompanha as repetições do mesmo toque (rede instável). */
export function useClockAction(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (v: { action: 'in' | 'break-start' | 'break-end' | 'out'; idempotencyKey: string; siteId?: string }) =>
      api<ClockStatus>(`${base(orgId)}/me/clock/${v.action}`, {
        method: 'POST',
        body: { idempotencyKey: v.idempotencyKey, deviceTime: new Date().toISOString(), siteId: v.siteId },
      }),
    retry: 2,
    onSettled: invalidate,
  })
}

export const useTimesheets = (orgId: string, week: string, status?: SheetStatus | '') =>
  useQuery({
    queryKey: ['org', orgId, 'timesheets', week, status ?? ''],
    queryFn: () => api<TimesheetSummary[]>(`${base(orgId)}/timesheets?week=${week}${status ? `&status=${status}` : ''}`),
    placeholderData: keepPreviousData,
  })

export const useTimesheet = (orgId: string, employeeId: string | null, week: string) =>
  useQuery({
    queryKey: ['org', orgId, 'timesheets', 'detail', employeeId, week],
    queryFn: () => api<TimesheetDetail>(`${base(orgId)}/timesheets/${employeeId}/${week}`),
    enabled: !!employeeId,
  })

export function useTimesheetAction(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (v: { employeeId: string; week: string; action: 'submit' | 'approve' | 'reject' | 'reopen'; note?: string; version?: number }) =>
      api<TimesheetDetail>(`${base(orgId)}/timesheets/${v.employeeId}/${v.week}/${v.action}`, { method: 'POST', body: { note: v.note, version: v.version } }),
    onSettled: invalidate,
  })
}

/** Planeado de um dia no âmbito do utilizador, com indicação de presença já confirmada. */
export const usePlannedDay = (orgId: string, date: string) =>
  useQuery({ queryKey: ['org', orgId, 'time-entries', 'planned', date], queryFn: () => api<Planned[]>(`${base(orgId)}/time-entries/planned?date=${date}`) })

export function useConfirmPlanned(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (assignmentIds: string[]) =>
      api<{ created: number; skippedAssignmentIds: string[] }>(`${base(orgId)}/time-entries/confirm-planned`, { method: 'POST', body: { assignmentIds } }),
    onSettled: invalidate,
  })
}

export function useSaveEntry(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (
      v:
        | { mode: 'create'; employeeId: string; siteId: string; date: string; start: string; end: string; breakMin?: number | null; note?: string; reason: string }
        | { mode: 'correct'; id: string; siteId?: string; date?: string; start?: string; end?: string; breakMin?: number | null; note?: string; reason: string; version: number }
        | { mode: 'cancel'; id: string; reason: string; version: number },
    ) => {
      if (v.mode === 'create') {
        const { mode: _mode, ...body } = v
        return api<TimeEntry>(`${base(orgId)}/time-entries`, { method: 'POST', body })
      }
      if (v.mode === 'cancel') return api<TimeEntry>(`${base(orgId)}/time-entries/${v.id}/cancel`, { method: 'POST', body: { reason: v.reason, version: v.version } })
      const { mode: _mode, id, ...body } = v
      return api<TimeEntry>(`${base(orgId)}/time-entries/${id}`, { method: 'PATCH', body })
    },
    onSettled: invalidate,
  })
}

export const useRevisions = (orgId: string, entryId: string | null) =>
  useQuery({
    queryKey: ['org', orgId, 'time-entries', 'revisions', entryId],
    queryFn: () => api<Revision[]>(`${base(orgId)}/time-entries/${entryId}/revisions`),
    enabled: !!entryId,
  })

/** Hora local HH:mm a partir de um instante ISO, no fuso indicado. */
export function localTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso))
}

/** Registos de um período (para a grelha da semana), no âmbito de quem pede. */
export const useEntries = (orgId: string, from: string, to: string) =>
  useQuery({
    queryKey: ['org', orgId, 'time-entries', from, to],
    queryFn: () => api<TimeEntry[]>(`${base(orgId)}/time-entries?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
  })

/** Grelha da semana: horas totais por pessoa e dia, guardadas de uma vez com um motivo comum. */
export function useWeekGrid(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (body: { reason: string; cells: { employeeId: string; date: string; minutes: number }[] }) =>
      api<{ created: number; updated: number; cancelled: number; unchanged: number }>(`${base(orgId)}/time-entries/week-grid`, { method: 'POST', body }),
    onSettled: invalidate,
  })
}
