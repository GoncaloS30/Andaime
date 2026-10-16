import * as RD from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { IconButton } from './Button'

interface OverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Largura do drawer/modal. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  eyebrow?: ReactNode
  className?: string
}

const drawerWidth = { sm: 'sm:w-[380px]', md: 'sm:w-[460px]', lg: 'sm:w-[600px]', xl: 'sm:w-[760px]' }
const dialogWidth = { sm: 'sm:max-w-[400px]', md: 'sm:max-w-[520px]', lg: 'sm:max-w-[680px]', xl: 'sm:max-w-[880px]' }

function Header({ title, description, eyebrow }: Pick<OverlayProps, 'title' | 'description' | 'eyebrow'>) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line-2 px-5 pt-4 pb-3.5">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold tracking-wide text-ink-3 uppercase">{eyebrow}</div>}
        <RD.Title className="font-wide text-lg leading-tight font-semibold text-ink">{title}</RD.Title>
        {description ? (
          <RD.Description className="mt-1 text-sm text-ink-3">{description}</RD.Description>
        ) : (
          <RD.Description className="sr-only">Painel de detalhe</RD.Description>
        )}
      </div>
      <RD.Close asChild>
        <IconButton label="Fechar" size="sm" className="-mr-1.5">
          <X className="size-4" />
        </IconButton>
      </RD.Close>
    </div>
  )
}

/**
 * Drawer lateral em desktop; em ecrãs estreitos passa a folha inferior (bottom sheet).
 * Foco preso, Escape fecha e o foco regressa ao elemento que abriu (Radix).
 */
export function Drawer({ open, onOpenChange, title, description, children, footer, size = 'md', eyebrow, className }: OverlayProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-pinho/25 animate-fade-in" />
        <RD.Content
          className={cn(
            'fixed z-50 flex flex-col bg-surface shadow-e2 focus:outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-lg animate-sheet-in',
            'sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:rounded-none sm:rounded-l-lg sm:animate-drawer-in',
            drawerWidth[size],
            className,
          )}
        >
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" />
          <Header title={title} description={description} eyebrow={eyebrow} />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-2 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', eyebrow, className }: OverlayProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-pinho/30 animate-fade-in" />
        <RD.Content
          className={cn(
            'fixed z-50 flex flex-col bg-surface shadow-e2 focus:outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-lg animate-sheet-in',
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[86dvh] sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:animate-pop-in',
            dialogWidth[size],
            className,
          )}
        >
          <Header title={title} description={description} eyebrow={eyebrow} />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-2 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
