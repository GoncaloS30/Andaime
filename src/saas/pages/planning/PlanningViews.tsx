import { AlertOctagon, CalendarRange, ChevronRight, Crown, Plus, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { Avatar } from '@/ui/Avatar'
import { Button, IconButton } from '@/ui/Button'
import { EmptyState } from '@/ui/States'
import { hhmm, type Assignment, type Conflict } from '../../api/planning'
import { addDaysIso, formatDate, minutesToHours, type EmployeeSummary, type SiteSummary } from '../../api/workforce'

const SHORT_DAY = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', timeZone: 'UTC' })
const LONG_DATE = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const MONTH = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const dateAtUtc = (iso: string) => new Date(`${iso}T00:00:00Z`)
const shortDay = (iso: string) => SHORT_DAY.format(dateAtUtc(iso)).replace('.', '')

export function monthRange(reference: string): [string, string] {
  const [year, month] = reference.split('-').map(Number) as [number, number]
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10)
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return [from, to]
}

export function shiftMonth(reference: string, delta: number): string {
  const [year, month] = reference.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = []
  for (let day = from; day <= to; day = addDaysIso(day, 1)) days.push(day)
  return days
}

interface SharedProps {
  assignments: Assignment[]
  conflicts: Conflict[]
  employees: EmployeeSummary[]
  sites: Map<string, SiteSummary>
  today: string
  readOnly: boolean
  onOpenAssignment: (id: string) => void
  onAssign: (preset: { employeeId?: string; siteId?: string; date?: string }) => void
}

