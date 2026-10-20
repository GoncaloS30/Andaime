import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api, ApiError } from './http'

/** Contratos F5: documentos, ausências, fardamento/EPI e notificações. */

const base = (orgId: string) => `/orgs/${orgId}`

function useInvalidate(orgId: string, ...scopes: string[]) {
  const qc = useQueryClient()
  return () => Promise.all([...scopes, 'notifications', 'audit'].map((s) => qc.invalidateQueries({ queryKey: ['org', orgId, s] })))
}

// --- documentos ------------------------------------------------------------------------------------

export type DocStatus = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING'

export interface DocumentType {
  id: string
  name: string
  subject: 'EMPLOYEE' | 'VEHICLE'
  requiresExpiry: boolean
  alertDays: number
  requiredEverywhere: boolean
  requiredCountries: string[]
  version: number
}

export interface DocVersion {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  sha256: string
  issuedOn: string | null
  expiresOn: string | null
  uploadedBy: string
  uploadedAt: string
  verifiedBy: string | null
  verifiedAt: string | null
}

export interface DocumentItem {
  id: string
  typeId: string
  typeName: string
  employeeId: string | null
  employeeName: string | null
  vehicleId: string | null
  vehiclePlate: string | null
  status: Exclude<DocStatus, 'MISSING'>
  expiresOn: string | null
  verified: boolean
  current: DocVersion | null
  versions: DocVersion[]
  archived: boolean
  version: number
}

export interface ComplianceRow {
  employeeId: string
  employeeName: string
  items: { typeId: string; typeName: string; status: DocStatus; expiresOn: string | null; documentId: string | null }[]
  missing: number
  expired: number
}

export const DOC_STATUS_LABEL: Record<DocStatus, string> = { VALID: 'Válido', EXPIRING: 'A caducar', EXPIRED: 'Caducado', MISSING: 'Em falta' }
export const DOC_STATUS_TONE: Record<DocStatus, 'ok' | 'warn' | 'danger' | 'neutral'> = { VALID: 'ok', EXPIRING: 'warn', EXPIRED: 'danger', MISSING: 'neutral' }

export const useDocumentTypes = (orgId: string) =>
  useQuery({ queryKey: ['org', orgId, 'documents', 'types'], queryFn: () => api<DocumentType[]>(`${base(orgId)}/document-types`), staleTime: 60_000 })

export const useDocuments = (orgId: string, filters: { employeeId?: string; vehicleId?: string; status?: string } = {}) => {
  const search = new URLSearchParams(Object.entries(filters).filter(([, v]) => !!v) as [string, string][]).toString()
  return useQuery({
    queryKey: ['org', orgId, 'documents', 'list', filters],
    queryFn: () => api<DocumentItem[]>(`${base(orgId)}/documents${search ? `?${search}` : ''}`),
    placeholderData: keepPreviousData,
  })
}

export const useDocument = (orgId: string, id: string | null) =>
  useQuery({ queryKey: ['org', orgId, 'documents', 'detail', id], queryFn: () => api<DocumentItem>(`${base(orgId)}/documents/${id}`), enabled: !!id })

export const useCompliance = (orgId: string, country?: string, enabled = true) =>
  useQuery({
    queryKey: ['org', orgId, 'documents', 'compliance', country ?? ''],
    queryFn: () => api<ComplianceRow[]>(`${base(orgId)}/documents/compliance${country ? `?country=${country}` : ''}`),
    enabled,
  })

/** Upload multipart (o cliente HTTP comum é JSON). Mesma origem, cookie de sessão e cabeçalho CSRF. */
async function uploadDocument(orgId: string, form: FormData) {
  const xsrf = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))?.slice('XSRF-TOKEN='.length)
  const response = await fetch(`/api${base(orgId)}/documents`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {}) },
    body: form,
  })
  const body = (await response.json().catch(() => ({}))) as { code?: string; detail?: string; errors?: { field: string; code: string; message: string }[] }
  if (!response.ok) {
    throw new ApiError(response.status, body.code ?? `http-${response.status}`, body.detail ?? 'Não foi possível carregar o ficheiro.', {
      fieldErrors: body.errors,
      details: body as Record<string, unknown>,
    })
  }
  return body as unknown as DocumentItem
}

