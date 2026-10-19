import { formatHours } from '@/domain/hours'
import type { Site } from '@/domain/types'

/** Donut: a parte de cada obra nas horas da pessoa. Cor da obra + nome e percentagem na legenda (nunca só a cor). */
export function SiteDonut({ parts, total }: { parts: { site: Site; hours: number }[]; total: number }) {
  const R = 42
  const C = 2 * Math.PI * R
  // Início de cada fatia ao longo do círculo (soma das anteriores).
  const lens = parts.map((p) => (p.hours / total) * C)
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0))
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" role="img" aria-label={parts.map((p) => `${p.site.code}: ${Math.round((p.hours / total) * 100)} %`).join('; ')}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-line-2)" strokeWidth="12" />
        {parts.map((p, i) => (
          // Pequeno intervalo entre fatias, para se distinguirem sem depender só da cor
          <circle key={p.site.id} cx="50" cy="50" r={R} fill="none" stroke={p.site.color} strokeWidth="12" strokeDasharray={`${Math.max(0, lens[i]! - 1.5)} ${C}`} strokeDashoffset={-starts[i]!} />
        ))}
      </svg>
      <ul className="flex min-w-0 flex-col gap-1 text-sm">
        {parts.map((p) => (
          <li key={p.site.id} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-xs" style={{ background: p.site.color }} />
            <span className="font-mono text-xs">{p.site.code}</span>
            <span className="truncate text-ink-2">{p.site.name}</span>
            <span className="ml-auto pl-2 font-mono text-xs tabular">{formatHours(Math.round(p.hours * 10) / 10)} · {Math.round((p.hours / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
