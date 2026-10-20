import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './http'

const base = (orgId: string) => `/orgs/${orgId}`

// --- agenda do mês --------------------------------------------------------------------------------

export type CalendarLayer = 'ABSENCE' | 'SITE' | 'EXPIRY' | 'HOLIDAY' | 'EVENT'
export type CalendarTone = 'vacation' | 'absence' | 'site' | 'late' | 'expired' | 'expiring' | 'valid' | 'holiday' | 'event'
export type CalendarLinkType = 'EMPLOYEE' | 'SITE' | 'VEHICLE' | 'EMPLOYEE_DOCUMENTS' | 'EVENT'

export interface CalendarItem {
  id: string
  layer: CalendarLayer
  /** Subtipo: tipo de ausência (ou ABSENCE quando não pode ser mostrado), SITE_START, DOCUMENT, PUBLIC_HOLIDAY, EVENT… */
  kind: string
  title: string
  detail: string | null
  start: string
  end: string
  time: string | null
  tone: CalendarTone
  color: string | null
  late: boolean
  link: { type: CalendarLinkType; id: string } | null
}

export interface CalendarMonth {
  month: string
  from: string
  to: string
  today: string
  /** As validades só entram até esta data (hoje + 60 dias). */
  expiryHorizon: string
  canManageEvents: boolean
  items: CalendarItem[]
}

export const useCalendarMonth = (orgId: string, month: string) =>
  useQuery({
    queryKey: ['org', orgId, 'calendar', month],
    queryFn: () => api<CalendarMonth>(`${base(orgId)}/calendar?month=${month}`),
    placeholderData: keepPreviousData,
  })

export interface EventInput {
  title: string
  startsOn: string
  endsOn?: string
  time?: string | null
  location?: string | null
}

export function useCalendarEvent(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { action: 'create'; input: EventInput } | { action: 'delete'; id: string }): Promise<CalendarItem | void> =>
      v.action === 'create'
        ? api<CalendarItem>(`${base(orgId)}/calendar/events`, { method: 'POST', body: v.input })
        : api<void>(`${base(orgId)}/calendar/events/${v.id}`, { method: 'DELETE' }),
    onSettled: () => Promise.all(['calendar', 'audit'].map((s) => qc.invalidateQueries({ queryKey: ['org', orgId, s] }))),
  })
}

// --- mapa de férias do ano ------------------------------------------------------------------------

/** Tipo de ausência ou ABSENCE quando quem vê não pode saber o tipo (doença de outra pessoa). */
export type YearPeriodKind = 'VACATION' | 'SICK' | 'TRAINING' | 'PERSONAL' | 'LEAVE' | 'OTHER' | 'ABSENCE'

export interface YearPeriod {
  id: string
  kind: YearPeriodKind
  status: 'APPROVED' | 'REQUESTED'
  startsOn: string
  endsOn: string
  /** Período recortado ao ano. */
  from: string
  to: string
  partialMinutes: number | null
  /** Dias úteis dentro do ano (sem descanso nem feriados). */
  workingDays: number
}

export interface YearRow {
  employeeId: string
  employeeName: string
  employeeNumber: string
  vacationDays: number
  pendingVacationDays: number
  periods: YearPeriod[]
}

export interface AbsenceYearMap {
  year: number
  years: number[]
  holidays: { date: string; name: string; source: 'PUBLIC' | 'COMPANY' }[]
  rows: YearRow[]
}

export const useAbsenceYear = (orgId: string, year: number) =>
  useQuery({
    queryKey: ['org', orgId, 'absences', 'year', year],
    queryFn: () => api<AbsenceYearMap>(`${base(orgId)}/absences/year?year=${year}`),
    placeholderData: keepPreviousData,
  })
