import { Presentation, Search } from 'lucide-react'
import { useDemo } from '@/store/store'
import { useTour } from '@/features/presentation/tourStore'
import { Button, IconButton } from '@/ui/Button'
import { Kbd } from '@/ui/Badge'
import { DemoMenu } from './DemoMenu'
import { Wordmark } from './Logo'
import { Notifications } from './Notifications'
import { RoleSwitcher } from './RoleSwitcher'

export function Topbar({ onSearch }: { onSearch: () => void }) {
  const role = useDemo((s) => s.session.role)
  const tourOpen = useTour((s) => s.open)
  const toggleTour = useTour((s) => s.toggle)
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-cal/90 px-3 backdrop-blur-sm sm:px-4 lg:px-6">
      <span className="md:hidden">
        <Wordmark />
      </span>
      {role === 'gestor' && (
        <button
          type="button"
          onClick={onSearch}
          className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-ink-3 hover:border-ink-4 md:flex"
        >
          <Search className="size-4" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left whitespace-nowrap">Pesquisar trabalhadores, obras…</span>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </button>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {role === 'gestor' && (
          <IconButton label="Pesquisar" className="md:hidden" onClick={onSearch}>
            <Search className="size-[18px]" />
          </IconButton>
        )}
        <Button
          size="md"
          variant={tourOpen ? 'primary' : 'secondary'}
          icon={<Presentation className="size-4" aria-hidden />}
          onClick={toggleTour}
          aria-pressed={tourOpen}
          className="hidden sm:inline-flex"
          data-tour="present"
          aria-label="Apresentar"
        >
          <span className="hidden lg:inline">Apresentar</span>
        </Button>
        <DemoMenu />
        <Notifications />
        <RoleSwitcher />
      </div>
    </header>
  )
}
