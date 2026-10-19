/**
 * Contratos da API (F1). Espelham os DTOs do backend (`backend/src/main/java/pt/andaime/**`).
 * A partir de F2 passam a ser gerados do OpenAPI do backend.
 */

export type OrgRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'FOREMAN' | 'WORKER'

export interface Me {
  user: { id: string; email: string; displayName: string; locale: string }
  memberships: { id: string; orgId: string; orgName: string; role: OrgRole }[]
  activeOrgId: string | null
  platformAdmin: boolean
}

export interface Organization {
  id: string
  name: string
  legalName: string | null
  taxId: string | null
  country: string
  timezone: string
  currency: string
  status: 'ACTIVE' | 'SUSPENDED'
  version: number
}

export interface Member {
  id: string
  userId: string
  email: string
  displayName: string
  role: OrgRole
  status: 'ACTIVE' | 'DISABLED'
  joinedAt: string
  employeeId: string | null
  employeeName: string | null
  version: number
}

export interface Invitation {
  id: string
  email: string
  role: OrgRole
  invitedBy: string
  createdAt: string
  expiresAt: string
  expired: boolean
}

export interface InvitationPreview {
  organizationName: string
  role: OrgRole
  emailMasked: string
  expiresAt: string
  status: 'VALID' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED' | 'SUSPENDED'
}

export interface SessionInfo {
  id: string
  createdAt: string
  lastAccessedAt: string
  expiresAt: string
  current: boolean
}

export interface AuditEntry {
  id: string
  occurredAt: string
  actorUserId: string | null
  actorName: string | null
  actorRole: string | null
  action: string
  entityType: string
  entityId: string | null
  changes: Record<string, unknown>
}

export interface Page<T> {
  items: T[]
  page: number
  size: number
  total: number
}

export interface PlatformOrganization {
  id: string
  name: string
  country: string
  status: 'ACTIVE' | 'SUSPENDED'
  createdAt: string
  members: number
}

export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  FOREMAN: 'Encarregado',
  WORKER: 'Trabalhador',
}

const RANK: Record<OrgRole, number> = { OWNER: 0, ADMIN: 1, MANAGER: 2, FOREMAN: 3, WORKER: 4 }

/** Mesma regra do backend (`OrgRole.atLeast`). A UI só esconde; quem decide é o servidor. */
export function atLeast(role: OrgRole | undefined, minimum: OrgRole): boolean {
  return role !== undefined && RANK[role] <= RANK[minimum]
}

/** Experiência da interface a partir do papel na empresa. */
export type Experience = 'gestor' | 'encarregado' | 'trabalhador'
export function experienceOf(role: OrgRole): Experience {
  return role === 'FOREMAN' ? 'encarregado' : role === 'WORKER' ? 'trabalhador' : 'gestor'
}
