import { lazy, Suspense, useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigation } from 'react-router'
import { useTour } from '@/features/presentation/tourStore'
import { cn } from '@/lib/cn'
import { SkeletonRows } from '@/ui/States'
import { MobileNav } from './shell/MobileNav'
import { Sidebar } from './shell/Sidebar'
import { Topbar } from './shell/Topbar'
import { useCommandPalette } from './shell/useCommandPalette'

// Carregados só quando abertos: não pesam no arranque.
const CommandPalette = lazy(async () => ({ default: (await import('./shell/CommandPalette')).CommandPalette }))
const GuidePanel = lazy(async () => ({ default: (await import('@/features/presentation/GuidePanel')).GuidePanel }))
const StageFrame = lazy(async () => ({ default: (await import('@/features/presentation/StageFrame')).StageFrame }))

/** Barra de progresso no topo enquanto um módulo carrega (rede ou dispositivo lentos). */
function RouteProgress() {
  const loading = useNavigation().state === 'loading'
  if (!loading) return null
  return (
    <div role="status" aria-label="A carregar" className="fixed inset-x-0 top-0 z-[80] h-0.5 overflow-hidden bg-lima-soft">
      <div className="h-full w-1/3 animate-[progress_1.1s_var(--ease-andaime)_infinite] bg-pinho motion-reduce:w-full motion-reduce:animate-none" />
    </div>
  )
}

/** Layout do backoffice (gestor e encarregado). */
export function AppShell() {
  const palette = useCommandPalette()
  const tourOpen = useTour((s) => s.open)
  const stage = useTour((s) => s.stage)
  const location = useLocation()
  const loading = useNavigation().state === 'loading'
  const first = useRef(true)
  useEffect(() => {
    // Ao mudar de página, o foco vai para o conteúdo (leitores de ecrã anunciam a nova página).
    // No primeiro carregamento não: o primeiro Tab tem de chegar a "Saltar para o conteúdo".
    if (first.current) {
      first.current = false
      return
    }
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
      <RouteProgress />
      <Sidebar />
      <div className={cn('flex min-w-0 flex-1 flex-col', tourOpen && 'xl:pr-[360px]', stage && 'lg:pr-[360px] xl:pr-[724px]')}>
        <Topbar onSearch={() => palette.setOpen(true)} />
        <main id="conteudo" tabIndex={-1} aria-busy={loading || undefined} className="flex-1 px-4 pt-5 pb-28 focus:outline-none sm:px-5 md:pb-10 lg:px-7">
          <Suspense fallback={<SkeletonRows rows={8} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileNav />
      <Suspense fallback={null}>
        {palette.open && <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />}
        {stage && <StageFrame />}
        {tourOpen && <GuidePanel />}
      </Suspense>
    </div>
  )
}
