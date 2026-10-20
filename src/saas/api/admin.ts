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

/** Conservação de dados (RGPD). `anonymizeAfterMonths` nulo/ausente = anonimização automática desligada. */
export interface RetentionPolicy {
  anonymizeAfterMonths?: number | null
  notificationsAfterMonths: number
  updatedAt?: string | null
  version: number
}

export interface RetentionInput {
  anonymizeAfterMonths: number | null
  notificationsAfterMonths: number
  version: number
}

/** Feriado nacional (só leitura), calculado pelo servidor para o país e o ano. */
export interface PublicHoliday {
  date: string
  name: string
}

/** Países com calendário de feriados nacionais no servidor (`NationalHolidays.SUPPORTED`). */
export const PUBLIC_HOLIDAY_COUNTRIES: { code: string; name: string }[] = [
  { code: 'PT', name: 'Portugal' },
  { code: 'ES', name: 'Espanha' },
  { code: 'FR', name: 'França' },
  { code: 'BE', name: 'Bélgica' },
  { code: 'LU', name: 'Luxemburgo' },
  { code: 'NL', name: 'Países Baixos' },
  { code: 'DE', name: 'Alemanha' },
  { code: 'AT', name: 'Áustria' },
  { code: 'IT', name: 'Itália' },
  { code: 'IE', name: 'Irlanda' },
  { code: 'GB', name: 'Reino Unido (Inglaterra e País de Gales)' },
  { code: 'CH', name: 'Suíça (só o feriado federal)' },
]

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

export const usePublicHolidays = (orgId: string, country: string, year: number) =>
  useQuery({
    queryKey: ['org', orgId, 'policy', 'public-holidays', country, year],
    queryFn: () => api<PublicHoliday[]>(`${base(orgId)}/public-holidays?country=${encodeURIComponent(country)}&year=${year}`),
    enabled: country !== '',
    staleTime: Infinity,
  })

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

export const useRetentionPolicy = (orgId: string) =>
  useQuery({ queryKey: ['org', orgId, 'policy', 'retention'], queryFn: () => api<RetentionPolicy>(`${base(orgId)}/retention`) })

export function useSaveRetentionPolicy(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RetentionInput) => api<RetentionPolicy>(`${base(orgId)}/retention`, { method: 'PUT', body: input }),
    onSuccess: () => Promise.all(['policy', 'audit'].map((s) => qc.invalidateQueries({ queryKey: ['org', orgId, s] }))),
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
