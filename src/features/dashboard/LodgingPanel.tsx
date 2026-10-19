import { BedDouble } from 'lucide-react'
import { Link } from 'react-router'
import { useDerived } from '@/app/hooks'
import { staySummary } from '@/domain/stays'
import { weekStart } from '@/domain/weeks'
import { Panel } from '@/ui/Layout'

/** Dormidas da semana no dashboard: pessoas fora, noites e o que falta decidir. */
export function LodgingPanel() {
  const s = useDerived(({ db, session }) => staySummary(db, weekStart(session.today)))
  if (s.away === 0 && s.orphans.length === 0) return null
  const pending = s.undecided + s.orphans.length
  return (
    <Panel tour="lodging-panel" title="Dormidas desta semana" actions={<Link to="/dormidas" className="text-sm font-medium text-pinho hover:underline">Abrir</Link>}>
      <p className="flex items-center gap-2 text-sm">
        <BedDouble className="size-4 text-ink-3" aria-hidden />
        <span><strong className="tabular">{s.away}</strong> pessoas fora · <strong className="tabular">{s.nights}</strong> noites</span>
      </p>
      {pending > 0 && (
        <p className="mt-1.5 text-sm text-ambar-ink">
          {s.undecided > 0 && `${s.undecided === 1 ? '1 estadia' : `${s.undecided} estadias`} com hotel por definir`}
          {s.undecided > 0 && s.orphans.length > 0 && ' · '}
          {s.orphans.length > 0 && `${s.orphans.length === 1 ? '1 estadia' : `${s.orphans.length} estadias`} sem escala`}
        </p>
      )}
    </Panel>
  )
}
