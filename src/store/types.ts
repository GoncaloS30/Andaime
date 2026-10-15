import type { Conflict } from '@/domain/conflicts'
import type { AssignmentDraft, SkippedDraft } from '@/domain/planning'
import type {
  AbsenceType,
  Assignment,
  Client,
  Country,
  DB,
  DeliveryStatus,
  DocumentRec,
  HHMM,
  ID,
  ISODate,
  IssueCategory,
  Role,
  Settings,
  Site,
  Sizes,
  Team,
  TimeEntry,
  Vehicle,
  Worker,
} from '@/domain/types'
import type { Personas } from '@/data/seed'

export type { Personas }

export type WorkerOpKind = 'clockIn' | 'startBreak' | 'endBreak' | 'clockOut' | 'requestAbsence'

export interface WorkerOp {
  id: ID
  kind: WorkerOpKind
  workerId: ID
  date: ISODate
  /** Hora real em que o trabalhador fez a ação (mesmo offline). */
  time: HHMM
  label: string
  absence?: AbsenceRequest
  absenceId?: ID
}

export interface AbsenceRequest {
  type: AbsenceType
  start: ISODate
  end: ISODate
  hours?: number | null
  reason: string
}

export interface Session {
  today: ISODate
  role: Role
  personas: Personas
  online: boolean
  outbox: WorkerOp[]
  syncing: boolean
  flags: { emptyCompany: boolean; simulateError: boolean }
  settings: Settings
  seededAt: string
}

export interface UndoSnapshot {
  label: string
  assignments: DB['assignments']
  teams: DB['teams']
  vehicles: DB['vehicles']
  workers: DB['workers']
  sites: DB['sites']
}

export interface ScheduleInput {
  teamId: ID | null
  siteId: ID
  workerIds: ID[]
  dates: ISODate[]
  start: HHMM
  end: HHMM
  vehicleId: ID | null
  foremanId: ID | null
  note: string
}

export interface AssignInput {
  workerId: ID
  siteId: ID
  date: ISODate
  hours?: number
  start?: HHMM
  end?: HHMM
  teamId?: ID | null
  vehicleId?: ID | null
  note?: string
}

export interface TransferInput {
  workerId: ID
  siteId: ID
  from: ISODate
  to: ISODate
  permanent: boolean
  start?: HHMM
  end?: HHMM
}

export interface SiteInput {
  name: string
  clientId?: ID
  newClient?: Omit<Client, 'id' | 'nif'> & { nif?: string }
  country: Country
  city: string
  address: string
  lat: number
  lng: number
  hourLimit: number | null
  startDate: ISODate
  endDate: ISODate
  directorId: ID
  description: string
  teamId?: ID | null
  vehicleId?: ID | null
  planWeeks?: number
  moveTeam?: boolean
}

export interface TeamInput {
  name: string
  color: string
  foremanId: ID | null
  memberIds: ID[]
  vehicleId: ID | null
  siteId: ID | null
}

export type WorkerInput = Omit<Worker, 'id' | 'number' | 'status'> & { number?: string; status?: Worker['status'] }

export interface ManualEntryInput {
  workerId: ID
  siteId: ID
  date: ISODate
  clockIn: HHMM
  clockOut: HHMM
  breakMinutes: number
  note: string
}

export interface FixResult {
  ok: boolean
  message: string
  navigate?: string
}

export interface CopyPlan {
  drafts: AssignmentDraft[]
  skipped: SkippedDraft[]
}

