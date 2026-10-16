import { SearchX } from 'lucide-react'
import type { ComponentType } from 'react'
import { createBrowserRouter, Link, Navigate, useRouteError, type RouteObject } from 'react-router'
import type { Role } from '@/domain/types'
import { buttonStyles } from '@/ui/Button'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { AppShell } from './AppShell'
import { RoleGate } from './RoleGate'

/**
 * Cada módulo é carregado à parte com o `lazy` do router: enquanto carrega,
 * a navegação fica em "loading" e o AppShell mostra a barra de progresso
 * (em vez de a página antiga ficar parada sem indicação).
 */
function lazyPage<T>(loader: () => Promise<T>, name: keyof T, roles?: Role[]): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => {
      const C = (await loader())[name] as unknown as ComponentType
      return { Component: roles ? () => <RoleGate roles={roles}><C /></RoleGate> : C }
    },
  }
}

const G: Role[] = ['gestor']
const E: Role[] = ['encarregado']

function RouteError() {
  const err = useRouteError()
  return <ErrorState title="Algo correu mal neste ecrã">{err instanceof Error ? err.message : 'Erro inesperado.'} Recarregue a página ou reponha a demonstração.</ErrorState>
}

function NotFound() {
  return (
    <EmptyState
      icon={<SearchX />}
      title="Página não encontrada"
      action={
        <Link to="/" className={buttonStyles('primary')}>
          Ir para o centro de operações
        </Link>
      }
    >
      O endereço não corresponde a nenhum ecrã do Andaime.
    </EmptyState>
  )
}

export const router = createBrowserRouter([
  { path: '/app', ...lazyPage(() => import('@/features/worker-app/WorkerRoute'), 'WorkerRoute'), errorElement: <RouteError />, hydrateFallbackElement: <SkeletonRows /> },
  { path: '/app/:tab', ...lazyPage(() => import('@/features/worker-app/WorkerRoute'), 'WorkerRoute'), errorElement: <RouteError />, hydrateFallbackElement: <SkeletonRows /> },
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <SkeletonRows rows={8} />,
    children: [
      { index: true, ...lazyPage(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage', G) },
      { path: 'planeamento', ...lazyPage(() => import('@/features/planning/PlanningPage'), 'PlanningPage', G) },
      { path: 'trabalhadores', ...lazyPage(() => import('@/features/workers/WorkersPage'), 'WorkersPage', G) },
      { path: 'trabalhadores/:id', ...lazyPage(() => import('@/features/workers/WorkerDetailPage'), 'WorkerDetailPage', G) },
      { path: 'equipas', ...lazyPage(() => import('@/features/teams/TeamsPage'), 'TeamsPage', G) },
      { path: 'equipas/:id', ...lazyPage(() => import('@/features/teams/TeamDetailPage'), 'TeamDetailPage', G) },
      { path: 'obras', ...lazyPage(() => import('@/features/sites/SitesPage'), 'SitesPage', G) },
      { path: 'obras/nova', ...lazyPage(() => import('@/features/sites/NewSitePage'), 'NewSitePage', G) },
      { path: 'obras/:id', ...lazyPage(() => import('@/features/sites/SiteDetailPage'), 'SiteDetailPage', G) },
      { path: 'viaturas', ...lazyPage(() => import('@/features/vehicles/VehiclesPage'), 'VehiclesPage', G) },
      { path: 'viaturas/:id', ...lazyPage(() => import('@/features/vehicles/VehicleDetailPage'), 'VehicleDetailPage', G) },
      { path: 'horas', ...lazyPage(() => import('@/features/timesheets/TimesheetsPage'), 'TimesheetsPage', G) },
      { path: 'ausencias', ...lazyPage(() => import('@/features/absences/AbsencesPage'), 'AbsencesPage', G) },
      { path: 'mapas', ...lazyPage(() => import('@/features/weekly-maps/WeeklyMapsPage'), 'WeeklyMapsPage', G) },
      { path: 'documentos', ...lazyPage(() => import('@/features/documents/DocumentsPage'), 'DocumentsPage', G) },
      { path: 'equipamentos', ...lazyPage(() => import('@/features/equipment/EquipmentPage'), 'EquipmentPage', G) },
      { path: 'mapa', ...lazyPage(() => import('@/features/geo-map/GeoMapPage'), 'GeoMapPage', G) },
      { path: 'relatorios', ...lazyPage(() => import('@/features/reports/ReportsPage'), 'ReportsPage', G) },
      { path: 'definicoes', ...lazyPage(() => import('@/features/settings/SettingsPage'), 'SettingsPage') },
      { path: 'design', ...lazyPage(() => import('@/features/design/DesignPage'), 'DesignPage') },
      { path: 'encarregado', ...lazyPage(() => import('@/features/foreman/ForemanPages'), 'ForemanToday', E) },
      { path: 'encarregado/semana', ...lazyPage(() => import('@/features/foreman/ForemanPages'), 'ForemanWeek', E) },
      { path: 'encarregado/horas', ...lazyPage(() => import('@/features/foreman/ForemanPages'), 'ForemanHours', E) },
      { path: 'encarregado/documentos', ...lazyPage(() => import('@/features/foreman/ForemanPages'), 'ForemanDocs', E) },
      { path: 'encarregado/problemas', ...lazyPage(() => import('@/features/foreman/ForemanPages'), 'ForemanIssues', E) },
      { path: 'inicio', element: <Navigate to="/" replace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
