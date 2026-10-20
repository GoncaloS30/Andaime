import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isApiError } from './http'
import {
  isTwoFactorChallenge,
  type AuditEntry,
  type Invitation,
  type InvitationPreview,
  type Me,
  type Member,
  type Organization,
  type OrgRole,
  type Page,
  type PlatformOrganization,
  type SessionInfo,
  type TwoFactorChallenge,
  type TwoFactorSetup,
  type TwoFactorStatus,
} from './types'

/**
 * Fachada de dados: os componentes usam estes hooks e nunca chamam `fetch` diretamente.
 * As chaves de query de empresa começam sempre por ['org', orgId] — mudar de empresa
 * nunca reaproveita dados de outra.
 */
export const keys = {
  me: ['me'] as const,
  sessions: ['me', 'sessions'] as const,
  twoFactor: ['me', '2fa'] as const,
  org: (orgId: string) => ['org', orgId] as const,
  members: (orgId: string) => ['org', orgId, 'members'] as const,
  invitations: (orgId: string) => ['org', orgId, 'invitations'] as const,
  audit: (orgId: string, page: number) => ['org', orgId, 'audit', page] as const,
  invitation: (token: string) => ['invitation', token] as const,
  platformOrgs: ['platform', 'orgs'] as const,
}

// --- sessão ---------------------------------------------------------------------------

/** Utilizador autenticado; `null` quando não há sessão (não é erro). */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<Me>('/me')
      } catch (error) {
        if (isApiError(error) && error.status === 401) return null
        throw error
      }
    },
    staleTime: 60_000,
  })
}

/** Passo da palavra-passe: devolve o utilizador ou, com verificação em dois passos, o pedido do código. */
export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api<Me | TwoFactorChallenge>('/auth/login', { method: 'POST', body }),
    onSuccess: (result) => {
      if (isTwoFactorChallenge(result)) return
      qc.clear()
      qc.setQueryData(keys.me, result)
    },
  })
}

/** Segundo passo do login: código da aplicação ou código de recuperação. */
export function useLoginSecondFactor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { code: string } | { recoveryCode: string }) => api<Me>('/auth/login/2fa', { method: 'POST', body }),
    onSuccess: (me) => {
      qc.clear()
      qc.setQueryData(keys.me, me)
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear()
      qc.setQueryData(keys.me, null)
    },
  })
}

export const useSignup = () =>
  useMutation({ mutationFn: (body: { email: string; password: string; displayName: string }) => api<void>('/auth/signup', { method: 'POST', body }) })
export const useVerifyEmail = () => useMutation({ mutationFn: (token: string) => api<void>('/auth/verify-email', { method: 'POST', body: { token } }) })
export const useForgotPassword = () => useMutation({ mutationFn: (email: string) => api<void>('/auth/password/forgot', { method: 'POST', body: { email } }) })
export const useResetPassword = () =>
  useMutation({ mutationFn: (body: { token: string; password: string }) => api<void>('/auth/password/reset', { method: 'POST', body }) })

export function useChangePassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => api<void>('/auth/password/change', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sessions }),
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { displayName: string; locale: string }) => api<Me>('/me', { method: 'PATCH', body }),
    onSuccess: (me) => qc.setQueryData(keys.me, me),
  })
}

export function useSelectOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orgId: string) => api<void>('/me/active-org', { method: 'PUT', body: { orgId } }),
    onSuccess: async () => {
      // Nada de uma empresa pode ficar visível depois de mudar para outra.
      qc.removeQueries({ queryKey: ['org'] })
      await qc.invalidateQueries({ queryKey: keys.me })
    },
  })
}

// --- verificação em dois passos --------------------------------------------------------

export const useTwoFactorStatus = () => useQuery({ queryKey: keys.twoFactor, queryFn: () => api<TwoFactorStatus>('/me/2fa') })

export const useSetupTwoFactor = () => useMutation({ mutationFn: () => api<TwoFactorSetup>('/me/2fa/setup', { method: 'POST' }) })

export function useConfirmTwoFactor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => api<{ recoveryCodes: string[] }>('/me/2fa/confirm', { method: 'POST', body: { code } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.twoFactor })
      void qc.invalidateQueries({ queryKey: keys.me, exact: true })
    },
  })
}

export function useDisableTwoFactor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { password: string; code: string }) => api<void>('/me/2fa/disable', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.twoFactor })
      void qc.invalidateQueries({ queryKey: keys.me, exact: true })
    },
  })
}

export const useSessions = () => useQuery({ queryKey: keys.sessions, queryFn: () => api<SessionInfo[]>('/me/sessions') })

export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sessions }),
  })
}

// --- organização ----------------------------------------------------------------------

export function useCreateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; legalName?: string; taxId?: string; country: string; timezone: string }) =>
      api<Organization>('/orgs', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  })
}

export const useOrganization = (orgId: string) => useQuery({ queryKey: keys.org(orgId), queryFn: () => api<Organization>(`/orgs/${orgId}`) })

export function useUpdateOrganization(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      name: string
      legalName: string | null
      taxId: string | null
      timezone: string
      requireAdmin2fa?: boolean
      version: number
    }) =>
      api<Organization>(`/orgs/${orgId}`, { method: 'PATCH', body }),
    onSuccess: (org) => {
      qc.setQueryData(keys.org(orgId), org)
      void qc.invalidateQueries({ queryKey: keys.me })
    },
  })
}

export const useMembers = (orgId: string) => useQuery({ queryKey: keys.members(orgId), queryFn: () => api<Member[]>(`/orgs/${orgId}/members`) })

export function useChangeMemberRole(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { membershipId: string; role: OrgRole; version: number }) =>
      api<Member>(`/orgs/${orgId}/members/${v.membershipId}`, { method: 'PATCH', body: { role: v.role, version: v.version } }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.members(orgId) }),
  })
}

export function useDeactivateMember(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (membershipId: string) => api<void>(`/orgs/${orgId}/members/${membershipId}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.members(orgId) }),
  })
}

export const useInvitations = (orgId: string, enabled = true) =>
  useQuery({ queryKey: keys.invitations(orgId), queryFn: () => api<Invitation[]>(`/orgs/${orgId}/invitations`), enabled })

export function useInvite(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; role: OrgRole }) => api<{ id: string }>(`/orgs/${orgId}/invitations`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  })
}

export function useRevokeInvitation(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/orgs/${orgId}/invitations/${id}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  })
}

export function useResendInvitation(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/orgs/${orgId}/invitations/${id}/resend`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  })
}

export const useInvitationPreview = (token: string) =>
  useQuery({ queryKey: keys.invitation(token), queryFn: () => api<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`), retry: false })

export function useAcceptInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (token: string) =>
      api<{ orgId: string; orgName: string; role: OrgRole }>(`/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  })
}

export const useAudit = (orgId: string, page: number, enabled = true) =>
  useQuery({ queryKey: keys.audit(orgId, page), queryFn: () => api<Page<AuditEntry>>(`/orgs/${orgId}/audit?page=${page}&size=25`), enabled })

// --- plataforma -----------------------------------------------------------------------

export const usePlatformOrganizations = () => useQuery({ queryKey: keys.platformOrgs, queryFn: () => api<PlatformOrganization[]>('/platform/orgs') })

export function useSetOrganizationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { orgId: string; suspend: boolean }) =>
      api<void>(`/platform/orgs/${v.orgId}/${v.suspend ? 'suspend' : 'reactivate'}`, { method: 'POST' }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.platformOrgs }),
  })
}