export function useUploadDocument(orgId: string) {
  const invalidate = useInvalidate(orgId, 'documents', 'planning')
  return useMutation({
    mutationFn: async (v: { typeId: string; employeeId?: string; vehicleId?: string; issuedOn?: string; expiresOn?: string; file: File }) => {
      // Garante o cookie CSRF antes do primeiro pedido de escrita.
      if (!document.cookie.includes('XSRF-TOKEN=')) await fetch('/api/auth/csrf', { credentials: 'same-origin' })
      const form = new FormData()
      form.set('typeId', v.typeId)
      if (v.employeeId) form.set('employeeId', v.employeeId)
      if (v.vehicleId) form.set('vehicleId', v.vehicleId)
      if (v.issuedOn) form.set('issuedOn', v.issuedOn)
      if (v.expiresOn) form.set('expiresOn', v.expiresOn)
      form.set('file', v.file)
      return uploadDocument(orgId, form)
    },
    onSettled: invalidate,
  })
}

export function useDocumentAction(orgId: string) {
  const invalidate = useInvalidate(orgId, 'documents', 'planning')
  return useMutation({
    mutationFn: (v: { action: 'verify'; documentId: string; versionId: string } | { action: 'archive'; documentId: string }) =>
      v.action === 'verify'
        ? api<DocumentItem>(`${base(orgId)}/documents/${v.documentId}/versions/${v.versionId}/verify`, { method: 'POST' })
        : api<DocumentItem>(`${base(orgId)}/documents/${v.documentId}/archive`, { method: 'POST' }),
    onSettled: invalidate,
  })
}

export function useSaveDocumentType(orgId: string) {
  const invalidate = useInvalidate(orgId, 'documents', 'planning')
  return useMutation({
    mutationFn: (
      v:
        | { mode: 'create'; name: string; subject: 'EMPLOYEE' | 'VEHICLE'; requiresExpiry: boolean; alertDays: number }
        | { mode: 'requirements'; id: string; everywhere: boolean; countries: string[] }
        | { mode: 'archive'; id: string },
    ): Promise<unknown> => {
      if (v.mode === 'create') return api<DocumentType>(`${base(orgId)}/document-types`, { method: 'POST', body: v })
      if (v.mode === 'archive') return api<void>(`${base(orgId)}/document-types/${v.id}/archive`, { method: 'POST' })
      return api<DocumentType>(`${base(orgId)}/document-types/${v.id}/requirements`, { method: 'PUT', body: { everywhere: v.everywhere, countries: v.countries } })
    },
    onSettled: invalidate,
  })
}

export const downloadUrl = (orgId: string, documentId: string, versionId: string) =>
  `/api${base(orgId)}/documents/${documentId}/versions/${versionId}/download`

// --- ausências ------------------------------------------------------------------------------------

export type AbsenceKind = 'VACATION' | 'SICK' | 'TRAINING' | 'PERSONAL' | 'OTHER'
export type AbsenceStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export interface Absence {
  id: string
  employeeId: string
  employeeName: string
  kind: AbsenceKind
  startsOn: string
  endsOn: string
  partialMinutes: number | null
  status: AbsenceStatus
  note: string | null
  requestedBy: string
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
  days: number
  version: number
}

export interface ImpactItem {
  assignmentId: string
  date: string
  siteId: string
  start: string
  end: string
  plannedMin: number
}

