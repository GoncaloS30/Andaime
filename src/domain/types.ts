/** Modelo de domínio do Andaime. Sem React nem estado: só formas de dados. */

export type ID = string
/** Data civil 'YYYY-MM-DD' (sem fuso). */
export type ISODate = string
/** Hora local 'HH:MM'. */
export type HHMM = string
export type Country = 'PT' | 'FR' | 'BE' | 'DE'
export type Role = 'gestor' | 'encarregado' | 'trabalhador'

export interface Company {
  name: string
  nif: string
  city: string
}

export interface Manager {
  id: ID
  name: string
  title: string
  email: string
}

export interface Client {
  id: ID
  name: string
  nif: string
  contactName: string
  email: string
  country: Country
}

export type SiteStatus = 'planeada' | 'em_curso' | 'suspensa' | 'concluida'

export interface Site {
  id: ID
  code: string
  name: string
  clientId: ID
  country: Country
  city: string
  address: string
  lat: number
  lng: number
  timezone: string
  status: SiteStatus
  startDate: ISODate
  endDate: ISODate
  /** Limite de horas contratado ou configurado. null = sem limite definido. */
  hourLimit: number | null
  /** Horas realizadas antes da janela de dados da demonstração (histórico importado). */
  baselineRealized: number
  /** Parte do histórico já aprovada. */
  baselineApproved: number
  directorId: ID
  foremanId: ID | null
  color: string
  description: string
  /** Código de ordem/centro de custo para exportação ERP. */
  erpOrder: string
}

export type WorkerCategory =
  | 'Encarregado'
  | 'Chefe de equipa'
  | 'Pedreiro'
  | 'Carpinteiro de cofragem'
  | 'Armador de ferro'
  | 'Eletricista'
  | 'Canalizador'
  | 'Manobrador'
  | 'Serralheiro'
  | 'Servente'

export interface Sizes {
  tshirt?: string
  sweat?: string
  parka?: string
  calcas?: string
  botas?: string
  luvas?: string
}

export interface Worker {
  id: ID
  number: string
  name: string
  category: WorkerCategory
  phone: string
  email: string
  nationality: string
  homeCity: string
  hireDate: ISODate
  status: 'ativo' | 'inativo'
  teamId: ID | null
  usualVehicleId: ID | null
  dailyHours: number
  hourlyCost: number
  sizes: Sizes
}

export interface TeamHistoryItem {
  at: string
  text: string
}

export interface Team {
  id: ID
  name: string
  color: string
  foremanId: ID | null
  memberIds: ID[]
  vehicleId: ID | null
  siteId: ID | null
  history: TeamHistoryItem[]
}

export type VehicleStatus = 'operacional' | 'oficina' | 'inativa'

export interface Vehicle {
  id: ID
  plate: string
  make: string
  model: string
  seats: number
  status: VehicleStatus
  km: number
  insuranceUntil: ISODate
  inspectionUntil: ISODate
  maintenanceDue: ISODate
  teamId: ID | null
  notes: string
}

/** Unidade do planeamento: um trabalhador, numa obra, num dia (ADR-0003). */
export interface Assignment {
  id: ID
  workerId: ID
  siteId: ID
  date: ISODate
  hours: number
  start: HHMM
  end: HHMM
  teamId: ID | null
  /** Viatura em que o trabalhador se desloca nesse dia. */
  vehicleId: ID | null
  isForeman: boolean
  note: string
  batchId: ID | null
}

export type EntryStatus = 'aberto' | 'submetido' | 'revisto' | 'aprovado' | 'rejeitado'
export type EntrySource = 'ponto' | 'manual' | 'encarregado'

export interface Correction {
  at: string
  by: string
  reason: string
  before: string
  after: string
}

export interface TimeEntry {
  id: ID
  workerId: ID
  siteId: ID
  date: ISODate
  clockIn: HHMM
  clockOut: HHMM | null
  breakMinutes: number
  /** Pausa em curso (início). */
  breakStartedAt: HHMM | null
  source: EntrySource
  status: EntryStatus
  corrections: Correction[]
  rejectionReason: string | null
  reviewedBy: string | null
  approvedBy: string | null
  note: string
}

