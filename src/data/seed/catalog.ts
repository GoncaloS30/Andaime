import type { Country, DocumentType, EquipmentItem, SizeKind } from '@/domain/types'

/** Todos os dados abaixo são fictícios. Qualquer semelhança com entidades reais é coincidência. */

export const COMPANY = {
  name: 'Construções Ribeira Alta, S.A.',
  nif: '599 000 128',
  city: 'Braga',
}

export const MANAGERS = [
  { id: 'm1', name: 'Marta Albuquerque', title: 'Diretora de operações', email: 'marta.albuquerque@ribeira-alta.example' },
  { id: 'm2', name: 'Henrique Saldanha', title: 'Diretor de obra', email: 'henrique.saldanha@ribeira-alta.example' },
]

export interface SiteSpec {
  id: string
  code: string
  name: string
  description: string
  client: { name: string; contact: string; country: Country }
  country: Country
  city: string
  address: string
  lat: number
  lng: number
  timezone: string
  limit: number
  /** Percentagem de horas realizadas alvo (inclui histórico). */
  target: number
  color: string
  director: 'm1' | 'm2'
  startOffsetDays: number
  durationDays: number
  planned?: boolean
}

export const SITES: SiteSpec[] = [
  {
    id: 's1', code: 'OB-24-031', name: 'Edifício Atlântida', description: 'Habitação coletiva, 48 fogos e 2 caves.',
    client: { name: 'Atlântida Investimentos Imobiliários, S.A.', contact: 'Sofia Rebelo', country: 'PT' },
    country: 'PT', city: 'Lisboa', address: 'Rua do Mar Vermelho, lote 2.14, 1990-000 Lisboa',
    lat: 38.7685, lng: -9.0975, timezone: 'Europe/Lisbon', limit: 18000, target: 0.62, color: '#2a78d6',
    director: 'm2', startOffsetDays: -590, durationDays: 860,
  },
  {
    id: 's2', code: 'OB-25-004', name: 'Escola Básica de Gualtar', description: 'Reabilitação e ampliação de edifício escolar.',
    client: { name: 'EducaNorte — Gestão de Equipamentos, E.M.', contact: 'Luís Barros', country: 'PT' },
    country: 'PT', city: 'Braga', address: 'Rua da Escola Nova, 4710-000 Braga',
    lat: 41.5655, lng: -8.3975, timezone: 'Europe/Lisbon', limit: 9000, target: 0.48, color: '#d4652f',
    director: 'm2', startOffsetDays: -250, durationDays: 420,
  },
  {
    id: 's3', code: 'OB-25-012', name: 'Hotel Ribeira Douro', description: 'Hotel de 92 quartos, estrutura e acabamentos.',
    client: { name: 'Douro Hospitality Group, Lda.', contact: 'Carla Meireles', country: 'PT' },
    country: 'PT', city: 'Porto', address: 'Cais das Pedras, 4050-000 Porto',
    lat: 41.1408, lng: -8.6135, timezone: 'Europe/Lisbon', limit: 9500, target: 0.71, color: '#1a9e72',
    director: 'm1', startOffsetDays: -310, durationDays: 520,
  },
  {
    id: 's4', code: 'OB-25-019', name: 'Centro Logístico Algarve', description: 'Armazém logístico com 14 000 m² e escritórios.',
    client: { name: 'LogiSul — Plataformas Logísticas, S.A.', contact: 'Ricardo Pinto', country: 'PT' },
    country: 'PT', city: 'Loulé', address: 'Zona Industrial do Cadoiço, 8100-000 Loulé',
    lat: 37.129, lng: -8.04, timezone: 'Europe/Lisbon', limit: 12000, target: 0.35, color: '#8a4fc7',
    director: 'm1', startOffsetDays: -140, durationDays: 480,
  },
  {
    id: 's5', code: 'OB-25-022', name: 'Résidence Les Terrasses', description: 'Residência sénior, 3 blocos. Destacamento em França.',
    client: { name: 'Immobilière Rhône Confluence SAS', contact: 'Julien Morel', country: 'FR' },
    country: 'FR', city: 'Lyon', address: '18 quai Perrache, 69002 Lyon',
    lat: 45.7485, lng: 4.8167, timezone: 'Europe/Paris', limit: 7000, target: 0.58, color: '#c0457f',
    director: 'm1', startOffsetDays: -200, durationDays: 380,
  },
  {
    id: 's6', code: 'OB-25-027', name: 'Immeuble Voltaire', description: 'Reabilitação de edifício de escritórios em Paris.',
    client: { name: 'Voltaire Patrimoine SCI', contact: 'Claire Dubois', country: 'FR' },
    country: 'FR', city: 'Paris', address: '112 boulevard Voltaire, 75011 Paris',
    lat: 48.86, lng: 2.379, timezone: 'Europe/Paris', limit: 5200, target: 0.81, color: '#3f8a2a',
    director: 'm1', startOffsetDays: -180, durationDays: 260,
  },
  {
    id: 's7', code: 'OB-25-030', name: 'Kanaal Kantoren', description: 'Edifício de escritórios junto ao canal. Destacamento na Bélgica.',
    client: { name: 'Kanaal Offices NV', contact: 'Pieter Janssens', country: 'BE' },
    country: 'BE', city: 'Bruxelas', address: 'Quai des Usines 40, 1000 Bruxelles',
    lat: 50.866, lng: 4.35, timezone: 'Europe/Brussels', limit: 6400, target: 0.4, color: '#4a3aa7',
    director: 'm2', startOffsetDays: -110, durationDays: 330,
  },
  {
    id: 's8', code: 'OB-26-002', name: 'Wohnanlage Isarpark', description: 'Conjunto habitacional de 36 fogos. Destacamento na Alemanha.',
    client: { name: 'Isar Wohnbau GmbH', contact: 'Katrin Huber', country: 'DE' },
    country: 'DE', city: 'Munique', address: 'Isarauen 7, 81379 München',
    lat: 48.111, lng: 11.565, timezone: 'Europe/Berlin', limit: 4800, target: 0.965, color: '#8f8a14',
    director: 'm2', startOffsetDays: -160, durationDays: 230,
  },
  {
    id: 's9', code: 'OB-26-005', name: 'Moradias Quinta da Lage', description: 'Quatro moradias unifamiliares. Arranque previsto.',
    client: { name: 'Quinta da Lage Desenvolvimento, Lda.', contact: 'Inês Corte-Real', country: 'PT' },
    country: 'PT', city: 'Sintra', address: 'Estrada da Lage, 2710-000 Sintra',
    lat: 38.798, lng: -9.39, timezone: 'Europe/Lisbon', limit: 6000, target: 0, color: '#2196a8',
    director: 'm2', startOffsetDays: 21, durationDays: 300, planned: true,
  },
]

