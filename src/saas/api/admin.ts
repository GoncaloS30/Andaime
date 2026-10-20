import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './http'

/** Regras da empresa (política laboral, feriados) e acesso de suporte. Só administração. */

export interface LaborPolicy {
  dailyNormalMin: number
  weeklyNormalMin: number
  restDays: number[]
  autoBreakAfterMin: number | null
  autoBreakMin: number | null
  overnightAttribution: 'START_DAY' | 'SPLIT_MIDNIGHT'
  effectiveFrom: string | null
  version: number
}

export interface Holiday {
  id: string
  date: string
  name: string
}

export interface SupportGrant {
  id: string
  platformUserEmail: string
  platformUserName: string
  grantedBy: string
  reason: string
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  active: boolean
  requests: number
}

const base = (orgId: string) => `/orgs/${orgId}`

export const useLaborPolicy = (orgId: string) =>
  useQuery({ queryKey: ['org', orgId, 'policy', 'labor'], queryFn: () => api<LaborPolicy>(`${base(orgId)}/labor-policy`) })

export function useSaveLaborPolicy(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (policy: LaborPolicy) => api<LaborPolicy>(`${base(orgId)}/labor-policy`, { method: 'PUT', body: policy }),
    onSuccess: () => Promise.all(['policy', 'timesheets', 'clock', 'audit'].map((s) => qc.invalidateQueries({ queryKey: ['org', orgId, s] }))),
  })
}

export const useHolidays = (orgId: string, year: number) =>
  useQuery({ queryKey: ['org', orgId, 'policy', 'holidays', year], queryFn: () => api<Holiday[]>(`${base(orgId)}/holidays?year=${year}`) })

export function useHolidayAction(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { action: 'add'; date: string; name: string } | { action: 'remove'; id: string }): Promise<unknown> =>
      v.action === 'add'
        ? api<Holiday>(`${base(orgId)}/holidays`, { method: 'POST', body: { date: v.date, name: v.name } })
        : api<void>(`${base(orgId)}/holidays/${v.id}`, { method: 'DELETE' }),
    onSuccess: () => Promise.all(['policy', 'timesheets', 'audit'].map((s) => qc.invalidateQueries({ queryKey: ['org', orgId, s] }))),
  })
}

export const useSupportGrants = (orgId: string) =>
  useQuery({ queryKey: ['org', orgId, 'support-access'], queryFn: () => api<SupportGrant[]>(`${base(orgId)}/support-access`) })

export function useSupportAction(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { action: 'grant'; email: string; hours: number; reason: string } | { action: 'revoke'; id: string }) =>
      v.action === 'grant'
        ? api<SupportGrant>(`${base(orgId)}/support-access`, { method: 'POST', body: { email: v.email, hours: v.hours, reason: v.reason } })
        : api<SupportGrant>(`${base(orgId)}/support-access/${v.id}/revoke`, { method: 'POST' }),
    onSuccess: () => Promise.all(['support-access', 'audit'].map((s) => qc.invalidateQueries({ queryKey: ['org', orgId, s] }))),
  })
}
