import { lazy, type ComponentType } from 'react'
import { createBrowserRouter, Navigate, useRouteError } from 'react-router'
import { ErrorState, EmptyState } from '@/ui/States'
import { AppShell } from './AppShell'
import { RoleGate } from './RoleGate'
import { SearchX } from 'lucide-react'
import { Link } from 'react-router'
import { buttonStyles } from '@/ui/Button'

/** Carrega cada módulo à parte (code splitting por página). */
function page<T extends Record<string, ComponentType>>(loader: () => Promise<T>, name: keyof T) {
  return lazy(async () => ({ default: (await loader())[name] as ComponentType }))
}

const DashboardPage = page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage')
const PlanningPage = page(() => import('@/features/planning/PlanningPage'), 'PlanningPage')

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
      { path: 'inicio', element: <Navigate to="/" replace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