export interface TeamSpec {
  id: string
  name: string
  color: string
  site: string
  vehicle: string
  size: number
  leader: 'Encarregado' | 'Chefe de equipa'
  posted: boolean
}

export const TEAMS: TeamSpec[] = [
  { id: 't1', name: 'Estrutura Lisboa', color: '#2a78d6', site: 's1', vehicle: 'v1', size: 6, leader: 'Encarregado', posted: false },
  { id: 't2', name: 'Cofragem Norte', color: '#d4652f', site: 's2', vehicle: 'v2', size: 5, leader: 'Encarregado', posted: false },
  { id: 't3', name: 'Acabamentos Douro', color: '#1a9e72', site: 's3', vehicle: 'v3', size: 5, leader: 'Encarregado', posted: false },
  { id: 't4', name: 'Algarve', color: '#8a4fc7', site: 's4', vehicle: 'v4', size: 5, leader: 'Chefe de equipa', posted: false },
  { id: 't5', name: 'França Sul', color: '#c0457f', site: 's5', vehicle: 'v5', size: 5, leader: 'Encarregado', posted: true },
  { id: 't6', name: 'França Norte', color: '#3f8a2a', site: 's6', vehicle: 'v6', size: 5, leader: 'Chefe de equipa', posted: true },
  { id: 't7', name: 'Benelux', color: '#4a3aa7', site: 's7', vehicle: 'v7', size: 4, leader: 'Encarregado', posted: true },
  { id: 't8', name: 'Baviera', color: '#8f8a14', site: 's8', vehicle: 'v8', size: 5, leader: 'Encarregado', posted: true },
]

export interface VehicleSpec {
  id: string
  plate: string
  make: string
  model: string
  seats: number
  km: number
  status?: 'oficina'
  notes?: string
}

