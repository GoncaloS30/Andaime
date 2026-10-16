import {
  BarChart3,
  Building2,
  CalendarRange,
  ClipboardCheck,
  FileCheck2,
  FileSpreadsheet,
  HardHat,
  LayoutDashboard,
  MessageSquareWarning,
  Map,
  Palmtree,
  Shirt,
  Truck,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: 'conflicts' | 'approvals' | 'absences' | 'documents'
  end?: boolean
}

export interface NavGroup {
  pillar: string
  items: NavItem[]
}

/** Navegação do gestor organizada pelos quatro pilares do produto. */
export const GESTOR_NAV: NavGroup[] = [
  { pillar: '', items: [{ to: '/', label: 'Centro de operações', icon: LayoutDashboard, end: true }] },
  {
    pillar: 'Planeamento',
    items: [
      { to: '/planeamento', label: 'Planeamento', icon: CalendarRange, badge: 'conflicts' },
      { to: '/equipas', label: 'Equipas', icon: UsersRound },
      { to: '/trabalhadores', label: 'Trabalhadores', icon: Users },
      { to: '/obras', label: 'Obras', icon: Building2 },
      { to: '/viaturas', label: 'Viaturas', icon: Truck },
    ],
  },
  {
    pillar: 'Execução',
    items: [
      { to: '/horas', label: 'Horas e aprovações', icon: ClipboardCheck, badge: 'approvals' },
      { to: '/ausencias', label: 'Ausências', icon: Palmtree, badge: 'absences' },
      { to: '/mapas', label: 'Mapas semanais', icon: FileSpreadsheet },
    ],
  },
  {
    pillar: 'Controlo',
    items: [
      { to: '/documentos', label: 'Documentos', icon: FileCheck2, badge: 'documents' },
      { to: '/equipamentos', label: 'Fardamento e EPI', icon: Shirt },
      { to: '/mapa', label: 'Mapa de obras', icon: Map },
    ],
  },
  { pillar: 'Análise', items: [{ to: '/relatorios', label: 'Relatórios', icon: BarChart3 }] },
]

export const ENCARREGADO_NAV: NavGroup[] = [
  {
    pillar: '',
    items: [
      { to: '/encarregado', label: 'Hoje', icon: HardHat, end: true },
      { to: '/encarregado/semana', label: 'Escala da semana', icon: CalendarRange },
      { to: '/encarregado/horas', label: 'Horas da equipa', icon: ClipboardCheck, badge: 'approvals' },
      { to: '/encarregado/documentos', label: 'Documentação', icon: FileCheck2 },
      { to: '/encarregado/problemas', label: 'Problemas', icon: MessageSquareWarning },
    ],
  },
]

/** Atalhos da barra inferior em telemóvel (gestor). */
export const GESTOR_MOBILE: NavItem[] = [
  { to: '/', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/planeamento', label: 'Planear', icon: CalendarRange, badge: 'conflicts' },
  { to: '/horas', label: 'Horas', icon: ClipboardCheck, badge: 'approvals' },
  { to: '/obras', label: 'Obras', icon: Building2 },
]
