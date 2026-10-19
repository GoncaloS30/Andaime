import { Building2, Check, ChevronsUpDown, LogOut, Menu as MenuIcon, Plus, Settings, ShieldCheck, UserRound } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useNavigation } from 'react-router'
import { toast } from 'sonner'
import { ENCARREGADO_NAV, GESTOR_MOBILE, GESTOR_NAV, type NavGroup, type NavItem } from '@/app/nav'
import { LogoMark, Wordmark } from '@/app/shell/Logo'
import { cn } from '@/lib/cn'
import { Avatar } from '@/ui/Avatar'
import { Menu } from '@/ui/Menu'
import { NotificationBell } from './NotificationBell'
import { Drawer } from '@/ui/Overlay'
import { SkeletonRows } from '@/ui/States'
import { useLogout, useSelectOrganization } from '../api/hooks'
import { errorMessage } from '../api/http'
import { atLeast, ORG_ROLE_LABEL } from '../api/types'
import { useActiveOrg, useSession } from '../session'

function navFor(experience: 'gestor' | 'encarregado' | 'trabalhador'): NavGroup[] {
  return experience === 'encarregado' ? ENCARREGADO_NAV : GESTOR_NAV
}

function RouteProgress() {
  const loading = useNavigation().state === 'loading'
  if (!loading) return null
  return (
    <div role="status" aria-label="A carregar" className="fixed inset-x-0 top-0 z-[80] h-0.5 overflow-hidden bg-lima-soft">
      <div className="h-full w-1/3 animate-[progress_1.1s_var(--ease-andaime)_infinite] bg-pinho motion-reduce:w-full motion-reduce:animate-none" />
    </div>
  )
}

/** Troca de empresa: só para quem pertence a mais do que uma (ou quer criar outra). */
function OrganizationSwitcher({ onDark }: { onDark?: boolean }) {
  const { me } = useSession()
  const org = useActiveOrg()
  const select = useSelectOrganization()
  const navigate = useNavigate()
  const items = [
    { heading: 'Empresas' },
    ...me.memberships.map((m) => ({
      label: m.orgName,
      hint: ORG_ROLE_LABEL[m.role],
      icon: m.orgId === org.id ? <Check className="size-4" /> : <Building2 className="size-4" />,
      onSelect: () => {
        if (m.orgId === org.id) return
        select.mutate(m.orgId, {
          onSuccess: () => {
            navigate('/', { replace: true })
            toast.success(`A trabalhar em ${m.orgName}`)
          },
          onError: (error) => toast.error(errorMessage(error)),
        })
      },
    })),
    'separator' as const,
    { label: 'Criar outra empresa', icon: <Plus className="size-4" />, onSelect: () => navigate('/onboarding') },
  ]
  return (
    <Menu
      align="start"
      items={items}
      trigger={
        <button
          type="button"
          className={cn(
            'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left',
            onDark ? 'hover:bg-white/8' : 'border border-line bg-surface hover:border-ink-4',
          )}
          aria-label={`Empresa: ${org.name}. Mudar de empresa`}
        >
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate text-xs font-medium', onDark ? 'text-white/85' : 'text-ink')}>{org.name}</span>
            <span className={cn('block text-[11px]', onDark ? 'text-white/60' : 'text-ink-3')}>{ORG_ROLE_LABEL[org.role]}</span>
          </span>
          <ChevronsUpDown className={cn('size-4 shrink-0', onDark ? 'text-white/60' : 'text-ink-3')} aria-hidden />
        </button>
      }
    />
  )
}

