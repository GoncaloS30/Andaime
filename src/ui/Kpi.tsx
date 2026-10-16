import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'
import { useCountUp } from '@/lib/useCountUp'

export interface KpiItem {
  label: string
  value: number
  format?: (n: number) => string
  sub?: ReactNode
  to: string
  tone?: 'warn' | 'danger' | 'ok'
  tour?: string
}

function KpiValue({ value, format }: { value: number; format?: (n: number) => string }) {
  const v = useCountUp(value)
  return <>{format ? format(v) : Math.round(v).toLocaleString('pt-PT')}</>
}

/**
 * Faixa de indicadores: células separadas por réguas finas, não cartões repetidos.
 * Cada indicador é uma ligação para a vista já filtrada.
 */
export function KpiStrip({ items, className }: { items: KpiItem[]; className?: string }) {
  return (
    <div className={cn('grid overflow-hidden rounded-lg border border-line bg-surface', className)}>
      <ul className="grid grid-cols-2 divide-line-2 sm:grid-cols-3 lg:grid-cols-5 [&>li]:border-line-2 [&>li]:border-r [&>li]:border-b">
        {items.map((k) => (
          <li key={k.label} className="-mr-px -mb-px">
            <Link
              to={k.to}
              data-tour={k.tour}
              className="group relative flex h-full flex-col gap-1 px-4 py-3.5 transition-colors hover:bg-cal focus-visible:bg-cal"
            >
              <span className="flex items-center justify-between gap-2 text-xs font-medium text-ink-3">
                <span className="flex items-center gap-1.5">
                  {k.tone && (
                    <span
                      aria-hidden
                      className={cn('size-1.5 rounded-full', k.tone === 'danger' ? 'bg-tijolo' : k.tone === 'warn' ? 'bg-ambar' : 'bg-ok')}
                    />
                  )}
                  {k.label}
                </span>
                <ArrowUpRight aria-hidden className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
              </span>
              <span
                className={cn(
                  'font-expanded text-2xl leading-none font-semibold tracking-tight tabular',
                  k.tone === 'danger' ? 'text-tijolo-ink' : k.tone === 'warn' ? 'text-ambar-ink' : 'text-ink',
                )}
              >
                <KpiValue value={k.value} format={k.format} />
              </span>
              {k.sub && <span className="text-xs text-ink-3">{k.sub}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
