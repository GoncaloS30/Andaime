import { Menu as MenuIcon, Presentation } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { useTour } from '@/features/presentation/tourStore'
import { Drawer } from '@/ui/Overlay'
import { ENCARREGADO_NAV, GESTOR_MOBILE, GESTOR_NAV } from '../nav'
import { useNavBadges } from './useNavBadges'

/** Barra inferior em telemóvel: quatro atalhos e "Mais" com a navegação completa. */
export function MobileNav() {
  const role = useDemo((s) => s.session.role)
  const [more, setMore] = useState(false)
  const badges = useNavBadges()
  const location = useLocation()
  const toggleTour = useTour((s) => s.toggle)
  const items = role === 'encarregado' ? ENCARREGADO_NAV[0]!.items.slice(0, 4) : GESTOR_MOBILE
  const groups = role === 'encarregado' ? ENCARREGADO_NAV : GESTOR_NAV

  return (
    <>
      <nav
        aria-label="Navegação"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        {items.map((it) => {
          const n = it.badge ? badges[it.badge] : 0
          return (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn('relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-pinho' : 'text-ink-3')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-b-full bg-pinho" />}
                  <it.icon className="size-5" aria-hidden strokeWidth={isActive ? 2.2 : 1.8} />
                  {it.label}
                  {n > 0 && (
                    <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-tijolo px-1 text-[10px] leading-4 font-bold text-white">{n}</span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
        <button
          type="button"
          onClick={() => setMore(true)}
          className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-ink-3"
        >
          <MenuIcon className="size-5" aria-hidden />
          Mais
        </button>
      </nav>
      <Drawer open={more} onOpenChange={setMore} title="Menu" size="sm">
        <button
          type="button"
          onClick={() => {
            setMore(false)
            toggleTour()
          }}
          className="mb-3 flex w-full items-center gap-2.5 rounded-md bg-pinho px-3 py-2.5 text-sm font-semibold text-white"
        >
          <Presentation className="size-4 text-lima" aria-hidden /> Modo apresentação
        </button>
        {groups.map((g, i) => (
          <div key={i} className="mb-3">
            {g.pillar && <p className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-ink-3 uppercase">{g.pillar}</p>}
            <ul>
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    onClick={() => setMore(false)}
                    className={({ isActive }) =>
                      cn('flex h-11 items-center gap-3 rounded-md px-2 text-base', isActive ? 'bg-line-2 font-semibold text-ink' : 'text-ink-2')
                    }
                    aria-current={location.pathname === it.to ? 'page' : undefined}
                  >
                    <it.icon className="size-5 text-ink-3" aria-hidden />
                    {it.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Drawer>
    </>
  )
}
