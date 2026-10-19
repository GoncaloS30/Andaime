import type {
  AbsenceStatus,
  AbsenceType,
  Country,
  DeliveryStatus,
  EntryStatus,
  IssueCategory,
  SiteStatus,
  Verification,
  VehicleStatus,
  WorkerCategory,
} from './types'

export const COUNTRY_NAME: Record<Country, string> = {
  PT: 'Portugal',
  FR: 'França',
  BE: 'Bélgica',
  DE: 'Alemanha',
}

export const COUNTRY_FLAG: Record<Country, string> = { PT: 'PT', FR: 'FR', BE: 'BE', DE: 'DE' }

export const CATEGORIES: WorkerCategory[] = [
  'Encarregado',
  'Chefe de equipa',
  'Pedreiro',
  'Carpinteiro de cofragem',
  'Armador de ferro',
  'Eletricista',
  'Canalizador',
  'Manobrador',
  'Serralheiro',
  'Servente',
]

export const LEADER_CATEGORIES: WorkerCategory[] = ['Encarregado', 'Chefe de equipa']

export const SITE_STATUS: Record<SiteStatus, string> = {
  planeada: 'Planeada',
  em_curso: 'Em curso',
  suspensa: 'Suspensa',
  concluida: 'Concluída',
}

export const VEHICLE_STATUS: Record<VehicleStatus, string> = {
  operacional: 'Operacional',
  oficina: 'Na oficina',
  inativa: 'Inativa',
}

export const ENTRY_STATUS: Record<EntryStatus, string> = {
  aberto: 'Em curso',
  submetido: 'Por rever',
  revisto: 'Por aprovar',
  aprovado: 'Aprovada',
  rejeitado: 'Devolvida',
}

export const ABSENCE_TYPE: Record<AbsenceType, string> = {
  ferias: 'Férias',
  falta_justificada: 'Falta justificada',
  falta_injustificada: 'Falta injustificada',
  baixa: 'Baixa médica',
  formacao: 'Formação',
  parcial: 'Ausência parcial',
  licenca: 'Licença',
  outra: 'Outra ausência',
}

/** Cor de cada tipo (mapa do ano, agenda, calendário). Nunca é o único sinal: vai sempre com o nome. */
export const ABSENCE_COLOR: Record<AbsenceType, string> = {
  ferias: '#1a9e72',
  falta_justificada: '#2a78d6',
  falta_injustificada: '#b03a2e',
  baixa: '#8a4fc7',
  formacao: '#d4652f',
  parcial: '#8f8a14',
  licenca: '#c0457f',
  outra: '#5c635e',
}

/** Ajuda no formulário: o que cabe em cada tipo. */
export const ABSENCE_NOTE: Record<AbsenceType, string> = {
  ferias: 'Entra também no mapa de férias do ano.',
  falta_justificada: 'Falta com justificação entregue.',
  falta_injustificada: 'Falta sem justificação.',
  baixa: 'Doença ou acidente, com baixa.',
  formacao: 'Dia passado em formação, fora da obra.',
  parcial: 'Só algumas horas do dia.',
  licenca: 'Parental, casamento, luto: as licenças previstas na lei.',
  outra: 'O que não encaixa nos motivos de cima.',
}

export const ABSENCE_STATUS: Record<AbsenceStatus, string> = {
  pedido: 'Pendente',
  aprovado: 'Aprovada',
  rejeitado: 'Recusada',
}

export const VERIFICATION: Record<Verification, string> = {
  por_verificar: 'Por verificar',
  verificado: 'Verificado',
  rejeitado: 'Rejeitado',
}

export const DELIVERY_STATUS: Record<DeliveryStatus, string> = {
  entregue: 'Entregue',
  devolvido: 'Devolvido',
  danificado: 'Danificado',
  perdido: 'Perdido',
}

export const ISSUE_CATEGORY: Record<IssueCategory, string> = {
  seguranca: 'Segurança',
  material: 'Material',
  equipamento: 'Equipamento',
  acesso: 'Acesso à obra',
  outro: 'Outro',
}

export const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']
export const TROUSER_SIZES = ['36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56']
export const BOOT_SIZES = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48']
export const GLOVE_SIZES = ['7', '8', '9', '10', '11']
