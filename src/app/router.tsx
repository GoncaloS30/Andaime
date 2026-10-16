import { lazy, type ComponentType } from 'react'
import { createBrowserRouter, Navigate, useRouteError } from 'react-router'
import { ErrorState, EmptyState } from '@/ui/States'
import { AppShell } from './AppShell'
import { RoleGate } from './RoleGate'
import { SearchX } from 'lucide-react'
import { Link } from 'react-router'
import { buttonStyles } from '@/ui/Button'

/** Carrega cada módulo à parte (code splitting por página). */
function page<T>(loader: () => Promise<T>, name: keyof T) {
  return lazy(async () => ({ default: (await loader())[name] as unknown as ComponentType }))
}

const DashboardPage = page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage')
const PlanningPage = page(() => import('@/features/planning/PlanningPage'), 'PlanningPage')
const WorkersPage = page(() => import('@/features/workers/WorkersPage'), 'WorkersPage')
const WorkerDetailPage = page(() => import('@/features/workers/WorkerDetailPage'), 'WorkerDetailPage')
const TeamsPage = page(() => import('@/features/teams/TeamsPage'), 'TeamsPage')
const TeamDetailPage = page(() => import('@/features/teams/TeamDetailPage'), 'TeamDetailPage')
const SitesPage = page(() => import('@/features/sites/SitesPage'), 'SitesPage')
const SiteDetailPage = page(() => import('@/features/sites/SiteDetailPage'), 'SiteDetailPage')
const NewSitePage = page(() => import('@/features/sites/NewSitePage'), 'NewSitePage')
const VehiclesPage = page(() => import('@/features/vehicles/VehiclesPage'), 'VehiclesPage')
const VehicleDetailPage = page(() => import('@/features/vehicles/VehicleDetailPage'), 'VehicleDetailPage')

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

const gestor = (el: React.ReactNode) => <RoleGate roles={['gestor']}>{el}</RoleGate>

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: gestor(<DashboardPage />) },
      { path: 'planeamento', element: gestor(<PlanningPage />) },
      { path: 'trabalhadores', element: gestor(<WorkersPage />) },
      { path: 'trabalhadores/:id', element: gestor(<WorkerDetailPage />) },
      { path: 'equipas', element: gestor(<TeamsPage />) },
      { path: 'equipas/:id', element: gestor(<TeamDetailPage />) },
      { path: 'obras', element: gestor(<SitesPage />) },
      { path: 'obras/nova', element: gestor(<NewSitePage />) },
      { path: 'obras/:id', element: gestor(<SiteDetailPage />) },
      { path: 'viaturas', element: gestor(<VehiclesPage />) },
      { path: 'viaturas/:id', element: gestor(<VehicleDetailPage />) },
      { path: 'inicio', element: <Navigate to="/" replace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
