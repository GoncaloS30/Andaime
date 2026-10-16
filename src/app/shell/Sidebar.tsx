import { NavLink } from 'react-router'
import { dateShort, dayShort } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { useTour } from '@/features/presentation/tourStore'
import { Avatar } from '@/ui/Avatar'
import { ENCARREGADO_NAV, GESTOR_NAV, type NavGroup, type NavItem } from '../nav'
import { Wordmark, LogoMark } from './Logo'
import { useNavBadges } from './useNavBadges'

function Badge({ item, badges }: { item: NavItem; badges: ReturnType<typeof useNavBadges> }) {
  if (!item.badge) return null
  const n = badges[item.badge]
  if (!n) return null
  const danger = item.badge === 'conflicts' && badges.conflictsCritical
  return (
    <span
      className={cn(
        'ml-auto min-w-5 rounded-sm px-1 text-center text-[11px] leading-5 font-semibold tabular',
        danger ? 'bg-tijolo text-white' : 'bg-white/12 text-white/85',
      )}
      aria-label={`${n} pendentes`}
    >
      {n}
    </span>
  )
}

export function Sidebar() {
  const role = useDemo((s) => s.session.role)
  const persona = useDemo((s) => s.session.personas[s.session.role])
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const badges = useNavBadges()
  // Com o palco da apresentação aberto, a barra recolhe para ícones para dar espaço ao conteúdo.
  const rail = useTour((t) => t.stage)
  const L = rail ? 'hidden' : 'hidden lg:block'
  const groups: NavGroup[] = role === 'encarregado' ? ENCARREGADO_NAV : GESTOR_NAV
  const who = role === 'gestor' ? db.managers[persona] : db.workers[persona]
  const title = role === 'gestor' ? db.managers[persona]?.title : db.workers[persona]?.category

  return (
    <aside
      aria-label="Navegação principal"
      className={cn('on-dark sticky top-0 hidden h-dvh shrink-0 flex-col bg-pinho text-white md:flex md:w-16', !rail && 'lg:w-60')}
    >
      <div className="flex h-14 shrink-0 items-center px-3.5 lg:px-4">
        <span className={L}>
          <Wordmark onDark />
        </span>
        <span className={rail ? '' : 'lg:hidden'}>
          <LogoMark />
        </span>
      </div>
      <div className={cn('px-4 pb-3', L)}>
        <p className="truncate text-xs font-medium text-white/80">{db.company.name}</p>
        <p className="text-[11px] text-white/60">Empresa fictícia</p>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 [scrollbar-width:thin]">
        {groups.map((g, gi) => (
          <div key={gi} className="mt-3 first:mt-1">
            {g.pillar && (
              <p className={cn('mb-1 px-2.5 text-[10px] font-semibold tracking-[0.14em] text-white/60 uppercase', L)}>
                {g.pillar}
              </p>
            )}
            {g.pillar && <div aria-hidden className={cn('mx-3 mb-1.5 h-px bg-white/10', !rail && 'lg:hidden')} />}
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    title={item.label}
                    className={({ isActive }) =>
                      cn(
                        'relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-(--duration-fast)',
                        rail ? 'justify-center' : 'justify-center lg:justify-start',
                        isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/6 hover:text-white',
                        isActive &&
                          'before:absolute before:top-2 before:bottom-2 before:-left-2 before:w-[3px] before:rounded-r-full before:bg-lima',
                      )
                    }
                  >
                    <item.icon aria-hidden className="size-4.5 shrink-0" strokeWidth={1.9} />
                    <span className={cn('truncate', rail ? 'sr-only' : 'hidden lg:inline')}>{item.label}</span>
                    <span className={rail ? 'hidden' : 'hidden lg:contents'}>
                      <Badge item={item} badges={badges} />
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className={cn('border-t border-white/10 p-3', L)}>
        <div className="flex items-center gap-2.5">
          {who && <Avatar name={who.name} photo={who.photo} color="#24543f" size="sm" className="ring-1 ring-white/20" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{who?.name}</p>
            <p className="truncate text-xs text-white/60">{title}</p>
          </div>
        </div>
        <p className="mt-2.5 text-[11px] text-white/60">
          Dia da demonstração: {dayShort(today)}, {dateShort(today)}
        </p>
      </div>
    </aside>
  )
}