/** `expanded`: rótulos sempre visíveis (menu do telemóvel); senão só a partir de lg. */
function NavList({ groups, onNavigate, expanded }: { groups: NavGroup[]; onNavigate?: () => void; expanded?: boolean }) {
  const label = expanded ? 'inline' : 'hidden lg:inline'
  return (
    <>
      {groups.map((g, gi) => (
        <div key={gi} className="mt-3 first:mt-1">
          {g.pillar && (
            <p className={cn('mb-1 px-2.5 text-[10px] font-semibold tracking-[0.14em] text-white/60 uppercase', expanded ? 'block' : 'hidden lg:block')}>{g.pillar}</p>
          )}
          {g.pillar && !expanded && <div aria-hidden className="mx-3 mb-1.5 h-px bg-white/10 lg:hidden" />}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item: NavItem) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-(--duration-fast)',
                      expanded ? 'justify-start' : 'justify-center lg:justify-start',
                      isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/6 hover:text-white',
                      isActive && 'before:absolute before:top-2 before:bottom-2 before:-left-2 before:w-[3px] before:rounded-r-full before:bg-lima',
                    )
                  }
                >
                  <item.icon aria-hidden className="size-4.5 shrink-0" strokeWidth={1.9} />
                  <span className={cn('truncate', label)}>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

function Sidebar() {
  const { me } = useSession()
  const org = useActiveOrg()
  return (
    <aside aria-label="Navegação principal" className="on-dark sticky top-0 hidden h-dvh w-16 shrink-0 flex-col bg-pinho text-white md:flex lg:w-60">
      <div className="flex h-14 shrink-0 items-center px-3.5 lg:px-4">
        <span className="hidden lg:block">
          <Wordmark onDark />
        </span>
        <span className="lg:hidden">
          <LogoMark />
        </span>
      </div>
      <div className="hidden px-2 pb-2 lg:block">
        <OrganizationSwitcher onDark />
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 [scrollbar-width:thin]">
        <NavList groups={navFor(org.experience)} />
      </nav>
      <div className="hidden border-t border-white/10 p-3 lg:block">
        <div className="flex items-center gap-2.5">
          <Avatar name={me.user.displayName} color="#24543f" size="sm" className="ring-1 ring-white/20" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{me.user.displayName}</p>
            <p className="truncate text-xs text-white/60">{me.user.email}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

function UserMenu() {
  const { me } = useSession()
  const org = useActiveOrg()
  const navigate = useNavigate()
  const logout = useLogout()
  const items = [
    { heading: me.user.email },
    { label: 'A minha conta', icon: <UserRound className="size-4" />, onSelect: () => navigate('/definicoes/conta') },
    ...(atLeast(org.role, 'MANAGER') ? [{ label: 'Definições da empresa', icon: <Settings className="size-4" />, onSelect: () => navigate('/definicoes') }] : []),
    ...(me.platformAdmin ? [{ label: 'Administração da plataforma', icon: <ShieldCheck className="size-4" />, onSelect: () => navigate('/plataforma') }] : []),
    'separator' as const,
    {
      label: 'Sair',
      icon: <LogOut className="size-4" />,
      onSelect: () => logout.mutate(undefined, { onSettled: () => navigate('/entrar', { replace: true }) }),
    },
  ]
  return (
    <Menu
      items={items}
      trigger={
        <button type="button" className="rounded-full focus-visible:ring-2 focus-visible:ring-pinho/30" aria-label={`Conta de ${me.user.displayName}`}>
          <Avatar name={me.user.displayName} color="#24543f" size="sm" />
        </button>
      }
    />
  )
}

function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-cal/90 px-3 backdrop-blur-sm sm:px-4 lg:px-6">
      <span className="min-w-0 md:hidden">
        <Wordmark />
      </span>
      <div className="hidden min-w-0 max-w-xs md:block lg:hidden">
        <OrganizationSwitcher />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  )
}

function MobileNav() {
  const org = useActiveOrg()
  const [more, setMore] = useState(false)
  const groups = navFor(org.experience)
  const items = org.experience === 'encarregado' ? ENCARREGADO_NAV[0]!.items.slice(0, 4) : GESTOR_MOBILE
  return (
    <>
      <nav aria-label="Navegação" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => cn('relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-pinho' : 'text-ink-3')}
          >
            {({ isActive }) => (
              <>
                {isActive && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-b-full bg-pinho" />}
                <it.icon className="size-5" aria-hidden strokeWidth={isActive ? 2.2 : 1.8} />
                {it.label}
              </>
            )}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMore(true)} className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-ink-3">
          <MenuIcon className="size-5" aria-hidden />
          Mais
        </button>
      </nav>
      <Drawer open={more} onOpenChange={setMore} title="Menu" size="sm">
        <div className="mb-3">
          <OrganizationSwitcher />
        </div>
        <div className="on-dark rounded-md bg-pinho p-2">
          <NavList groups={groups} expanded onNavigate={() => setMore(false)} />
        </div>
      </Drawer>
    </>
  )
}

/** Layout autenticado do backoffice (gestor e encarregado). */
export function SaasShell() {
  const location = useLocation()
  const loading = useNavigation().state === 'loading'
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    document.getElementById('conteudo')?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="flex min-h-dvh">
      <a href="#conteudo" className="sr-only z-50 rounded-md bg-pinho px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Saltar para o conteúdo
      </a>
      <RouteProgress />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="conteudo" tabIndex={-1} aria-busy={loading || undefined} className="flex-1 px-4 pt-5 pb-28 focus:outline-none sm:px-5 md:pb-10 lg:px-7">
          <Suspense fallback={<SkeletonRows rows={8} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}