export const ABSENCE_KIND_LABEL: Record<AbsenceKind, string> = { VACATION: 'Férias', SICK: 'Doença', TRAINING: 'Formação', PERSONAL: 'Assunto pessoal', OTHER: 'Outra' }
export const ABSENCE_STATUS_LABEL: Record<AbsenceStatus, string> = { REQUESTED: 'Pedida', APPROVED: 'Aprovada', REJECTED: 'Recusada', CANCELLED: 'Cancelada' }
export const ABSENCE_STATUS_TONE: Record<AbsenceStatus, 'info' | 'ok' | 'danger' | 'neutral'> = { REQUESTED: 'info', APPROVED: 'ok', REJECTED: 'danger', CANCELLED: 'neutral' }

export const useAbsences = (orgId: string, from: string, to: string, status?: AbsenceStatus | '') =>
  useQuery({
    queryKey: ['org', orgId, 'absences', from, to, status ?? ''],
    queryFn: () => api<Absence[]>(`${base(orgId)}/absences?from=${from}&to=${to}${status ? `&status=${status}` : ''}`),
    placeholderData: keepPreviousData,
  })

export const useAbsenceImpact = (orgId: string, id: string | null) =>
  useQuery({
    queryKey: ['org', orgId, 'absences', 'impact', id],
    queryFn: () => api<{ absenceId: string; assignments: ImpactItem[] }>(`${base(orgId)}/absences/${id}/impact`),
    enabled: !!id,
  })

export function useAbsenceAction(orgId: string) {
  const invalidate = useInvalidate(orgId, 'absences', 'planning')
  return useMutation({
    mutationFn: (
      v:
        | { action: 'request'; employeeId?: string; kind: AbsenceKind; startsOn: string; endsOn: string; partialMinutes?: number | null; note?: string }
        | { action: 'approve'; id: string; resolution?: 'REMOVE' | 'KEEP'; version: number }
        | { action: 'reject'; id: string; note: string; version: number }
        | { action: 'cancel'; id: string; version: number },
    ) => {
      if (v.action === 'request') {
        const { action: _a, ...body } = v
        return api<Absence>(`${base(orgId)}/absences`, { method: 'POST', body })
      }
      const { action, id, ...body } = v
      return api<Absence>(`${base(orgId)}/absences/${id}/${action}`, { method: 'POST', body })
    },
    onSettled: invalidate,
  })
}

// --- fardamento e EPI ---------------------------------------------------------------------------------

export type EquipmentCategory = 'PPE' | 'UNIFORM' | 'TOOL'

export interface EquipmentItem {
  id: string
  name: string
  category: EquipmentCategory
  tracking: 'STOCK' | 'SERIAL'
  size: string | null
  minStock: number
  onHand: number
  assigned: number
  low: boolean
  archived: boolean
  version: number
}

export interface EquipmentUnit {
  id: string
  itemId: string
  serial: string
  status: 'IN_STOCK' | 'ASSIGNED' | 'DAMAGED' | 'LOST'
  holderEmployeeId: string | null
  holderName: string | null
}

export interface Holding {
  itemId: string
  itemName: string
  category: EquipmentCategory
  size: string | null
  quantity: number
  serials: string[]
}

export interface EquipmentMovement {
  id: string
  itemId: string
  itemName: string
  kind: 'RECEIVE' | 'ADJUST_IN' | 'ADJUST_OUT' | 'DELIVER' | 'RETURN' | 'DAMAGED' | 'LOST'
  quantity: number
  serial: string | null
  employeeId: string | null
  employeeName: string | null
  note: string | null
  userName: string
  occurredAt: string
}

export const CATEGORY_LABEL: Record<EquipmentCategory, string> = { PPE: 'EPI', UNIFORM: 'Fardamento', TOOL: 'Ferramenta' }
export const MOVEMENT_LABEL: Record<EquipmentMovement['kind'], string> = {
  RECEIVE: 'Entrada',
  ADJUST_IN: 'Acerto (+)',
  ADJUST_OUT: 'Acerto (−)',
  DELIVER: 'Entrega',
  RETURN: 'Devolução',
  DAMAGED: 'Danificado',
  LOST: 'Perdido',
}
export const UNIT_STATUS_LABEL: Record<EquipmentUnit['status'], string> = { IN_STOCK: 'Em armazém', ASSIGNED: 'Entregue', DAMAGED: 'Danificado', LOST: 'Perdido' }

