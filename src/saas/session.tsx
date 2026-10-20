import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { ErrorState, SkeletonRows } from '@/ui/States'
import { keys, useMe } from './api/hooks'
import { onUnauthorized } from './api/http'
import { experienceOf, type Experience, type Me, type OrgRole } from './api/types'

export interface ActiveOrg {
  id: string
  name: string
  role: OrgRole
  experience: Experience
  /** Acesso de suporte só de leitura, até esta hora. */
  supportUntil: string | null
}

/** Empresa ativa: a preferência guardada no servidor, se ainda for membro; senão a primeira. */
export function activeOrgOf(me: Me): ActiveOrg | null {
  const membership = me.memberships.find((m) => m.orgId === me.activeOrgId) ?? me.memberships[0]
  if (!membership) return null
  return {
    id: membership.orgId,
    name: membership.orgName,
    role: membership.role,
    experience: experienceOf(membership.role),
    supportUntil: membership.supportUntil ?? null,
  }
}

/**
 * O utilizador autenticado é passado por contexto a partir de <RequireAuth>. Assim, ao sair
 * (cache limpo), os componentes ainda montados nunca leem um utilizador inexistente: o
 * RequireAuth redireciona e desmonta-os.
 */
const SessionContext = createContext<Me | null>(null)

/** Utilizador e empresa ativa; só usar dentro de <RequireAuth>/<RequireOrg>. */
export function useSession() {
  const me = useContext(SessionContext)
  if (!me) throw new Error('useSession fora de uma rota autenticada')
  return { me, org: activeOrgOf(me) }
}

export function useActiveOrg(): ActiveOrg {
  const { org } = useSession()
  if (!org) throw new Error('useActiveOrg sem empresa ativa')
  return org
}

/** Sessão expirada a meio: limpa os dados em cache e volta ao ecrã de entrada. */
export function SessionWatcher({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  useEffect(
    () =>
      onUnauthorized(() => {
        qc.clear()
        qc.setQueryData(keys.me, null)
      }),
    [qc],
  )
  return <>{children}</>
}

function Loading() {
  return (
    <div className="mx-auto w-full max-w-md pt-24">
      <SkeletonRows rows={4} />
    </div>
  )
}

/** Exige sessão; sem sessão vai para /entrar e regressa depois. */
export function RequireAuth() {
  const me = useMe()
  const location = useLocation()
  if (me.isPending) return <Loading />
  if (me.isError) return <ErrorState onRetry={() => void me.refetch()}>Não foi possível contactar o servidor do Andaime.</ErrorState>
  if (!me.data) {
    const next = location.pathname + location.search
    return <Navigate to={next === '/' ? '/entrar' : `/entrar?next=${encodeURIComponent(next)}`} replace />
  }
  return (
    <SessionContext.Provider value={me.data}>
      <Outlet />
    </SessionContext.Provider>
  )
}

/** Exige uma empresa; sem nenhuma membership vai para o onboarding. */
export function RequireOrg() {
  const { org } = useSession()
  if (!org) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

/** Redireciona cada experiência para a sua área inicial. */
export function homeOf(experience: Experience): string {
  return experience === 'encarregado' ? '/encarregado' : experience === 'trabalhador' ? '/app' : '/'
}

/** Só deixa passar a experiência indicada; as outras vão para a sua página inicial. */
export function ExperienceGate({ allow, children }: { allow: Experience[]; children: ReactNode }) {
  const org = useActiveOrg()
  if (!allow.includes(org.experience)) return <Navigate to={homeOf(org.experience)} replace />
  return <>{children}</>
}

/** Só para quem já tem sessão: os ecrãs de entrada/registo mandam-no para dentro. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const me = useMe()
  const location = useLocation()
  if (me.isPending) return <Loading />
  if (me.data) {
    const next = new URLSearchParams(location.search).get('next')
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />
  }
  return <>{children}</>
}
