import { CheckCircle2, Circle, LogOut, PlugZap, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Wordmark } from '@/app/shell/Logo'
import { Badge } from '@/ui/Badge'
import { Button, buttonStyles } from '@/ui/Button'
import { PageHeader, Panel } from '@/ui/Layout'
import { EmptyState, SkeletonRows } from '@/ui/States'
import { useLogout, useMembers } from '../api/hooks'
import { atLeast, ORG_ROLE_LABEL } from '../api/types'
import { useEmployees, useSites, useTeams } from '../api/workforce'
import { useActiveOrg, useSession } from '../session'
import { WorkerSections } from './operations/WorkerSections'
import { DelayBadge } from './sites/SitesPages'
import { MySchedule } from './timekeeping/MySchedule'
import { WorkerClock } from './timekeeping/WorkerClock'

/**
 * Estado real da ligação de cada módulo ao servidor. Enquanto um módulo não estiver ligado,
 * o ecrã diz isso mesmo, em vez de mostrar dados fictícios.
 */
export const MODULES: { path: string; label: string; phase: string }[] = [
  { path: '/dormidas', label: 'Dormidas', phase: 'depois de F6' },
  { path: '/encarregado/diario', label: 'Diário de obra', phase: 'depois de F6' },
]

const PHASE_TEXT: Record<string, string> = {
  F2: 'trabalhadores, obras e equipas',
  F3: 'planeamento e viaturas',
  F4: 'registo de horas e aprovações',
  F5: 'documentos, ausências e equipamentos',
  F6: 'mapas e relatórios',
}

/** Ecrã de um módulo que ainda não está ligado ao servidor. */
export function ModuleUnavailable({ label, phase }: { label: string; phase: string }) {
  return (
    <>
      <PageHeader title={label} />
      <Panel>
        <EmptyState
          icon={<PlugZap />}
          title="Ainda não ligado ao servidor"
          action={
            <Link to="/" className={buttonStyles('secondary')}>
              Ver o estado dos módulos
            </Link>
          }
        >
          {label} ainda não guarda dados da sua empresa.{' '}
          {PHASE_TEXT[phase] ? `Fica disponível com a ligação de ${PHASE_TEXT[phase]} (fase ${phase}).` : 'Fica disponível numa fase posterior.'} Nada do que
          vê aqui é simulado.
        </EmptyState>
      </Panel>
    </>
  )
}

function Step({ done, title, children }: { done: boolean; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3 py-3">
      {done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden /> : <Circle className="mt-0.5 size-5 shrink-0 text-ink-4" aria-hidden />}
      <div className="min-w-0">
        <p className="font-medium text-ink">
          {title}
          <span className="sr-only">{done ? ' (concluído)' : ' (por fazer)'}</span>
        </p>
        {children && <div className="mt-0.5 text-sm text-ink-3">{children}</div>}
      </div>
    </li>
  )
}

