import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { GuidePanel } from '@/features/presentation/GuidePanel'
import { StageFrame } from '@/features/presentation/StageFrame'
import { useTour } from '@/features/presentation/tourStore'
import { cn } from '@/lib/cn'
import { SkeletonRows } from '@/ui/States'
import { CommandPalette, useCommandPalette } from './shell/CommandPalette'
import { MobileNav } from './shell/MobileNav'
import { Sidebar } from './shell/Sidebar'
import { Topbar } from './shell/Topbar'

/** Layout do backoffice (gestor e encarregado). */
export function AppShell() {
  const palette = useCommandPalette()
  const tourOpen = useTour((s) => s.open)
  const stage = useTour((s) => s.stage)
  const location = useLocation()
  useEffect(() => {
    document.getElementById('conteudo')?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="flex min-h-dvh">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-pinho px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar para o conteúdo
      </a>
      <Sidebar />
      <div className={cn('flex min-w-0 flex-1 flex-col', tourOpen && 'xl:pr-[360px]', stage && 'lg:pr-[360px] xl:pr-[724px]')}>
        <Topbar onSearch={() => palette.setOpen(true)} />
        <main id="conteudo" tabIndex={-1} className="flex-1 px-4 pt-5 pb-28 focus:outline-none sm:px-5 md:pb-10 lg:px-7">
          <Suspense fallback={<SkeletonRows rows={8} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileNav />
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
      {stage && <StageFrame />}
      <GuidePanel />
    </div>
  )
}