export function MobilePlanning({ week, days, ...props }: SharedProps & { week: string; days: string[] }) {
  const { assignments, conflicts, employees, sites, today, readOnly, onOpenAssignment, onAssign } = props
  const [day, setDay] = useState(days.includes(today) ? today : days[0]!)
  const selected = days.includes(day) ? day : days.includes(today) ? today : days[0]!

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees])
  const conflictIds = useMemo(() => new Set(conflicts.flatMap((conflict) => conflict.assignmentIds)), [conflicts])
  const dayAssignments = assignments.filter((assignment) => assignment.date === selected)
  const dayConflicts = conflicts.filter((conflict) => conflict.date === selected)
  const groups = [...new Set(dayAssignments.map((assignment) => assignment.siteId))]
    .map((siteId) => ({ site: sites.get(siteId), assignments: dayAssignments.filter((assignment) => assignment.siteId === siteId) }))
    .sort((left, right) => (left.site?.code ?? '').localeCompare(right.site?.code ?? '', 'pt'))

  return (
    <div className="md:hidden" role="region" aria-label="Planeamento no telemóvel">
      <div className="border-b border-line bg-cal px-3 py-3">
        <p className="text-xs font-semibold text-ink-3">Semana de {formatDate(week)}</p>
        <div role="tablist" aria-label="Dia do planeamento" className="mt-2 grid grid-cols-7 gap-1">
          {days.map((day) => {
            const hasConflict = conflicts.some((conflict) => conflict.date === day)
            return (
              <button
                key={day}
                role="tab"
                type="button"
                aria-selected={day === selected}
                aria-label={`${shortDay(day)} ${formatDate(day)}${hasConflict ? ', com conflitos' : ''}`}
                onClick={() => setDay(day)}
                className={cn(
                  'relative flex min-h-12 flex-col items-center justify-center rounded-md px-0.5 py-1',
                  day === selected ? 'bg-pinho text-white' : day === today ? 'bg-lima text-pinho' : 'text-ink-2',
                )}
              >
                <span className="text-[10px] font-semibold uppercase">{shortDay(day).slice(0, 3)}</span>
                <span className="font-expanded text-base font-semibold tabular">{Number(day.slice(8))}</span>
                {hasConflict && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-tijolo" aria-hidden />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink first-letter:uppercase">{LONG_DATE.format(dateAtUtc(selected))}</p>
          {!readOnly && selected >= today && (
            <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => onAssign({ date: selected })}>
              Atribuir
            </Button>
          )}
        </div>

        {dayConflicts.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-tijolo/30 bg-tijolo-soft px-3 py-2.5 text-sm font-medium text-tijolo-ink">
            <AlertOctagon className="size-4 shrink-0" aria-hidden />
            {dayConflicts.length} {dayConflicts.length === 1 ? 'conflito neste dia' : 'conflitos neste dia'}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface">
            <EmptyState icon={<CalendarRange />} title="Sem trabalho planeado">
              {readOnly ? 'Não há atribuições neste dia.' : 'Use “Atribuir” para escolher uma pessoa e uma obra.'}
            </EmptyState>
          </div>
        ) : (
          groups.map(({ site, assignments: list }) => (
            <section key={site?.id ?? list[0]!.siteId} className="overflow-hidden rounded-lg border border-line bg-surface" aria-label={`${site?.code ?? 'Obra'} ${site?.name ?? ''}`}>
              <header className="flex items-center gap-2 border-b border-line-2 px-3 py-2.5">
                <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ background: site?.color ?? '#7d847f' }} />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs font-semibold text-ink-2">{site?.code ?? 'Obra'}</span>
                  <span className="block truncate text-sm font-semibold text-ink">{site?.name ?? 'Obra'}</span>
                </span>
                <span className="text-xs text-ink-3 tabular">{list.length} {list.length === 1 ? 'pessoa' : 'pessoas'}</span>
                {!readOnly && selected >= today && (
                  <IconButton label={`Atribuir a ${site?.code ?? 'esta obra'}`} size="sm" variant="secondary" onClick={() => onAssign({ siteId: site?.id, date: selected })}>
                    <Plus className="size-4" />
                  </IconButton>
                )}
              </header>
              <ul className="divide-y divide-line-2">
                {list
                  .slice()
                  .sort((left, right) => Number(right.foreman) - Number(left.foreman) || left.start.localeCompare(right.start))
                  .map((assignment) => {
                    const employee = employeeById.get(assignment.employeeId)
                    const conflict = conflictIds.has(assignment.id)
                    return (
                      <li key={assignment.id}>
                        <button type="button" onClick={() => onOpenAssignment(assignment.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left active:bg-cal">
                          <Avatar name={employee?.fullName ?? 'Trabalhador'} photo={employee?.photoUrl} color={employee?.team?.color} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">
                              {employee?.fullName ?? 'Trabalhador'}
                              {assignment.foreman && <span className="ml-1 text-xs font-normal text-ambar-ink">· responsável</span>}
                            </span>
                            <span className="flex items-center gap-2 text-xs text-ink-3">
                              {hhmm(assignment.start)}–{hhmm(assignment.end)} · {minutesToHours(assignment.plannedMin)}
                              {assignment.vehicleId && <Truck className="size-3" aria-label="Com viatura" />}
                            </span>
                          </span>
                          {conflict && <AlertOctagon className="size-4 shrink-0 text-tijolo" aria-label="Com conflito" />}
                          <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}

export function MonthPlanning({ from, to, onOpenWeek, ...props }: SharedProps & { from: string; to: string; onOpenWeek: (date: string) => void }) {
  const { assignments, conflicts, employees, sites, today } = props
  const days = useMemo(() => daysBetween(from, to), [from, to])
  const assignmentsByCell = useMemo(() => {
    const result = new Map<string, Assignment[]>()
    for (const assignment of assignments) {
      const key = `${assignment.employeeId}|${assignment.date}`
      result.set(key, [...(result.get(key) ?? []), assignment])
    }
    return result
  }, [assignments])
  const conflictIds = useMemo(() => new Set(conflicts.flatMap((conflict) => conflict.assignmentIds)), [conflicts])
  const visibleEmployees = employees.filter((employee) => !employee.archived || assignments.some((assignment) => assignment.employeeId === employee.id))

  return (
    <div className="max-h-[calc(100dvh-14rem)] overflow-auto" role="region" aria-label={`Planeamento mensal de ${MONTH.format(dateAtUtc(from))}`}>
      <table className="border-separate border-spacing-0 text-xs">
        <caption className="sr-only">Planeamento mensal de {MONTH.format(dateAtUtc(from))}</caption>
        <thead className="sticky top-0 z-20 bg-surface">
          <tr>
            <th scope="col" className="sticky left-0 z-10 min-w-48 border-b border-line bg-surface px-3 py-2 text-left font-semibold text-ink-3 capitalize">
              {MONTH.format(dateAtUtc(from))}
            </th>
            {days.map((day) => {
              const weekend = [0, 6].includes(dateAtUtc(day).getUTCDay())
              return (
                <th key={day} scope="col" className={cn('w-8 min-w-8 border-b border-line py-1 text-center font-semibold', weekend && 'bg-line-2/50', day === today ? 'text-pinho' : 'text-ink-3')}>
                  <button type="button" onClick={() => onOpenWeek(day)} className="w-full" aria-label={`Abrir semana de ${formatDate(day)}`}>
                    <span className="block text-[9px] uppercase">{shortDay(day).slice(0, 1)}</span>
                    <span className={cn('tabular', day === today && 'rounded-xs bg-lima px-0.5')}>{Number(day.slice(8))}</span>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {visibleEmployees.map((employee) => (
            <tr key={employee.id}>
              <th scope="row" className="sticky left-0 z-10 border-b border-line-2 bg-surface px-3 py-1.5 text-left font-normal">
                <span className="flex items-center gap-2">
                  <Avatar name={employee.fullName} photo={employee.photoUrl} color={employee.team?.color} size="xs" />
                  <span className="min-w-0">
                    <span className="block max-w-36 truncate text-xs font-semibold text-ink">{employee.fullName}</span>
                    <span className="block max-w-36 truncate text-[10px] text-ink-3">{employee.team?.name ?? (employee.category || 'Sem equipa')}</span>
                  </span>
                </span>
              </th>
              {days.map((day) => {
                const list = assignmentsByCell.get(`${employee.id}|${day}`) ?? []
                const site = list[0] ? sites.get(list[0].siteId) : undefined
                const flagged = list.some((assignment) => conflictIds.has(assignment.id))
                const minutes = list.reduce((total, assignment) => total + assignment.plannedMin, 0)
                const weekend = [0, 6].includes(dateAtUtc(day).getUTCDay())
                const summary = list.length ? `${site?.code ?? 'Obra'}${list.length > 1 ? ` e mais ${list.length - 1}` : ''}, ${minutesToHours(minutes)}` : 'sem trabalho'
                return (
                  <td key={day} className={cn('h-9 border-b border-line-2 p-[2px]', weekend && 'bg-line-2/40', day === today && 'bg-lima-soft/45')}>
                    <button
                      type="button"
                      onClick={() => onOpenWeek(day)}
                      className={cn('relative block size-full min-h-7 rounded-[3px] text-[9px] font-semibold', flagged && 'ring-1 ring-tijolo ring-inset')}
                      style={site ? { background: `color-mix(in oklab, ${site.color} 50%, white)` } : undefined}
                      aria-label={`${employee.fullName}, ${formatDate(day)}: ${summary}${flagged ? ', com conflito' : ''}`}
                    >
                      {list.length > 0 && <span aria-hidden>{list.length > 1 ? list.length : site?.code?.replace(/^OB-/, '')}</span>}
                      {list.some((assignment) => assignment.foreman) && <Crown aria-hidden className="absolute top-0.5 right-0.5 size-2.5 text-ambar-ink" />}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
