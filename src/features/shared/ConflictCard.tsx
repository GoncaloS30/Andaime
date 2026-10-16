import { AlertOctagon, AlertTriangle, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { CONFLICT_LABEL, type Conflict } from '@/domain/conflicts'
import { dateShort, dayShort } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Badge } from '@/ui/Badge'

/** Aplica uma correção e mostra o resultado com "Anular". */
export function useApplyFix() {
  const applyFix = useDemo((s) => s.applyFix)
  const undo = useDemo((s) => s.undo)
  const navigate = useNavigate()
  return (conflictId: string, fixId: string) => {
    const res = applyFix(conflictId, fixId)
    if (res.navigate) {
      navigate(res.navigate)
      return
    }
    if (!res.ok) {
      toast.error(res.message)
      return
    }
    toast.success('Conflito resolvido', {
      description: res.message,
      action: { label: 'Anular', onClick: () => undo() },
    })
  }
}

interface Props {
  conflict: Conflict
  compact?: boolean
  /** Pré-visualização: explica o conflito sem mostrar correções. */
  preview?: boolean
  onFocus?: (c: Conflict) => void
  className?: string
}

export function ConflictCard({ conflict: c, compact, preview, onFocus, className }: Props) {
  const apply = useApplyFix()
  const critical = c.severity === 'critico'
  const Icon = critical ? AlertOctagon : AlertTriangle
  return (
    <article
      className={cn(
        'rounded-md border bg-surface',
        critical ? 'border-tijolo/30' : 'border-ambar/40',
        className,
      )}
      aria-label={`${critical ? 'Conflito crítico' : 'Aviso'}: ${c.title}`}
    >
      <div className="flex gap-2.5 p-3">
        <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', critical ? 'text-tijolo' : 'text-ambar-ink')} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={critical ? 'danger' : 'warn'}>{CONFLICT_LABEL[c.type]}</Badge>
            {c.date && (
              <span className="text-xs text-ink-3 tabular">
                {dayShort(c.date)} {dateShort(c.date)}
              </span>
            )}
          </div>
          <h3 className="mt-1 text-sm leading-snug font-semibold text-ink">{c.title}</h3>
          {!compact && <p className="mt-0.5 text-sm leading-snug text-ink-2">{c.explanation}</p>}
        </div>
        {onFocus && (
          <button
            type="button"
            onClick={() => onFocus(c)}
            className="self-start rounded-sm p-1 text-ink-3 hover:bg-line-2 hover:text-ink"
            aria-label="Ver no planeamento"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {!compact && !preview && c.fixes.length > 0 && (
        <div className="border-t border-line-2 px-3 py-2">
          <p className="mb-1.5 text-xs font-medium text-ink-3">Correções sugeridas</p>
          <ul className="flex flex-col gap-1">
            {c.fixes.map((f, i) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => apply(c.id, f.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
                    i === 0 ? 'bg-pinho text-white hover:bg-pinho-2' : 'border border-line hover:border-ink-4 hover:bg-cal',
                  )}
                >
                  <span className="flex-1">
                    <span className="font-medium">{f.label}</span>
                    {f.detail && <span className={cn('block text-xs', i === 0 ? 'text-white/70' : 'text-ink-3')}>{f.detail}</span>}
                  </span>
                  <ChevronRight className="size-3.5 opacity-70" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!compact && !preview && c.fixes.length === 0 && (
        <p className="border-t border-line-2 px-3 py-2 text-xs text-ink-3">Sem alternativas livres. Ajuste o planeamento manualmente.</p>
      )}
    </article>
  )
}
