import type {
  Absence,
  Assignment,
  DB,
  DocumentRec,
  DocumentType,
  Site,
  Team,
  TimeEntry,
  Vehicle,
  Worker,
} from '@/domain/types'

let n = 0
const uid = (p: string) => `${p}${++n}`

export function site(p: Partial<Site> = {}): Site {
  return {
    id: uid('s'),
    code: 'OB-26-001',
    name: 'Obra Teste',
    clientId: 'c1',
    country: 'PT',
    city: 'Lisboa',
    address: '',
    lat: 38.7,
    lng: -9.1,
    timezone: 'Europe/Lisbon',
    status: 'em_curso',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    hourLimit: 1000,
    baselineRealized: 0,
    baselineApproved: 0,
    directorId: 'm1',
    foremanId: null,
    color: '#24543f',
    description: '',
    erpOrder: '',
    ...p,
  }
}

export function worker(p: Partial<Worker> = {}): Worker {
  return {
    id: uid('w'),
    number: '1000',
    name: 'Trabalhador Teste',
    category: 'Pedreiro',
    phone: '',
    email: '',
    nationality: 'Portuguesa',
    homeCity: 'Lisboa',
    hireDate: '2020-01-01',
    status: 'ativo',
    teamId: null,
    usualVehicleId: null,
    dailyHours: 8,
    hourlyCost: 12,
    sizes: {},
    ...p,
  }
}

export function assignment(p: Partial<Assignment> & Pick<Assignment, 'workerId' | 'siteId' | 'date'>): Assignment {
  return {
    id: uid('a'),
    hours: 8,
    start: '08:00',
    end: '17:00',
    teamId: null,
    vehicleId: null,
    isForeman: false,
    note: '',
    batchId: null,
    ...p,
  }
}

export function entry(p: Partial<TimeEntry> & Pick<TimeEntry, 'workerId' | 'siteId' | 'date'>): TimeEntry {
  return {
    id: uid('e'),
    clockIn: '08:00',
    clockOut: '17:00',
    breakMinutes: 60,
    breakStartedAt: null,
    source: 'ponto',
    status: 'submetido',
    corrections: [],
    rejectionReason: null,
    reviewedBy: null,
    approvedBy: null,
    note: '',
    ...p,
  }
}

export function absence(p: Partial<Absence> & Pick<Absence, 'workerId' | 'start' | 'end'>): Absence {
  return {
    id: uid('ab'),
    type: 'ferias',
    hours: null,
    status: 'aprovado',
    reason: '',
    requestedAt: '2026-10-01T09:00:00',
    decidedBy: null,
    decidedAt: null,
    decisionNote: '',
    ...p,
  }
}

export function vehicle(p: Partial<Vehicle> = {}): Vehicle {
  return {
    id: uid('v'),
    plate: 'AA-00-AA',
    make: 'Renault',
    model: 'Trafic',
    seats: 9,
    status: 'operacional',
    km: 10000,
    insuranceUntil: '2027-06-30',
    inspectionUntil: '2027-06-30',
    maintenanceDue: '2027-01-31',
    teamId: null,
    notes: '',
    ...p,
  }
}

export function team(p: Partial<Team> = {}): Team {
  return {
    id: uid('t'),
    name: 'Equipa Teste',
    color: '#24543f',
    foremanId: null,
    memberIds: [],
    vehicleId: null,
    siteId: null,
    history: [],
    ...p,
  }
}

export function docType(p: Partial<DocumentType> = {}): DocumentType {
  return {
    id: uid('dt'),
    name: 'Formulário A1',
    short: 'A1',
    appliesTo: 'trabalhador',
    countries: ['FR', 'BE', 'DE'],
    validityMonths: 24,
    mandatory: true,
    description: '',
    ...p,
  }
}

export function doc(p: Partial<DocumentRec> & Pick<DocumentRec, 'typeId' | 'ownerId'>): DocumentRec {
  return {
    id: uid('d'),
    ownerType: 'trabalhador',
    number: 'X-1',
    issuedAt: '2026-01-01',
    expiresAt: '2027-12-31',
    verification: 'verificado',
    fileName: 'documento.pdf',
    versions: [],
    ...p,
  }
}

const byId = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x]))

/** DB mínimo para testes de domínio. */
export function db(parts: {
  sites?: Site[]
  workers?: Worker[]
  teams?: Team[]
  vehicles?: Vehicle[]
  assignments?: Assignment[]
  entries?: TimeEntry[]
  absences?: Absence[]
  docTypes?: DocumentType[]
  documents?: DocumentRec[]
}): DB {
  return {
    company: { name: 'Teste', nif: '500000000', city: 'Lisboa' },
    managers: {},
    clients: {},
    diary: {},
    sites: byId(parts.sites ?? []),
    workers: byId(parts.workers ?? []),
    teams: byId(parts.teams ?? []),
    vehicles: byId(parts.vehicles ?? []),
    assignments: byId(parts.assignments ?? []),
    entries: byId(parts.entries ?? []),
    absences: byId(parts.absences ?? []),
    docTypes: byId(parts.docTypes ?? []),
    documents: byId(parts.documents ?? []),
    equipment: {},
    deliveries: {},
    issues: {},
    weekNotes: {},
    activity: [],
    notifications: [],
  }
}