/** Página inicial do gestor: primeiros passos reais e estado de ligação dos módulos. */
export function ManagerHome() {
  const { me } = useSession()
  const org = useActiveOrg()
  const canSeeTeam = atLeast(org.role, 'MANAGER')
  const members = useMembers(org.id)
  const activeMembers = members.data?.filter((m) => m.status === 'ACTIVE').length
  const employees = useEmployees(org.id, {})
  const teams = useTeams(org.id)
  const sites = useSites(org.id)
  const counts = {
    employees: employees.data?.total ?? 0,
    teams: teams.data?.length ?? 0,
    sites: sites.data?.length ?? 0,
  }
  const late = (sites.data ?? []).filter((s) => s.delayWorkdays > 0 && !s.archived).sort((a, b) => b.delayWorkdays - a.delayWorkdays)

  return (
    <>
      <PageHeader eyebrow={org.name} title={`Olá, ${me.user.displayName.split(' ')[0]}`} description="Configure a empresa e a equipa. Os módulos operacionais vão sendo ligados ao servidor por fases." />
      {late.length > 0 && (
        <Panel className="mb-5" title="Obras atrasadas" description="A previsão de fim já passa o fim contratual.">
          <ul className="divide-y divide-line-2 px-4">
            {late.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link to={`/obras/${s.id}`} className="min-w-0 truncate text-pinho hover:underline">
                  <span className="font-mono text-xs">{s.code}</span> {s.name}
                </Link>
                <DelayBadge site={s} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Primeiros passos">
          <ol className="divide-y divide-line-2 px-4">
            <Step done title="Empresa criada">
              {org.name} · o seu papel: {ORG_ROLE_LABEL[org.role].toLowerCase()}.{' '}
              {atLeast(org.role, 'ADMIN') && (
                <Link to="/definicoes" className="text-pinho underline underline-offset-2">
                  Rever dados da empresa
                </Link>
              )}
            </Step>
            <Step done={(activeMembers ?? 0) > 1} title="Convidar a equipa">
              {members.isPending && canSeeTeam ? (
                'A contar membros…'
              ) : (
                <>
                  {activeMembers ?? 1} {activeMembers === 1 ? 'membro ativo' : 'membros ativos'}.{' '}
                  {atLeast(org.role, 'ADMIN') && (
                    <Link to="/definicoes/equipa" className="text-pinho underline underline-offset-2">
                      Convidar gestores, encarregados e trabalhadores
                    </Link>
                  )}
                </>
              )}
            </Step>
            <Step done={counts.employees > 0} title="Registar trabalhadores">
              {counts.employees > 0 ? `${counts.employees} registados. ` : ''}
              <Link to="/trabalhadores" className="text-pinho hover:underline">
                {counts.employees > 0 ? 'Ver trabalhadores' : 'Registar o primeiro trabalhador'}
              </Link>
            </Step>
            <Step done={counts.teams > 0} title="Organizar equipas">
              {counts.teams > 0 ? `${counts.teams} equipas. ` : ''}
              <Link to="/equipas" className="text-pinho hover:underline">
                {counts.teams > 0 ? 'Ver equipas' : 'Criar a primeira equipa'}
              </Link>
            </Step>
            <Step done={counts.sites > 0} title="Criar obras">
              {counts.sites > 0 ? `${counts.sites} obras. ` : ''}
              <Link to={counts.sites > 0 ? '/obras' : '/obras/nova'} className="text-pinho hover:underline">
                {counts.sites > 0 ? 'Ver obras' : 'Criar a primeira obra'}
              </Link>
            </Step>
          </ol>
        </Panel>
        <Panel title="Módulos" description="O que já guarda dados da sua empresa.">
          <ul className="divide-y divide-line-2 px-4">
            {['Contas, empresa, equipa e acessos', 'Trabalhadores e equipas', 'Obras, clientes e mapa', 'Ocorrências de obra'].map((label) => (
              <li key={label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>{label}</span>
                <Badge tone="ok" dot>
                  Ligado
                </Badge>
              </li>
            ))}
            {MODULES.filter((m) => !m.path.startsWith('/encarregado')).map((m) => (
              <li key={m.path} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-ink-2">{m.label}</span>
                <Badge tone="neutral">{m.phase.startsWith('F') ? `Fase ${m.phase}` : 'Posterior'}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  )
}

/** Área do trabalhador (telemóvel). O registo de horas chega com a fase F4. */
export function WorkerHome() {
  const { me } = useSession()
  const org = useActiveOrg()
  const logout = useLogout()
  const navigate = useNavigate()
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-cal px-4 pt-5 pb-10">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Button variant="ghost" size="sm" icon={<LogOut className="size-4" aria-hidden />} onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/entrar') })}>
          Sair
        </Button>
      </header>
      <main id="conteudo" className="mt-6 flex flex-col gap-4">
        <div>
          <p className="text-sm text-ink-3">{org.name}</p>
          <h1 className="font-expanded text-xl font-semibold text-ink">Olá, {me.user.displayName.split(' ')[0]}</h1>
        </div>
        <WorkerClock />
        <MySchedule />
        <WorkerSections />
        <Link to="/definicoes/conta" className={buttonStyles('secondary')}>
          A minha conta
        </Link>
      </main>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<SearchX />}
      title="Página não encontrada"
      action={
        <Link to="/" className={buttonStyles('primary')}>
          Ir para o início
        </Link>
      }
    >
      O endereço não corresponde a nenhum ecrã do Andaime.
    </EmptyState>
  )
}

export function PageLoading() {
  return <SkeletonRows rows={6} />
}
