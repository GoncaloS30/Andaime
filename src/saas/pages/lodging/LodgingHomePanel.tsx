import { BedDouble } from 'lucide-react'
import { Link } from 'react-router'
import { Panel } from '@/ui/Layout'
import { useLodgingWeek } from '../../api/lodging'
import { mondayOf } from '../../api/planning'
import { todayIso } from '../../api/workforce'

/**
 * Dormidas desta semana no início do gestor: quem está longe de casa, quantos já têm estadia e o que falta marcar.
 * Fica escondido quando ninguém da escala está longe de casa.
 */
export function LodgingHomePanel({ orgId }: { orgId: string }) {
  const week = mondayOf(todayIso())
  const board = useLodgingWeek(orgId, week)
  if (!board.data) return null
  const far = board.data.lines.filter((l) => l.away === 'FAR')
  if (far.length === 0 && board.data.summary.withoutSchedule === 0) return null
  const toBook = far.filter((l) => !l.stay).length
  const { nights, undefinedHotel, withoutSchedule } = board.data.summary
  const stats = [
    { label: 'Longe de casa', value: far.length },
    { label: 'Por marcar', value: toBook, warn: toBook > 0 },
    { label: 'Hotel por definir', value: undefinedHotel, warn: undefinedHotel > 0 },
    { label: 'Noites marcadas', value: nights },
  ]
  return (
    <Panel
      className="mb-5"
      title="Dormidas desta semana"
      actions={<Link to="/dormidas" className="text-sm font-medium text-pinho hover:underline">Abrir Dormidas</Link>}
    >
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-ink-3">{s.label}</dt>
            <dd className={s.warn ? 'font-expanded text-xl font-semibold text-ambar-ink tabular' : 'font-expanded text-xl font-semibold tabular'}>{s.value}</dd>
          </div>
        ))}
      </dl>
      {withoutSchedule > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-ambar-ink">
          <BedDouble className="size-4" aria-hidden /> {withoutSchedule === 1 ? '1 estadia sem escala' : `${withoutSchedule} estadias sem escala`}: confirme se a reserva se mantém.
        </p>
      )}
    </Panel>
  )
}