export type AbsenceType =
  | 'ferias'
  | 'falta_justificada'
  | 'falta_injustificada'
  | 'baixa'
  | 'formacao'
  | 'parcial'

export type AbsenceStatus = 'pedido' | 'aprovado' | 'rejeitado'

export interface Absence {
  id: ID
  workerId: ID
  type: AbsenceType
  start: ISODate
  end: ISODate
  /** Só para ausências parciais: horas de ausência por dia. */
  hours: number | null
  status: AbsenceStatus
  reason: string
  requestedAt: string
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string
}

export type DocOwnerType = 'trabalhador' | 'obra' | 'empresa'

export interface DocumentType {
  id: ID
  name: string
  short: string
  appliesTo: DocOwnerType
  /** Países onde é exigido; 'all' = sempre. */
  countries: Country[] | 'all'
  validityMonths: number | null
  mandatory: boolean
  description: string
}

export type Verification = 'por_verificar' | 'verificado' | 'rejeitado'

export interface DocVersion {
  version: number
  at: string
  by: string
  expiresAt: ISODate | null
  note: string
}

export interface DocumentRec {
  id: ID
  typeId: ID
  ownerType: DocOwnerType
  ownerId: ID
  number: string
  issuedAt: ISODate
  expiresAt: ISODate | null
  verification: Verification
  fileName: string
  versions: DocVersion[]
}

export type EquipmentKind = 'fardamento' | 'epi' | 'ferramenta'
export type SizeKind = 'roupa' | 'calcas' | 'botas' | 'luvas' | null

export interface EquipmentItem {
  id: ID
  name: string
  kind: EquipmentKind
  sizeKind: SizeKind
  stock: number
  /** Nº de série para ferramentas; vazio para consumíveis. */
  serial: string
}

export type DeliveryStatus = 'entregue' | 'devolvido' | 'danificado' | 'perdido'

export interface Delivery {
  id: ID
  workerId: ID
  itemId: ID
  size: string
  qty: number
  date: ISODate
  status: DeliveryStatus
  returnedAt: ISODate | null
  by: string
  note: string
}

export type IssueCategory = 'seguranca' | 'material' | 'equipamento' | 'acesso' | 'outro'

export interface Issue {
  id: ID
  siteId: ID
  reportedBy: string
  at: string
  category: IssueCategory
  text: string
  status: 'aberto' | 'resolvido'
}

export interface WeekNote {
  weekStart: ISODate
  text: string
}

export type ActorRole = Role | 'sistema'

export interface ActivityRefs {
  workerId?: ID
  siteId?: ID
  teamId?: ID
  vehicleId?: ID
  documentId?: ID
}

export interface ActivityEvent {
  id: ID
  at: string
  actor: string
  role: ActorRole
  kind: string
  text: string
  refs: ActivityRefs
}

export interface Notification {
  id: ID
  at: string
  role: Role
  /** Persona específica; null = todas as personas desse papel. */
  personaId: ID | null
  title: string
  body: string
  link: string | null
  read: boolean
}

export interface DB {
  company: Company
  managers: Record<ID, Manager>
  clients: Record<ID, Client>
  sites: Record<ID, Site>
  workers: Record<ID, Worker>
  teams: Record<ID, Team>
  vehicles: Record<ID, Vehicle>
  assignments: Record<ID, Assignment>
  entries: Record<ID, TimeEntry>
  absences: Record<ID, Absence>
  docTypes: Record<ID, DocumentType>
  documents: Record<ID, DocumentRec>
  equipment: Record<ID, EquipmentItem>
  deliveries: Record<ID, Delivery>
  issues: Record<ID, Issue>
  weekNotes: Record<ISODate, WeekNote>
  activity: ActivityEvent[]
  notifications: Notification[]
}

export interface Settings {
  /** Horas normais por dia útil. */
  dailyNormal: number
  /** Pausa por defeito em minutos. */
  defaultBreak: number
  /** Códigos de atividade para a exportação ERP. */
  activityCodes: { normal: string; ate9: string; extra: string }
}

export const DEFAULT_SETTINGS: Settings = {
  dailyNormal: 8,
  defaultBreak: 60,
  activityCodes: { normal: '800', ate9: '801', extra: '802' },
}
