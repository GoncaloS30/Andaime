import { NavLink } from 'react-router'
import { dateShort, dayShort } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
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
  const groups: NavGroup[] = role === 'encarregado' ? ENCARREGADO_NAV : GESTOR_NAV
  const who = role === 'gestor' ? db.managers[persona] : db.workers[persona]
  const title = role === 'gestor' ? db.managers[persona]?.title : db.workers[persona]?.category

  return (
    <aside
      aria-label="Navegação principal"
      className="on-dark sticky top-0 hidden h-dvh flex-col bg-pinho text-white md:flex md:w-16 lg:w-60"
    >
      <div className="flex h-14 shrink-0 items-center px-3.5 lg:px-4">
        <span className="hidden lg:block">
          <Wordmark onDark />
        </span>
        <span className="lg:hidden">
          <LogoMark />
        </span>
      </div>
      <div className="hidden px-4 pb-3 lg:block">
        <p className="truncate text-xs font-medium text-white/80">{db.company.name}</p>
        <p className="text-[11px] text-white/45">Empresa fictícia</p>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 [scrollbar-width:thin]">
        {groups.map((g, gi) => (
          <div key={gi} className="mt-3 first:mt-1">
            {g.pillar && (
              <p className="mb-1 hidden px-2.5 text-[10px] font-semibold tracking-[0.14em] text-white/40 uppercase lg:block">
                {g.pillar}
              </p>
            )}
            {g.pillar && <div aria-hidden className="mx-3 mb-1.5 h-px bg-white/10 lg:hidden" />}
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
                        'justify-center lg:justify-start',
                        isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/6 hover:text-white',
                        isActive &&
                          'before:absolute before:top-2 before:bottom-2 before:-left-2 before:w-[3px] before:rounded-r-full before:bg-lima',
                      )
                    }
                  >
                    <item.icon aria-hidden className="size-4.5 shrink-0" strokeWidth={1.9} />
                    <span className="hidden truncate lg:inline">{item.label}</span>
                    <span className="hidden lg:contents">
                      <Badge item={item} badges={badges} />
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="hidden border-t border-white/10 p-3 lg:block">
        <div className="flex items-center gap-2.5">
          {who && <Avatar name={who.name} color="#24543f" size="sm" className="ring-1 ring-white/20" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{who?.name}</p>
            <p className="truncate text-xs text-white/50">{title}</p>
          </div>
        </div>
        <p className="mt-2.5 text-[11px] text-white/45">
          Dia da demonstração: {dayShort(today)}, {dateShort(today)}
        </p>
      </div>
    </aside>
  )
}
