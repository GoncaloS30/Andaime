import type { SiteMetrics } from '@/domain/siteMetrics'
import { formatHours } from '@/domain/hours'
import { cn } from '@/lib/cn'

const pct = (v: number, max: number) => `${Math.max(0, (v / max) * 100)}%`

interface Props {
  m: SiteMetrics
  size?: 'sm' | 'md' | 'lg'
  legend?: boolean
  className?: string
}

/**
 * Medidor de horas da obra — a assinatura visual do Andaime.
 * Sólido escuro = aprovadas · sólido claro = realizadas por aprovar · tracejado = planeadas futuras.
 * A linha vertical é o limite; o que passa do limite fica a tijolo.
 */
export function HoursGauge({ m, size = 'md', legend = false, className }: Props) {
  const limit = m.limit ?? 0
  const max = Math.max(limit, m.projection, 1) * (m.projection > limit && limit > 0 ? 1.04 : 1)
  const pending = Math.max(0, m.realized - m.approved)
  const over = limit > 0 ? Math.max(0, m.projection - limit) : 0
  const h = size === 'sm' ? 'h-1.5' : size === 'md' ? 'h-2.5' : 'h-4'
  const label =
    m.limit === null
      ? `${formatHours(m.realized)} realizadas e ${formatHours(m.plannedFuture)} planeadas, sem limite definido`
      : `${formatHours(m.realized)} realizadas (${formatHours(m.approved)} aprovadas) e ${formatHours(m.plannedFuture)} planeadas, para um limite de ${formatHours(limit)}${over > 0 ? `; excede em ${formatHours(over)}` : ''}`

  return (
    <div className={cn('w-full', className)}>
      <div role="img" aria-label={label} className={cn('relative w-full overflow-hidden rounded-full bg-line-2', h)}>
        <div className="absolute inset-y-0 left-0 flex gap-[2px]" style={{ width: pct(m.projection, max) }}>
          {m.approved > 0 && <span className="h-full bg-pinho" style={{ flex: m.approved }} />}
          {pending > 0 && <span className="h-full bg-realizado" style={{ flex: pending }} />}
          {m.plannedFuture > 0 && (
            <span
              className={cn('hatch h-full', m.status === 'excede' ? '[--hatch:var(--color-tijolo)]' : m.status === 'atencao' ? '[--hatch:var(--color-ambar)]' : '[--hatch:var(--color-pinho)]')}
              style={{ flex: m.plannedFuture }}
            />
          )}
        </div>
        {over > 0 && (
          <div
            className="absolute inset-y-0 bg-tijolo/25"
            style={{ left: pct(limit, max), width: pct(over, max) }}
          />
        )}
        {limit > 0 && (
          <div aria-hidden className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink" style={{ left: `calc(${pct(limit, max)} - 1px)` }} />
        )}
      </div>
      {legend && <GaugeLegend />}
    </div>
  )
}

export function GaugeLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3', className)}>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-3 rounded-xs bg-pinho" /> Aprovadas
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-3 rounded-xs bg-realizado" /> Realizadas por aprovar
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="hatch h-2 w-3 rounded-xs border border-pinho/30" /> Planeadas
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-0.5 rounded-full bg-ink" /> Limite
      </li>
    </ul>
  )
}

/** Percentagem da projeção face ao limite, com o estado em texto. */
export function HoursStatus({ m, className }: { m: SiteMetrics; className?: string }) {
  if (m.status === 'sem_limite') return <span className={cn('text-xs text-ink-3', className)}>Sem limite definido</span>
  const p = Math.round(m.pctProjection * 100)
  return (
    <span
      className={cn(
        'text-xs font-semibold tabular',
        m.status === 'excede' ? 'text-tijolo-ink' : m.status === 'atencao' ? 'text-ambar-ink' : 'text-ink-2',
        className,
      )}
    >
      {m.status === 'excede' ? `Excede ${formatHours(m.overBy)}` : m.status === 'atencao' ? `Atenção · ${p} %` : `${p} % previsto`}
    </span>
  )
}
