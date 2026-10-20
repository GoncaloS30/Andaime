import type { ReactElement } from 'react'
import { createBrowserRouter, Navigate, Outlet, useRouteError, type RouteObject } from 'react-router'
import { Wordmark } from '@/app/shell/Logo'
import { ErrorState } from '@/ui/States'
import { AccountSections, AccountPage, AuditPage, OrganizationSettingsPage, TeamAccessPage } from './pages/settings/SettingsPages'
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from './pages/auth/AuthPages'
import { InvitePage, OnboardingPage } from './pages/auth/OnboardingPages'
import { ManagerHome, MODULES, ModuleUnavailable, NotFoundPage, WorkerHome } from './pages/HomePages'
import { ClientsPage, ForemanHomePage, ForemanIssuesPage, GeoMapPage } from './pages/sites/MorePages'
import { NewSitePage, SiteDetailPage, SitesPage } from './pages/sites/SitesPages'
import { TeamDetailPage, TeamsPage } from './pages/workforce/TeamsPages'
import { WorkerDetailPage, WorkersPage } from './pages/workforce/WorkersPages'
import { PlatformPage } from './pages/PlatformPage'
import { RulesPage } from './pages/settings/RulesPage'
import { ReportsPage } from './pages/reporting/ReportsPage'
import { WeeklyMapsPage } from './pages/reporting/WeeklyMapsPage'
import { VehicleDetailPage, VehiclesPage } from './pages/fleet/VehiclesPages'
import { PlanningPage } from './pages/planning/PlanningPage'
import { TimesheetsPage } from './pages/timekeeping/TimesheetsPage'
import { AbsencesPage } from './pages/operations/AbsencesPage'
import { DocumentsPage } from './pages/operations/DocumentsPage'
import { EquipmentPage } from './pages/operations/EquipmentPage'
import { ExperienceGate, RedirectIfAuthenticated, RequireAuth, RequireOrg } from './session'
import { SaasShell } from './shell/SaasShell'

function RouteError() {
  const error = useRouteError()
  return <ErrorState title="Algo correu mal neste ecrã">{error instanceof Error ? error.message : 'Erro inesperado.'} Recarregue a página.</ErrorState>
}

const publicOnly = (element: ReactElement): RouteObject['element'] => <RedirectIfAuthenticated>{element}</RedirectIfAuthenticated>

/** Conta do trabalhador fora do backoffice (layout de telemóvel). */
function WorkerAccount() {
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-cal px-4 pt-5 pb-10">
      <Wordmark />
      <main id="conteudo" className="mt-6">
        <h1 className="mb-4 font-expanded text-xl font-semibold text-ink">A minha conta</h1>
        <AccountSections />
      </main>
    </div>
  )
}

const gestor = (element: ReactElement) => <ExperienceGate allow={['gestor']}>{element}</ExperienceGate>
const encarregado = (element: ReactElement) => <ExperienceGate allow={['encarregado']}>{element}</ExperienceGate>
/** Gestor e encarregado: o servidor limita o encarregado às suas equipas e obras. */
const both = (element: ReactElement) => <ExperienceGate allow={['gestor', 'encarregado']}>{element}</ExperienceGate>

export const router = createBrowserRouter([
  { path: '/entrar', element: publicOnly(<LoginPage />) },
  { path: '/registar', element: publicOnly(<SignupPage />) },
  { path: '/recuperar', element: publicOnly(<ForgotPasswordPage />) },
  { path: '/verificar-email', element: <VerifyEmailPage /> },
  { path: '/repor-palavra-passe', element: <ResetPasswordPage /> },
  { path: '/convite/:token', element: <InvitePage /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      { path: '/onboarding', element: <OnboardingPage /> },
      {
        element: <RequireOrg />,
        children: [
          {
            path: '/app',
            element: (
              <ExperienceGate allow={['trabalhador']}>
                <Outlet />
              </ExperienceGate>
            ),
            children: [
              { index: true, element: <WorkerHome /> },
              { path: 'conta', element: <WorkerAccount /> },
              { path: '*', element: <Navigate to="/app" replace /> },
            ],
          },
          {
            element: (
              <ExperienceGate allow={['gestor', 'encarregado']}>
                <SaasShell />
              </ExperienceGate>
            ),
            errorElement: <RouteError />,
            children: [
              { index: true, element: gestor(<ManagerHome />) },
              { path: 'encarregado', element: encarregado(<ForemanHomePage />) },
              { path: 'encarregado/problemas', element: encarregado(<ForemanIssuesPage />) },
              { path: 'trabalhadores', element: both(<WorkersPage />) },
              { path: 'trabalhadores/:id', element: both(<WorkerDetailPage />) },
              { path: 'equipas', element: both(<TeamsPage />) },
              { path: 'equipas/:id', element: both(<TeamDetailPage />) },
              { path: 'obras', element: both(<SitesPage />) },
              { path: 'obras/nova', element: gestor(<NewSitePage />) },
              { path: 'obras/clientes', element: gestor(<ClientsPage />) },
              { path: 'obras/:id', element: both(<SiteDetailPage />) },
              { path: 'mapa', element: gestor(<GeoMapPage />) },
              { path: 'planeamento', element: gestor(<PlanningPage />) },
              { path: 'encarregado/semana', element: encarregado(<PlanningPage readOnlyView />) },
              { path: 'horas', element: gestor(<TimesheetsPage />) },
              { path: 'ausencias', element: gestor(<AbsencesPage />) },
              { path: 'documentos', element: gestor(<DocumentsPage />) },
              { path: 'encarregado/documentos', element: encarregado(<DocumentsPage />) },
              { path: 'equipamentos', element: gestor(<EquipmentPage />) },
              { path: 'mapas', element: gestor(<WeeklyMapsPage />) },
              { path: 'relatorios', element: gestor(<ReportsPage />) },
              { path: 'encarregado/horas', element: encarregado(<TimesheetsPage />) },
              { path: 'viaturas', element: both(<VehiclesPage />) },
              { path: 'viaturas/:id', element: both(<VehicleDetailPage />) },
              ...MODULES.map((m) => ({
                path: m.path.slice(1),
                element: (m.path.startsWith('/encarregado') ? encarregado : gestor)(<ModuleUnavailable label={m.label} phase={m.phase} />),
              })),
              ...MODULES.filter((m) => !m.path.startsWith('/encarregado')).map((m) => ({
                path: `${m.path.slice(1)}/*`,
                element: gestor(<ModuleUnavailable label={m.label} phase={m.phase} />),
              })),
              { path: 'definicoes', element: <OrganizationSettingsPage /> },
              { path: 'definicoes/equipa', element: <TeamAccessPage /> },
              { path: 'definicoes/conta', element: <AccountPage /> },
              { path: 'definicoes/auditoria', element: <AuditPage /> },
              { path: 'definicoes/regras', element: <RulesPage /> },
              { path: 'plataforma', element: <PlatformPage /> },
              { path: 'inicio', element: <Navigate to="/" replace /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
])