export const VEHICLES: VehicleSpec[] = [
  { id: 'v1', plate: 'AT-41-RQ', make: 'Ford', model: 'Transit Custom', seats: 6, km: 84210 },
  { id: 'v2', plate: 'BG-07-LM', make: 'Renault', model: 'Trafic', seats: 9, km: 121530 },
  { id: 'v3', plate: 'CD-62-PX', make: 'Mercedes-Benz', model: 'Sprinter', seats: 9, km: 66480 },
  { id: 'v4', plate: 'FR-19-AK', make: 'Toyota', model: 'Proace', seats: 9, km: 143900 },
  { id: 'v5', plate: 'GH-88-TB', make: 'Volkswagen', model: 'Crafter', seats: 6, km: 97310 },
  { id: 'v6', plate: 'JL-23-NC', make: 'Citroën', model: 'Jumpy', seats: 6, km: 58020 },
  { id: 'v7', plate: 'KM-50-VR', make: 'Opel', model: 'Vivaro', seats: 6, km: 73650 },
  { id: 'v8', plate: 'LP-31-DS', make: 'Mercedes-Benz', model: 'Vito', seats: 8, km: 112480 },
  { id: 'v9', plate: 'NS-74-HE', make: 'Ford', model: 'Transit', seats: 9, km: 39880, notes: 'Viatura de reserva' },
  { id: 'v10', plate: 'PT-12-WO', make: 'Peugeot', model: 'Expert', seats: 6, km: 51200, notes: 'Viatura de reserva' },
  { id: 'v11', plate: 'RV-96-GU', make: 'Renault', model: 'Master', seats: 9, km: 188420, status: 'oficina', notes: 'Embraiagem — previsão de saída em 10 dias' },
]

type DocSpec = Omit<DocumentType, 'mandatory'> & { mandatory?: boolean }

export const DOC_TYPES: DocSpec[] = [
  { id: 'dt-med', name: 'Ficha de aptidão médica', short: 'Aptidão médica', appliesTo: 'trabalhador', countries: 'all', validityMonths: 12, description: 'Medicina do trabalho. Exigida para qualquer obra.' },
  { id: 'dt-sst', name: 'Formação em segurança e saúde no trabalho', short: 'Formação SST', appliesTo: 'trabalhador', countries: 'all', validityMonths: 36, description: 'Formação de acolhimento e prevenção de riscos.' },
  { id: 'dt-a1', name: 'Certificado A1 (destacamento UE)', short: 'A1', appliesTo: 'trabalhador', countries: ['FR', 'BE', 'DE'], validityMonths: 24, description: 'Comprova a legislação de segurança social aplicável durante o destacamento.' },
  { id: 'dt-btp', name: 'Cartão de identificação profissional BTP', short: 'Carte BTP', appliesTo: 'trabalhador', countries: ['FR'], validityMonths: 60, description: 'Cartão de identificação para trabalhadores da construção em França.' },
  { id: 'dt-limosa', name: 'Declaração Limosa', short: 'Limosa', appliesTo: 'trabalhador', countries: ['BE'], validityMonths: 12, description: 'Declaração prévia de destacamento na Bélgica.' },
  { id: 'dt-meldung', name: 'Declaração prévia de destacamento (Meldung)', short: 'Meldung', appliesTo: 'trabalhador', countries: ['DE'], validityMonths: 12, description: 'Declaração prévia junto das autoridades alemãs.' },
  { id: 'dt-cc', name: 'Documento de identificação', short: 'Identificação', appliesTo: 'trabalhador', countries: 'all', validityMonths: 120, mandatory: false, description: 'Cartão de cidadão ou título de residência.' },
  { id: 'dt-pss', name: 'Plano de segurança e saúde', short: 'PSS', appliesTo: 'obra', countries: 'all', validityMonths: null, description: 'Plano de segurança e saúde em obra.' },
  { id: 'dt-sipsi', name: 'Declaração SIPSI', short: 'SIPSI', appliesTo: 'obra', countries: ['FR'], validityMonths: 12, description: 'Declaração de destacamento por obra em França.' },
  { id: 'dt-alvara', name: 'Alvará de construção', short: 'Alvará', appliesTo: 'empresa', countries: 'all', validityMonths: 12, description: 'Habilitação da empresa para obras públicas e particulares.' },
  { id: 'dt-seguro', name: 'Seguro de acidentes de trabalho', short: 'Seguro AT', appliesTo: 'empresa', countries: 'all', validityMonths: 12, description: 'Apólice de acidentes de trabalho em vigor.' },
]

export interface EquipmentSpec extends Omit<EquipmentItem, 'serial'> {
  serial?: string
  kit?: boolean
}

