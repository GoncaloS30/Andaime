import { formatHours } from '@/domain/hours'
import { isoWeek } from '@/domain/weeks'

export interface WeekBar {
  week: string
  realized: number
  planned: number
  current?: boolean
}

/**
 * Horas por semana: sólido = realizadas, tracejado = planeadas (semanas futuras ou por registar).
 * Um só eixo; os valores exatos estão na tabela por baixo do gráfico.
 */
export function WeeklyBars({ data, label }: { data: WeekBar[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.realized, d.planned)))
  const nice = Math.ceil(max / 100) * 100
  return (
    <figure>
      <div className="relative flex h-40 items-end gap-3 border-b border-line pl-10" role="img" aria-label={label}>
        <div aria-hidden className="absolute top-0 left-0 flex h-40 flex-col justify-between text-[10px] text-ink-3 tabular">
          <span>{nice}</span>
          <span>{nice / 2}</span>
          <span>0</span>
        </div>
        {data.map((d) => (
          <div key={d.week} className="group relative flex h-full flex-1 items-end justify-center gap-[2px]" title={`Semana ${isoWeek(d.week)}: ${formatHours(d.realized)} realizadas, ${formatHours(d.planned)} planeadas`}>
            <span className="w-full max-w-5 rounded-t-[4px] bg-pinho" style={{ height: `${(d.realized / nice) * 100}%` }} />
            <span className="hatch w-full max-w-5 rounded-t-[4px] border border-b-0 border-pinho/40" style={{ height: `${(d.planned / nice) * 100}%` }} />
            {d.current && <span aria-hidden className="absolute -top-1 h-1 w-6 rounded-full bg-lima" />}
          </div>
        ))}
      </div>
      <div className="flex gap-3 pt-1 pl-10">
        {data.map((d) => (
          <span key={d.week} className="flex-1 text-center text-[11px] text-ink-3 tabular">S{isoWeek(d.week)}</span>
        ))}
      </div>
      <table className="mt-3 w-full text-xs">
        <caption className="sr-only">Valores por semana</caption>
        <thead>
          <tr className="text-ink-3">
            <th scope="col" className="py-1 text-left font-medium">Semana</th>
            {data.map((d) => <th key={d.week} scope="col" className="py-1 text-right font-medium tabular">S{isoWeek(d.week)}</th>)}
          </tr>
        </thead>
        <tbody className="font-mono tabular">
          <tr className="border-t border-line-2">
            <th scope="row" className="py-1 text-left font-sans font-normal text-ink-2">Realizadas</th>
            {data.map((d) => <td key={d.week} className="py-1 text-right">{d.realized || '—'}</td>)}
          </tr>
          <tr className="border-t border-line-2">
            <th scope="row" className="py-1 text-left font-sans font-normal text-ink-2">Planeadas</th>
            {data.map((d) => <td key={d.week} className="py-1 text-right">{d.planned || '—'}</td>)}
          </tr>
        </tbody>
      </table>
      <figcaption className="mt-2 flex gap-4 text-xs text-ink-3">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-3 rounded-xs bg-pinho" /> Realizadas</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="hatch h-2 w-3 rounded-xs border border-pinho/40" /> Planeadas</span>
      </figcaption>
    </figure>
  )
}
