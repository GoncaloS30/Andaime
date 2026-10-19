import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface PageHeaderProps {
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

/** Cabeçalho de página: título em Archivo expandida, ações à direita. */
export function PageHeader({ title, eyebrow, description, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 pb-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-semibold tracking-[0.08em] text-ink-3 uppercase">{eyebrow}</div>}
          <h1 className="font-expanded text-xl leading-tight font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-base text-ink-3">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

interface SectionProps {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  description?: ReactNode
  id?: string
  flush?: boolean
  /** Alvo do modo apresentação (data-tour). */
  tour?: string
}

/** Superfície branca com título numa régua fina (sem sombras). */
export function Panel({ title, actions, children, className, bodyClassName, description, id, flush, tour }: SectionProps) {
  return (
    <section id={id} data-tour={tour} className={cn('rounded-lg border border-line bg-surface', className)} aria-labelledby={title && id ? `${id}-t` : undefined}>
      {(title || actions) && (
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line-2 px-4 py-2">
          <div className="min-w-0">
            {title && (
              <h2 id={id ? `${id}-t` : undefined} className="font-wide text-base font-semibold text-ink">
                {title}
              </h2>
            )}
            {description && <p className="text-xs text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && 'p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

/** Par rótulo/valor para fichas. */
export function Detail({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 truncate text-base text-ink">{children}</dd>
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-line-2', className)} />
}