export const useEquipmentItems = (orgId: string) =>
  useQuery({ queryKey: ['org', orgId, 'equipment', 'items'], queryFn: () => api<EquipmentItem[]>(`${base(orgId)}/equipment/items`) })

export const useEquipmentUnits = (orgId: string, itemId: string | null) =>
  useQuery({ queryKey: ['org', orgId, 'equipment', 'units', itemId], queryFn: () => api<EquipmentUnit[]>(`${base(orgId)}/equipment/items/${itemId}/units`), enabled: !!itemId })

export const useHoldings = (orgId: string, employeeId: string | null) =>
  useQuery({ queryKey: ['org', orgId, 'equipment', 'holdings', employeeId], queryFn: () => api<Holding[]>(`${base(orgId)}/equipment/holdings/${employeeId}`), enabled: !!employeeId })

export const useMovements = (orgId: string, employeeId?: string) =>
  useQuery({
    queryKey: ['org', orgId, 'equipment', 'movements', employeeId ?? ''],
    queryFn: () => api<EquipmentMovement[]>(`${base(orgId)}/equipment/movements?limit=50${employeeId ? `&employeeId=${employeeId}` : ''}`),
  })

export function useEquipmentAction(orgId: string) {
  const invalidate = useInvalidate(orgId, 'equipment')
  return useMutation({
    mutationFn: (
      v:
        | { action: 'create'; name: string; category: EquipmentCategory; tracking: 'STOCK' | 'SERIAL'; size?: string; minStock?: number }
        | { action: 'receive'; itemId: string; quantity?: number; serials?: string[]; note?: string }
        | { action: 'adjust'; itemId: string; delta: number; note: string }
        | { action: 'deliver' | 'return'; itemId: string; employeeId: string; quantity?: number; unitId?: string; condition?: 'OK' | 'DAMAGED' | 'LOST'; note?: string },
    ) => {
      switch (v.action) {
        case 'create': {
          const { action: _a, ...body } = v
          return api<unknown>(`${base(orgId)}/equipment/items`, { method: 'POST', body })
        }
        case 'adjust':
          return api<unknown>(`${base(orgId)}/equipment/items/${v.itemId}/adjust`, { method: 'POST', body: { delta: v.delta, note: v.note } })
        default: {
          const { action, ...body } = v
          return api<unknown>(`${base(orgId)}/equipment/${action}`, { method: 'POST', body })
        }
      }
    },
    onSettled: invalidate,
  })
}

// --- notificações --------------------------------------------------------------------------------------

export interface NotificationItem {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  createdAt: string
  read: boolean
}

/**
 * Caixa de notificações: sinal em tempo real por SSE (quando disponível) e consulta periódica de reserva.
 * O SSE só diz "há novidades"; a lista vem sempre da API com as regras de acesso normais.
 */
export function useNotifications(orgId: string) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['org', orgId, 'notifications'],
    queryFn: () => api<{ unread: number; items: NotificationItem[] }>(`${base(orgId)}/notifications?limit=30`),
    refetchInterval: 60_000,
  })
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const source = new EventSource(`/api${base(orgId)}/notifications/stream`, { withCredentials: true })
    const refresh = () => void qc.invalidateQueries({ queryKey: ['org', orgId, 'notifications'] })
    source.addEventListener('changed', refresh)
    return () => source.close()
  }, [orgId, qc])
  return query
}

export function useMarkNotificationsRead(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => api<{ unread: number; items: NotificationItem[] }>(`${base(orgId)}/notifications/read`, { method: 'POST', body: { ids } }),
    onSuccess: (data) => qc.setQueryData(['org', orgId, 'notifications'], data),
  })
}