export interface DemoActions {
  // sessão
  setRole(role: Role): void
  setPersona(role: Role, id: ID): void
  setOnline(online: boolean): void
  syncOutbox(): Promise<void>
  setFlag(flag: keyof Session['flags'], value: boolean): void
  setSettings(patch: Partial<Settings>): void
  resetDemo(): void
  // planeamento
  previewSchedule(input: ScheduleInput): Conflict[]
  createSchedule(input: ScheduleInput): { batchId: ID; created: number }
  assign(input: AssignInput): ID
  moveAssignment(id: ID, target: { workerId?: ID; date?: ISODate; siteId?: ID }, copy?: boolean): ID
  updateAssignment(id: ID, patch: Partial<Pick<Assignment, 'hours' | 'start' | 'end' | 'note' | 'vehicleId' | 'isForeman'>>): void
  removeAssignments(ids: ID[]): void
  setRange(anchorId: ID, from: ISODate, to: ISODate): void
  bulkUpdate(ids: ID[], patch: Partial<Pick<Assignment, 'siteId' | 'vehicleId' | 'start' | 'end'>>): void
  previewTransfer(input: TransferInput): Conflict[]
  transferWorker(input: TransferInput): { removed: number; created: number }
  previewCopyWeek(fromWs: ISODate, toWs: ISODate, opts: { teamIds?: ID[] }): CopyPlan
  applyCopyWeek(fromWs: ISODate, toWs: ISODate, opts: { teamIds?: ID[] }): { created: number }
  applyFix(conflictId: string, fixId: string): FixResult
  undo(): string | null
  canUndo(): boolean
  setWeekNote(weekStart: ISODate, text: string): void
  // obras e clientes
  createSite(input: SiteInput): ID
  updateSite(id: ID, patch: Partial<Omit<Site, 'id' | 'code'>>): void
  // equipas
  createTeam(input: TeamInput): ID
  updateTeam(id: ID, patch: Partial<TeamInput>): void
  duplicateTeam(id: ID): ID
  // trabalhadores
  createWorker(input: WorkerInput): ID
  updateWorker(id: ID, patch: Partial<Omit<Worker, 'id'>>): void
  updateSizes(id: ID, sizes: Sizes): void
  // viaturas
  previewTeamVehicle(teamId: ID, vehicleId: ID, from: ISODate): Conflict[]
  setTeamVehicle(teamId: ID, vehicleId: ID, from: ISODate): void
  createVehicle(input: Omit<Vehicle, 'id' | 'teamId'>): ID
  updateVehicle(id: ID, patch: Partial<Omit<Vehicle, 'id'>>): void
  // horas
  clockIn(time?: HHMM): void
  startBreak(time?: HHMM): void
  endBreak(time?: HHMM): void
  clockOut(time?: HHMM): void
  createManualEntry(input: ManualEntryInput): ID
  reviewEntries(ids: ID[]): void
  returnEntries(ids: ID[], reason: string): void
  approveEntries(ids: ID[]): void
  rejectEntries(ids: ID[], reason: string): void
  correctEntry(id: ID, patch: Partial<Pick<TimeEntry, 'clockIn' | 'clockOut' | 'breakMinutes' | 'siteId'>>, reason: string): void
  confirmPresence(workerId: ID, date: ISODate, present: boolean): void
  // ausências
  requestAbsence(input: AbsenceRequest, workerId?: ID): ID
  createAbsence(input: AbsenceRequest & { workerId: ID }): ID
  decideAbsence(id: ID, decision: 'aprovado' | 'rejeitado', note: string): void
  cancelAbsence(id: ID): void
  // documentos
  updateDocument(id: ID, patch: { expiresAt: ISODate | null; number?: string; note?: string; fileName?: string }): void
  addDocument(input: Pick<DocumentRec, 'typeId' | 'ownerType' | 'ownerId' | 'number' | 'issuedAt' | 'expiresAt'> & { fileName?: string }): ID
  verifyDocument(id: ID, verification: 'verificado' | 'rejeitado'): void
  // equipamento
  recordDelivery(input: { workerId: ID; itemId: ID; size: string; qty: number; date: ISODate; note: string }): ID
  recordReturn(deliveryId: ID, status: Exclude<DeliveryStatus, 'entregue'>, note: string): void
  // ocorrências e notificações
  reportIssue(input: { siteId: ID; category: IssueCategory; text: string }): ID
  resolveIssue(id: ID): void
  markNotificationsRead(): void
  markNotificationRead(id: ID): void
}

export interface DemoState extends DemoActions {
  db: DB
  session: Session
  undoStack: UndoSnapshot[]
}

export type { Team }
