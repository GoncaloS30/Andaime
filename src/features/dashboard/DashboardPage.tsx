import { Building2, CalendarPlus, ClipboardCheck, LayoutDashboard, Palmtree, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { useDerived } from '@/app/hooks'
import { ModuleGuard } from '@/app/ModuleGuard'
import { formatHours } from '@/domain/hours'
import { dateLong, isoWeek } from '@/domain/weeks'
import { plural } from '@/lib/plural'
import { selectConflicts, selectDashboard } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { buttonStyles } from '@/ui/Button'
import { KpiStrip, type KpiItem } from '@/ui/Kpi'
import { PageHeader, Panel } from '@/ui/Layout'
import { ActivityList } from '../shared/ActivityList'
import { ConflictCard } from '../shared/ConflictCard'
import { FieldWeek } from './FieldWeek'
import { PendingPanel } from './PendingPanel'
import { SitesHours } from './SitesHours'
import { LatestDiary } from './LatestDiary'
import { LateSitesPanel } from './LateSitesPanel'
import { LodgingPanel } from './LodgingPanel'

export function DashboardPage() {
  const today = useDemo((s) => s.session.today)
  const activity = useDemo((s) => s.db.activity)
  const k = useDerived(selectDashboard)
  const conflicts = useDerived((s) => selectConflicts(s))

  const items: KpiItem[] = [
    { label: 'Trabalhadores ativos', value: k.activeWorkers, sub: `${k.workingToday} escalados hoje · ${k.clockedNow} com entrada`, to: '/trabalhadores' },
    { label: 'Disponíveis hoje', value: k.availableToday, sub: plural(k.absentToday, 'ausente', 'ausentes'), to: '/trabalhadores?disponibilidade=livre', tour: 'kpi-available' },
    { label: 'Obras em curso', value: k.sitesInProgress, sub: `${k.sitesAbroad} no estrangeiro · ${k.sitesAtRisk} em risco`, to: '/obras', tone: k.sitesAtRisk ? 'warn' : undefined, tour: 'kpi-sites' },
    { label: 'Equipas destacadas', value: k.teamsAbroad, sub: `no estrangeiro · ${k.teamsActive} equipas ativas`, to: '/equipas' },
    { label: 'Planeadas na semana', value: k.plannedWeek, format: (n) => formatHours(Math.round(n)), sub: `Semana ${isoWeek(today)}`, to: '/planeamento' },
    { label: 'Realizadas na semana', value: k.realizedWeek, format: (n) => formatHours(Math.round(n)), sub: 'registadas e submetidas', to: '/horas' },
    { label: 'Folhas por aprovar', value: k.pendingApprovals, sub: `${plural(k.pendingApprovalEntries, 'registo', 'registos')} · ${plural(k.pendingReviews, 'folha', 'folhas')} por rever`, to: '/horas?estado=revisto', tone: k.pendingApprovals ? 'warn' : undefined, tour: 'kpi-approvals' },
    { label: 'Viaturas indisponíveis', value: k.vehiclesUnavailable, sub: 'oficina ou papéis caducados', to: '/viaturas?estado=indisponivel', tone: k.vehiclesUnavailable ? 'danger' : undefined },
    { label: 'Documentos a tratar', value: k.docsAttention, sub: plural(k.docsExpired, 'expirado', 'expirados'), to: '/documentos?estado=atencao', tone: k.docsExpired ? 'danger' : k.docsAttention ? 'warn' : undefined, tour: 'kpi-documents' },
    { label: 'Conflitos de planeamento', value: k.conflicts, sub: `${k.conflictsCritical} críticos · 2 semanas`, to: '/planeamento?painel=conflitos', tone: k.conflictsCritical ? 'danger' : k.conflicts ? 'warn' : 'ok', tour: 'kpi-conflicts' },
  ]

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        eyebrow={`${dateLong(today)} · semana ${isoWeek(today)}`}
        title="Centro de operações"
        actions={
          <>
            <Link to="/obras/nova" className={buttonStyles('secondary')}>
              <Building2 className="size-4" aria-hidden /> Nova obra
            </Link>
            <Link to="/planeamento?nova=escala" className={buttonStyles('primary')} data-tour="new-schedule">
              <CalendarPlus className="size-4" aria-hidden /> Nova escala
            </Link>
          </>
        }
      />
      <ModuleGuard
        empty={{
          icon: <LayoutDashboard />,
          title: 'Ainda não há operação para mostrar',
          text: 'Crie a primeira obra e a primeira equipa. Os indicadores enchem-se à medida que planeia e regista horas.',
          action: (
            <Link to="/obras/nova" className={buttonStyles('primary')}>
              <Plus className="size-4" aria-hidden /> Criar obra
            </Link>
          ),
        }}
      >
        <KpiStrip items={items} className="mb-5" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <SitesHours />
            <FieldWeek />
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <Panel
              id="alertas"
              title="Alertas"
              description={conflicts.length ? `${conflicts.length} conflitos nas próximas duas semanas` : 'Sem conflitos'}
              actions={
                <Link to="/planeamento?painel=conflitos" className={buttonStyles('ghost', 'sm')}>
                  Ver todos
                </Link>
              }
              bodyClassName="flex flex-col gap-2"
            >
              {conflicts.length === 0 && <p className="text-sm text-ink-3">O planeamento das próximas duas semanas não tem conflitos.</p>}
              {conflicts.slice(0, 4).map((c) => (
                <ConflictCard key={c.id} conflict={c} compact />
              ))}
              {conflicts.length > 4 && (
                <Link to="/planeamento?painel=conflitos" className="text-sm font-medium text-pinho hover:underline">
                  + {conflicts.length - 4} conflitos no planeamento
                </Link>
              )}
            </Panel>
            <PendingPanel />
            <LateSitesPanel />
            <LodgingPanel />
            <LatestDiary />
            <Panel title="Atividade recente" id="atividade">
              <ActivityList events={activity} limit={8} />
            </Panel>
            <Panel title="Ações rápidas" bodyClassName="grid grid-cols-2 gap-2">
              <Link to="/horas?estado=revisto" className={buttonStyles('secondary', 'md', 'justify-start')}>
                <ClipboardCheck className="size-4" aria-hidden /> Aprovar horas
              </Link>
              <Link to="/ausencias?estado=pedido" className={buttonStyles('secondary', 'md', 'justify-start')}>
                <Palmtree className="size-4" aria-hidden /> Pedidos
              </Link>
              <Link to="/mapas" className={buttonStyles('secondary', 'md', 'justify-start')}>
                Mapa semanal
              </Link>
              <Link to="/relatorios" className={buttonStyles('secondary', 'md', 'justify-start')}>
                Relatórios
              </Link>
            </Panel>
          </div>
        </div>
      </ModuleGuard>
    </div>
  )
}