export const EQUIPMENT: EquipmentSpec[] = [
  { id: 'eq-capacete', name: 'Capacete de proteção', kind: 'epi', sizeKind: null, stock: 24, kit: true },
  { id: 'eq-botas', name: 'Botas de segurança S3', kind: 'epi', sizeKind: 'botas', stock: 18, kit: true },
  { id: 'eq-colete', name: 'Colete refletor', kind: 'epi', sizeKind: 'roupa', stock: 30, kit: true },
  { id: 'eq-luvas', name: 'Luvas de proteção mecânica', kind: 'epi', sizeKind: 'luvas', stock: 60, kit: true },
  { id: 'eq-oculos', name: 'Óculos de proteção', kind: 'epi', sizeKind: null, stock: 40, kit: false },
  { id: 'eq-auricular', name: 'Protetores auriculares', kind: 'epi', sizeKind: null, stock: 50, kit: false },
  { id: 'eq-arnes', name: 'Arnês anti-queda', kind: 'epi', sizeKind: null, stock: 8, kit: false },
  { id: 'eq-tshirt', name: 'T-shirt de trabalho', kind: 'fardamento', sizeKind: 'roupa', stock: 45, kit: true },
  { id: 'eq-sweat', name: 'Sweat de trabalho', kind: 'fardamento', sizeKind: 'roupa', stock: 22, kit: true },
  { id: 'eq-parka', name: 'Parka impermeável', kind: 'fardamento', sizeKind: 'roupa', stock: 12, kit: false },
  { id: 'eq-calcas', name: 'Calças de trabalho', kind: 'fardamento', sizeKind: 'calcas', stock: 28, kit: true },
  { id: 'eq-berbequim', name: 'Aparafusadora sem fios 18 V', kind: 'ferramenta', sizeKind: null, stock: 6, serial: 'AP-18V' },
  { id: 'eq-rebarbadora', name: 'Rebarbadora 125 mm', kind: 'ferramenta', sizeKind: null, stock: 4, serial: 'RB-125' },
  { id: 'eq-laser', name: 'Nível laser rotativo', kind: 'ferramenta', sizeKind: null, stock: 2, serial: 'NL-R2' },
]

export const SIZE_FIELD: Record<Exclude<SizeKind, null>, 'tshirt' | 'calcas' | 'botas' | 'luvas'> = {
  roupa: 'tshirt',
  calcas: 'calcas',
  botas: 'botas',
  luvas: 'luvas',
}

export const FIRST_NAMES = [
  'Tiago', 'Rui', 'Nuno', 'Pedro', 'João', 'Miguel', 'André', 'Bruno', 'Carlos', 'Daniel', 'Diogo', 'Eduardo',
  'Fábio', 'Filipe', 'Gonçalo', 'Hugo', 'Ivo', 'Jorge', 'José', 'Luís', 'Marco', 'Mário', 'Paulo', 'Ricardo',
  'Rodrigo', 'Samuel', 'Sérgio', 'Vítor', 'Joaquim', 'Manuel', 'Artur', 'Fernando', 'Hélder', 'Leandro',
  'Márcio', 'Rafael', 'Renato', 'Telmo', 'Valter', 'Ana', 'Sara', 'Patrícia',
]

export const SURNAMES = [
  'Moreira', 'Fonseca', 'Carvalho', 'Teixeira', 'Pacheco', 'Antunes', 'Barbosa', 'Cardoso', 'Correia',
  'Cunha', 'Domingues', 'Esteves', 'Faria', 'Figueiredo', 'Freitas', 'Gaspar', 'Guerreiro', 'Leal', 'Lobo',
  'Macedo', 'Magalhães', 'Matos', 'Medeiros', 'Monteiro', 'Morais', 'Neves', 'Nogueira', 'Pinheiro',
  'Quintas', 'Rebelo', 'Sampaio', 'Sequeira', 'Simões', 'Soares', 'Tavares', 'Valente', 'Vaz', 'Veloso',
  'Vieira', 'Brandão', 'Coelho', 'Pires',
]

/** Trabalhadores de outras nacionalidades (nomes fictícios). */
export const FOREIGN = [
  { name: 'Oleksandr Bondar', nationality: 'Ucraniana' },
  { name: 'Andrei Munteanu', nationality: 'Romena' },
  { name: 'Edson Tavares Semedo', nationality: 'Cabo-verdiana' },
  { name: 'Wellington Araújo', nationality: 'Brasileira' },
  { name: 'Mihai Dumitrescu', nationality: 'Romena' },
]

export const HOME_CITIES = ['Braga', 'Guimarães', 'Barcelos', 'Vila Verde', 'Famalicão', 'Póvoa de Lanhoso', 'Amares', 'Fafe']
