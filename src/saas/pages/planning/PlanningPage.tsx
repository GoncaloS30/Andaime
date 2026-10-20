import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { AlertOctagon, AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, Copy, Crown, Plus, Truck, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { Badge } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { Checkbox, Field, Input, Select, Textarea } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { Dialog, Drawer } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { errorMessage } from '../../api/http'
import {
  hhmm,
  mondayOf,
  SKIPPED_LABEL,
  useBoard,
  useChangeSets,
  usePreview,
  useVehicles,
  type Assignment,
  type Command,
  type CommandResult,
  type Conflict,
  type Fix,
} from '../../api/planning'
import { addDaysIso, formatDate, minutesToHours, todayIso, useEmployeeOptions, useSites, type EmployeeSummary, type SiteSummary } from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { ConflictList, usePlanningCommands } from './usePlanningCommands'

const DAY = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', timeZone: 'UTC' })
const dayLabel = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`)).replace('.', '')
const GRID = 'grid-cols-[minmax(170px,210px)_repeat(5,minmax(110px,1fr))_repeat(2,minmax(80px,0.65fr))]'

interface Lookups {
  sites: Map<string, SiteSummary>
  employees: Map<string, EmployeeSummary>
  vehicles: Map<string, { plate: string; seats: number }>
}

/** Planeamento semanal por trabalhador, ligado ao servidor. Todas as alterações passam por comandos. */
export function PlanningPage({ readOnlyView = false }: { readOnlyView?: boolean }) {
  const org = useActiveOrg()
  const today = todayIso()
  const [week, setWeek] = useState(() => mondayOf(today))
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysIso(week, i)), [week])
  const board = useBoard(org.id, week, days[6]!)
  const readOnly = readOnlyView || (board.data?.readOnly ?? true)
  const employees = useEmployeeOptions(org.id)
  const sites = useSites(org.id, {}, true)
  const vehicles = useVehicles(org.id, {}, !readOnly)
  const changeSets = useChangeSets(org.id, !readOnly)
  const { run, dialog, busy, revert } = usePlanningCommands(org.id)
  const navigate = useNavigate()

  const [assign, setAssign] = useState<{ employeeId?: string; date?: string } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [schedule, setSchedule] = useState(false)
  const [copy, setCopy] = useState(false)
  const [dragging, setDragging] = useState<Assignment | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))

  const lookups: Lookups = useMemo(
    () => ({
      sites: new Map((sites.data ?? []).map((s) => [s.id, s])),
      employees: new Map((employees.data?.items ?? []).map((e) => [e.id, e])),
      vehicles: new Map((vehicles.data ?? []).map((v) => [v.id, { plate: v.plate, seats: v.seats }])),
    }),
    [sites.data, employees.data, vehicles.data],
  )
  const assignments = useMemo(() => board.data?.assignments ?? [], [board.data])
  const conflicts = useMemo(() => board.data?.conflicts ?? [], [board.data])
  const byAssignment = useMemo(() => {
    const map = new Map<string, Conflict[]>()
    for (const c of conflicts) for (const id of c.assignmentIds) map.set(id, [...(map.get(id) ?? []), c])
    return map
  }, [conflicts])

  // Linhas: trabalhadores ativos (por equipa) e quem tem atribuições na semana.
  const rows = useMemo(() => {
    const ids = new Set<string>(assignments.map((a) => a.employeeId))
    const list = (employees.data?.items ?? []).filter((e) => !readOnly || ids.has(e.id))
    for (const id of ids) if (!list.some((e) => e.id === id)) list.push({ id, number: '', fullName: 'Trabalhador', category: '', status: 'ACTIVE', archived: false, team: null })
    return list.sort((a, b) => (a.team?.name ?? '~').localeCompare(b.team?.name ?? '~', 'pt') || a.fullName.localeCompare(b.fullName, 'pt'))
  }, [employees.data, assignments, readOnly])

  const cell = useMemo(() => {
    const map = new Map<string, Assignment[]>()
    for (const a of assignments) map.set(`${a.employeeId}|${a.date}`, [...(map.get(`${a.employeeId}|${a.date}`) ?? []), a])
    for (const list of map.values()) list.sort((x, y) => x.start.localeCompare(y.start))
    return map
  }, [assignments])

  const open = assignments.find((a) => a.id === openId) ?? null
  const lastChange = changeSets.data?.find((c) => c.canRevert)

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null)
    const a = event.active.data.current?.assignment as Assignment | undefined
    const target = event.over?.data.current as { employeeId: string; date: string } | undefined
    if (!a || !target || (target.employeeId === a.employeeId && target.date === a.date)) return
    void run(
      {
        kind: 'UPDATE',
        items: [{ assignmentId: a.id, version: a.version }],
        employeeId: target.employeeId !== a.employeeId ? target.employeeId : undefined,
        date: target.date !== a.date ? target.date : undefined,
      },
      'Atribuição movida',
    )
  }

  const applyFix = (conflict: Conflict, fix: Fix) => {
    const versions = new Map(assignments.map((a) => [a.id, a.version]))
    const items = (ids: unknown) => ((ids as string[]) ?? []).map((id) => ({ assignmentId: id, version: versions.get(id) }))
    switch (fix.kind) {
      case 'REMOVE_ASSIGNMENTS':
        void run({ kind: 'DELETE', items: items(fix.params.assignmentIds) }, fix.label)
        break
      case 'SET_VEHICLE':
        void run(
          fix.params.vehicleId
            ? { kind: 'BULK_UPDATE', items: items(fix.params.assignmentIds), vehicleId: fix.params.vehicleId as string }
            : { kind: 'BULK_UPDATE', items: items(fix.params.assignmentIds), clearVehicle: true },
          fix.label,
        )
        break
      case 'SET_FOREMAN': {
        const id = fix.params.assignmentId as string
        void run({ kind: 'UPDATE', items: [{ assignmentId: id, version: versions.get(id) }], foreman: true }, fix.label)
        break
      }
      case 'OPEN_SITE':
        navigate(`/obras/${fix.params.siteId as string}`)
        break
      case 'OPEN_DOCUMENTS':
        navigate(`/documentos?employeeId=${fix.params.employeeId as string}`)
        break
    }
    void conflict
  }

  return (
    <>
      <PageHeader
        title={readOnlyView ? 'Escala da semana' : 'Planeamento'}
        description={readOnly ? 'Escala planeada das suas equipas e obras. Alterações são feitas pelo gestor.' : 'Arraste blocos para mudar de dia ou de pessoa. Os conflitos são verificados no servidor antes de gravar.'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <IconButton label="Semana anterior" onClick={() => setWeek(addDaysIso(week, -7))}>
                <ChevronLeft className="size-4" />
              </IconButton>
              <Button variant="ghost" size="sm" onClick={() => setWeek(mondayOf(today))}>
                {formatDate(week)} – {formatDate(days[6])}
              </Button>
              <IconButton label="Semana seguinte" onClick={() => setWeek(addDaysIso(week, 7))}>
                <ChevronRight className="size-4" />
              </IconButton>
            </div>
            {!readOnly && (
              <>
                <Button
                  variant="ghost"
                  icon={<Undo2 />}
                  disabled={!lastChange || busy}
                  title={lastChange ? `Anular: ${lastChange.label}` : 'Sem alterações para anular'}
                  onClick={() =>
                    lastChange &&
                    revert.mutate(lastChange.id, {
                      onSuccess: () => toast.success('Alteração anulada', { description: lastChange.label }),
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  Anular
                </Button>
                <Button variant="secondary" icon={<Copy />} onClick={() => setCopy(true)}>
                  Copiar semana
                </Button>
                <Button variant="primary" icon={<CalendarRange />} onClick={() => setSchedule(true)}>
                  Nova escala
                </Button>
              </>
            )}
          </div>
        }
      />

      {board.isError ? (
        <ErrorState onRetry={() => void board.refetch()}>{errorMessage(board.error)}</ErrorState>
      ) : board.isLoading || employees.isLoading ? (
        <Panel>
          <SkeletonRows rows={8} />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4 xl:flex-row">
          <Panel flush className="min-w-0 flex-1">
            {rows.length === 0 ? (
              <EmptyState icon={<CalendarRange />} title={readOnly ? 'Sem planeamento nesta semana' : 'Ainda não há trabalhadores'}>
                {readOnly ? 'Quando o gestor planear a semana, aparece aqui.' : 'Crie trabalhadores para começar a planear.'}
              </EmptyState>
            ) : (
              <DndContext
                sensors={sensors}
                onDragStart={(e) => setDragging((e.active.data.current?.assignment as Assignment) ?? null)}
                onDragCancel={() => setDragging(null)}
                onDragEnd={onDragEnd}
              >
                <div className="overflow-x-auto" role="grid" aria-label="Planeamento semanal por trabalhador">
                  <div className="min-w-[860px]">
                    <div className={cn('sticky top-0 z-10 grid border-b border-line bg-surface', GRID)} role="row">
                      <div className="px-3 py-2 text-xs font-semibold text-ink-3" role="columnheader">
                        Trabalhador
                      </div>
                      {days.map((d, i) => (
                        <div key={d} role="columnheader" className={cn('border-l border-line-2 px-2 py-1.5', i >= 5 && 'bg-line-2/45')}>
                          <span className={cn('font-condensed text-xs font-semibold uppercase', d === today ? 'text-pinho' : 'text-ink-3')}>{dayLabel(d)}</span>{' '}
                          <span className={cn('font-expanded font-semibold tabular', d === today && 'rounded-xs bg-lima px-1 text-pinho')}>{d.slice(8)}</span>
                        </div>
                      ))}
                    </div>
                    {rows.map((e) => (
                      <div key={e.id} className={cn('grid', GRID)} role="row">
                        <div className="flex min-w-0 flex-col justify-center border-t border-line-2 px-3 py-1.5" role="rowheader">
                          <span className="truncate text-sm font-semibold text-ink">{e.fullName}</span>
                          <span className="truncate text-xs text-ink-3">
                            {e.team ? (
                              <span className="inline-flex items-center gap-1">
                                <span aria-hidden className="size-2 rounded-full" style={{ background: e.team.color }} />
                                {e.team.name}
                              </span>
                            ) : (
                              e.category || 'Sem equipa'
                            )}
                          </span>
                        </div>
                        {days.map((d, i) => {
                          const list = cell.get(`${e.id}|${d}`) ?? []
                          const minutes = list.reduce((s, a) => s + a.plannedMin, 0)
                          return (
                            <Cell
                              key={d}
                              id={`${e.id}|${d}`}
                              data={{ employeeId: e.id, date: d }}
                              weekend={i >= 5}
                              today={d === today}
                              disabled={readOnly}
                              onAdd={readOnly || d < today ? undefined : () => setAssign({ employeeId: e.id, date: d })}
                              addLabel={`Atribuir ${e.fullName} em ${formatDate(d)}`}
                              minutes={minutes}
                            >
                              {list.map((a) => (
                                <Chip
                                  key={a.id}
                                  a={a}
                                  lookups={lookups}
                                  conflicts={byAssignment.get(a.id)}
                                  draggable={!readOnly && a.date >= today}
                                  onOpen={() => setOpenId(a.id)}
                                  context={`${e.fullName}, ${formatDate(d)}`}
                                />
                              ))}
                            </Cell>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                <DragOverlay>{dragging && <Chip a={dragging} lookups={lookups} ghost onOpen={() => {}} />}</DragOverlay>
              </DndContext>
            )}
          </Panel>

          {!readOnly && (
            <Panel title={`Conflitos (${conflicts.length})`} className="xl:w-[340px] xl:shrink-0">
              {conflicts.length === 0 ? (
                <p className="text-sm text-ink-3">Sem conflitos nesta semana.</p>
              ) : (
                <ConflictList conflicts={conflicts}>
                  {(c) =>
                    c.fixes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.fixes.slice(0, 3).map((f) => (
                          <Button key={f.id} size="sm" variant="secondary" disabled={busy} onClick={() => applyFix(c, f)}>
                            {f.label}
                          </Button>
                        ))}
                      </div>
                    )
                  }
                </ConflictList>
              )}
            </Panel>
          )}
        </div>
      )}

      {!readOnly && (
        <>
          <AssignDialog key={assign ? `${assign.employeeId}|${assign.date}` : 'closed'} preset={assign} onClose={() => setAssign(null)} employees={rows} lookups={lookups} run={run} />
          <AssignmentDrawer key={open?.id ?? 'none'} a={open} onClose={() => setOpenId(null)} lookups={lookups} conflicts={open ? byAssignment.get(open.id) : undefined} run={run} />
          <ScheduleDialog open={schedule} onOpenChange={setSchedule} week={week} employees={rows} lookups={lookups} run={run} />
          <CopyWeekDialog open={copy} onOpenChange={setCopy} week={week} lookups={lookups} run={run} />
          {dialog}
        </>
      )}
    </>
  )
}

function Cell({
  id, data, children, weekend, today, disabled, onAdd, addLabel, minutes,
}: {
  id: string
  data: { employeeId: string; date: string }
  children: React.ReactNode
  weekend: boolean
  today: boolean
  disabled: boolean
  onAdd?: () => void
  addLabel: string
  minutes: number
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data, disabled })
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      className={cn(
        'group/cell relative flex min-h-14 flex-col gap-0.5 border-t border-l border-line-2 p-1 pb-2',
        today && 'bg-lima-soft/35',
        weekend && 'bg-line-2/45',
        isOver && 'bg-lima/30 ring-2 ring-lima ring-inset',
      )}
    >
      {children}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          className="mt-auto flex h-5 items-center justify-center rounded-xs text-ink-4 opacity-0 transition-opacity group-hover/cell:opacity-100 hover:bg-line-2 hover:text-ink focus-visible:opacity-100"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      )}
      {minutes > 0 && (
        <span aria-hidden className="absolute inset-x-1 bottom-0.5 h-[3px] overflow-hidden rounded-full bg-line-2">
          <span className={cn('block h-full rounded-full', minutes > 480 ? 'bg-ambar' : 'bg-pinho/55')} style={{ width: `${Math.min(100, (minutes / 480) * 100)}%` }} />
        </span>
      )}
    </div>
  )
}

function Chip({
  a, lookups, conflicts, draggable = false, onOpen, context, ghost,
}: {
  a: Assignment
  lookups: Lookups
  conflicts?: Conflict[]
  draggable?: boolean
  onOpen: () => void
  context?: string
  ghost?: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `a:${a.id}`, data: { assignment: a }, disabled: !draggable || ghost })
  const site = lookups.sites.get(a.siteId)
  const color = site?.color ?? '#7d847f'
  const conflict = conflicts?.find((c) => c.severity === 'BLOCK') ?? conflicts?.[0]
  const vehicle = a.vehicleId ? lookups.vehicles.get(a.vehicleId) : undefined
  const details = `, ${minutesToHours(a.plannedMin)}${a.foreman ? ', responsável' : ''}${vehicle ? `, viatura ${vehicle.plate}` : ''}${conflict ? `. Conflito: ${conflict.title}` : ''}`
  return (
    <button
      ref={ghost ? undefined : setNodeRef}
      type="button"
      {...(ghost ? {} : attributes)}
      {...(ghost ? {} : listeners)}
      onClick={onOpen}
      data-assignment={a.id}
      className={cn(
        'relative flex w-full min-w-0 flex-col overflow-hidden rounded-xs border-l-[3px] bg-surface px-1.5 py-1 text-left hatch [--hatch:color-mix(in_oklab,var(--chip)_22%,transparent)]',
        'focus-visible:outline-2 focus-visible:outline-offset-1',
        conflict?.severity === 'BLOCK' && 'ring-1 ring-tijolo ring-inset',
        conflict?.severity === 'WARN' && 'ring-1 ring-ambar ring-inset',
        isDragging && 'opacity-30',
        draggable && 'cursor-grab active:cursor-grabbing',
        ghost && 'w-36 rotate-[1.5deg] shadow-e2',
      )}
      style={{ ['--chip' as string]: color, borderLeftColor: color }}
    >
      {context && <span className="sr-only">{context}: </span>}
      <span className="truncate font-mono text-[11px] leading-tight font-semibold text-ink">{site?.code ?? 'Obra'}</span>
      <span className="sr-only"> </span>
      <span className="flex items-center gap-1 font-mono text-[10px] leading-tight text-ink-2 tabular">
        {hhmm(a.start)}–{hhmm(a.end)}
        <span className="sr-only">{details}</span>
        {a.foreman && <Crown aria-hidden className="size-2.5 shrink-0 text-ambar-ink" />}
        {vehicle && <Truck aria-hidden className="size-2.5 shrink-0 text-ink-3" />}
      </span>
      {conflict &&
        (conflict.severity === 'BLOCK' ? (
          <AlertOctagon aria-hidden className="absolute top-0.5 right-0.5 size-2.5 text-tijolo" />
        ) : (
          <AlertTriangle aria-hidden className="absolute top-0.5 right-0.5 size-2.5 text-ambar-ink" />
        ))}
    </button>
  )
}

type Run = (command: Command, success?: string) => Promise<CommandResult | null>

function SiteSelect({ value, onChange, lookups, id }: { value: string; onChange: (v: string) => void; lookups: Lookups; id: string }) {
  const options = [...lookups.sites.values()].filter((s) => !s.archived && s.status !== 'DONE')
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Escolha a obra…</option>
      {options.map((s) => (
        <option key={s.id} value={s.id}>
          {s.code} · {s.name}
        </option>
      ))}
    </Select>
  )
}

function VehicleSelect({ value, onChange, lookups, id }: { value: string; onChange: (v: string) => void; lookups: Lookups; id: string }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Viatura da equipa (automática)</option>
      <option value="none">Sem viatura</option>
      {[...lookups.vehicles.entries()].map(([vid, v]) => (
        <option key={vid} value={vid}>
          {v.plate} · {v.seats} lugares
        </option>
      ))}
    </Select>
  )
}

const vehicleFields = (value: string) => (value === 'none' ? { clearVehicle: true } : value ? { vehicleId: value } : {})

function TimeFields({ start, end, setStart, setEnd }: { start: string; end: string; setStart: (v: string) => void; setEnd: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Início">{(p) => <Input {...p} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
      <Field label="Fim" hint={end <= start ? 'Termina no dia seguinte (turno noturno).' : undefined}>
        {(p) => <Input {...p} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}
      </Field>
    </div>
  )
}

function PreviewResult({ result }: { result: CommandResult | undefined }) {
  if (!result) return null
  return (
    <div className="flex flex-col gap-2 rounded-sm bg-line-2/45 p-3 text-sm">
      <p className="font-semibold text-ink">
        Pré-visualização: {result.created} a criar{result.deleted ? `, ${result.deleted} a retirar` : ''}
        {result.skipped.length ? `, ${result.skipped.length} ignorada(s)` : ''}
      </p>
      {result.skipped.length > 0 && (
        <p className="text-ink-3">
          Ignoradas: {[...new Set(result.skipped.map((s) => SKIPPED_LABEL[s.reason]))].join(', ')}.
        </p>
      )}
      {result.newConflicts.length === 0 ? <p className="text-ok">Sem conflitos novos.</p> : <ConflictList conflicts={result.newConflicts} />}
    </div>
  )
}

function AssignDialog({
  preset, onClose, employees, lookups, run,
}: {
  preset: { employeeId?: string; date?: string } | null
  onClose: () => void
  employees: EmployeeSummary[]
  lookups: Lookups
  run: Run
}) {
  const [employeeId, setEmployeeId] = useState(preset?.employeeId ?? '')
  const [date, setDate] = useState(preset?.date ?? todayIso())
  const [siteId, setSiteId] = useState('')
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('17:00')
  const [vehicle, setVehicle] = useState('')
  const [foreman, setForeman] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!employeeId || !siteId) return
    setBusy(true)
    const result = await run({ kind: 'ASSIGN', employeeId, siteId, date, start, end, foreman, ...vehicleFields(vehicle) }, 'Atribuição criada')
    setBusy(false)
    if (result) onClose()
  }
  return (
    <Dialog
      open={!!preset}
      onOpenChange={(o) => !o && onClose()}
      title="Atribuir a uma obra"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy} disabled={!employeeId || !siteId}>
            Atribuir
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Trabalhador">
          {(p) => (
            <Select {...p} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Escolha…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Obra">{(p) => <SiteSelect id={p.id} value={siteId} onChange={setSiteId} lookups={lookups} />}</Field>
        <Field label="Dia">{(p) => <Input {...p} type="date" value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)} />}</Field>
        <TimeFields start={start} end={end} setStart={setStart} setEnd={setEnd} />
        <Field label="Viatura" hint="Por omissão, a viatura ligada à equipa do trabalhador nesse dia.">
          {(p) => <VehicleSelect id={p.id} value={vehicle} onChange={setVehicle} lookups={lookups} />}
        </Field>
        <Checkbox label="Responsável na obra neste dia" checked={foreman} onChange={(e) => setForeman(e.target.checked)} />
      </div>
    </Dialog>
  )
}

function AssignmentDrawer({ a, onClose, lookups, conflicts, run }: { a: Assignment | null; onClose: () => void; lookups: Lookups; conflicts?: Conflict[]; run: Run }) {
  const [siteId, setSiteId] = useState(a?.siteId ?? '')
  const [start, setStart] = useState(a ? hhmm(a.start) : '08:00')
  const [end, setEnd] = useState(a ? hhmm(a.end) : '17:00')
  const [vehicle, setVehicle] = useState(a?.vehicleId ?? 'none')
  const [foreman, setForeman] = useState(a?.foreman ?? false)
  const [note, setNote] = useState(a?.note ?? '')
  const [busy, setBusy] = useState(false)
  if (!a) return null
  const employee = lookups.employees.get(a.employeeId)
  const past = a.date < todayIso()
  const item = [{ assignmentId: a.id, version: a.version }]
  const act = async (command: Command, message: string) => {
    setBusy(true)
    const result = await run(command, message)
    setBusy(false)
    if (result) onClose()
  }
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow={formatDate(a.date)}
      title={employee?.fullName ?? 'Atribuição'}
      description={`${minutesToHours(a.plannedMin)} planeadas · pausa de ${a.breakMin} min`}
      footer={
        past ? undefined : (
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="danger" disabled={busy} onClick={() => void act({ kind: 'DELETE', items: item }, 'Atribuição retirada')}>
                Retirar
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void act({ kind: 'DUPLICATE', items: item, date: addDaysIso(a.date, 1) }, 'Copiada para o dia seguinte')}>
                Copiar para amanhã
              </Button>
            </div>
            <Button
              variant="primary"
              loading={busy}
              onClick={() =>
                void act(
                  {
                    kind: 'UPDATE',
                    items: item,
                    siteId: siteId !== a.siteId ? siteId : undefined,
                    start,
                    end,
                    foreman,
                    note,
                    ...(vehicle === 'none' ? { clearVehicle: true } : vehicle !== a.vehicleId ? { vehicleId: vehicle } : {}),
                  },
                  'Atribuição atualizada',
                )
              }
            >
              Guardar
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {conflicts && conflicts.length > 0 && <ConflictList conflicts={conflicts} />}
        {past ? (
          <p className="text-sm text-ink-3">Dias passados não se alteram no planeamento; as correções fazem-se no registo de horas.</p>
        ) : (
          <>
            <Field label="Obra">{(p) => <SiteSelect id={p.id} value={siteId} onChange={setSiteId} lookups={lookups} />}</Field>
            <TimeFields start={start} end={end} setStart={setStart} setEnd={setEnd} />
            <Field label="Viatura">
              {(p) => (
                <Select {...p} value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
                  <option value="none">Sem viatura</option>
                  {[...lookups.vehicles.entries()].map(([vid, v]) => (
                    <option key={vid} value={vid}>
                      {v.plate} · {v.seats} lugares
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Checkbox label="Responsável na obra neste dia" checked={foreman} onChange={(e) => setForeman(e.target.checked)} />
            <Field label="Observação" optional>
              {(p) => <Textarea {...p} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
          </>
        )}
      </div>
    </Drawer>
  )
}

const WEEKDAYS = [
  { n: 1, l: 'Seg' },
  { n: 2, l: 'Ter' },
  { n: 3, l: 'Qua' },
  { n: 4, l: 'Qui' },
  { n: 5, l: 'Sex' },
  { n: 6, l: 'Sáb' },
  { n: 7, l: 'Dom' },
]

function ScheduleDialog({
  open, onOpenChange, week, employees, lookups, run,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  week: string
  employees: EmployeeSummary[]
  lookups: Lookups
  run: Run
}) {
  const org = useActiveOrg()
  const preview = usePreview(org.id)
  const [team, setTeam] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [siteId, setSiteId] = useState('')
  const [from, setFrom] = useState(week < todayIso() ? todayIso() : week)
  const [to, setTo] = useState(addDaysIso(week, 4))
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5])
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('17:00')
  const [vehicle, setVehicle] = useState('')
  const [foreman, setForeman] = useState('')
  const [busy, setBusy] = useState(false)
  const teams = [...new Map(employees.filter((e) => e.team).map((e) => [e.team!.id, e.team!])).values()]
  const command: Command = { kind: 'SCHEDULE', employeeIds: picked, siteId, from, to, weekdays, start, end, foremanEmployeeId: foreman || null, ...vehicleFields(vehicle) }
  const ready = picked.length > 0 && !!siteId && from <= to
  const reset = () => {
    preview.reset()
    onOpenChange(false)
  }
  const submit = async () => {
    setBusy(true)
    const acks = preview.data?.newConflicts.filter((c) => c.severity === 'WARN').map((c) => c.id) ?? []
    const result = await run({ ...command, acknowledgedConflictIds: acks }, 'Escala criada')
    setBusy(false)
    if (result) reset()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : reset())}
      size="lg"
      title="Nova escala"
      description="Várias pessoas, vários dias, na mesma obra. Pré-visualize para ver os conflitos antes de gravar."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={reset}>
            Cancelar
          </Button>
          <Button variant="secondary" disabled={!ready} loading={preview.isPending} onClick={() => preview.mutate(command)}>
            Pré-visualizar
          </Button>
          <Button variant="primary" disabled={!ready || !preview.data || preview.data.newConflicts.some((c) => c.severity === 'BLOCK')} loading={busy} onClick={() => void submit()}>
            Gravar escala
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {preview.isError && <p className="text-sm text-tijolo">{errorMessage(preview.error)}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Equipa" optional hint="Escolhe todos os membros de uma vez.">
            {(p) => (
              <Select
                {...p}
                value={team}
                onChange={(e) => {
                  setTeam(e.target.value)
                  setPicked(employees.filter((x) => x.team?.id === e.target.value).map((x) => x.id))
                  preview.reset()
                }}
              >
                <option value="">—</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Obra">{(p) => <SiteSelect id={p.id} value={siteId} onChange={(v) => (setSiteId(v), preview.reset())} lookups={lookups} />}</Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-ink">Trabalhadores ({picked.length})</legend>
          <div className="grid max-h-40 gap-1 overflow-y-auto rounded-sm border border-line-2 p-2 sm:grid-cols-2">
            {employees.map((e) => (
              <Checkbox
                key={e.id}
                label={e.fullName}
                checked={picked.includes(e.id)}
                onChange={(ev) => {
                  setPicked(ev.target.checked ? [...picked, e.id] : picked.filter((x) => x !== e.id))
                  preview.reset()
                }}
              />
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="De">{(p) => <Input {...p} type="date" value={from} min={todayIso()} onChange={(e) => (setFrom(e.target.value), preview.reset())} />}</Field>
          <Field label="Até">{(p) => <Input {...p} type="date" value={to} min={from} onChange={(e) => (setTo(e.target.value), preview.reset())} />}</Field>
        </div>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1.5 text-sm font-semibold text-ink">Dias da semana</legend>
          {WEEKDAYS.map((d) => (
            <Checkbox
              key={d.n}
              label={d.l}
              checked={weekdays.includes(d.n)}
              onChange={(e) => {
                setWeekdays(e.target.checked ? [...weekdays, d.n] : weekdays.filter((x) => x !== d.n))
                preview.reset()
              }}
            />
          ))}
        </fieldset>
        <TimeFields start={start} end={end} setStart={(v) => (setStart(v), preview.reset())} setEnd={(v) => (setEnd(v), preview.reset())} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Viatura">{(p) => <VehicleSelect id={p.id} value={vehicle} onChange={(v) => (setVehicle(v), preview.reset())} lookups={lookups} />}</Field>
          <Field label="Responsável" optional>
            {(p) => (
              <Select {...p} value={foreman} onChange={(e) => (setForeman(e.target.value), preview.reset())}>
                <option value="">—</option>
                {picked.map((id) => (
                  <option key={id} value={id}>
                    {lookups.employees.get(id)?.fullName ?? id}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <PreviewResult result={preview.data} />
      </div>
    </Dialog>
  )
}

function CopyWeekDialog({ open, onOpenChange, week, run }: { open: boolean; onOpenChange: (o: boolean) => void; week: string; lookups: Lookups; run: Run }) {
  const org = useActiveOrg()
  const preview = usePreview(org.id)
  const [target, setTarget] = useState(addDaysIso(week, 7))
  const [busy, setBusy] = useState(false)
  const command: Command = { kind: 'COPY_WEEK', sourceWeek: week, targetWeek: mondayOf(target) }
  const close = () => {
    preview.reset()
    onOpenChange(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title="Copiar semana"
      description={`Copia a semana de ${formatDate(week)} para outra semana. Dias passados, pessoas inativas e dias já planeados ficam de fora.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="secondary" loading={preview.isPending} onClick={() => preview.mutate(command)}>
            Pré-visualizar
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!preview.data || preview.data.created === 0 || preview.data.newConflicts.some((c) => c.severity === 'BLOCK')}
            onClick={async () => {
              setBusy(true)
              const acks = preview.data?.newConflicts.filter((c) => c.severity === 'WARN').map((c) => c.id) ?? []
              const result = await run({ ...command, acknowledgedConflictIds: acks }, 'Semana copiada')
              setBusy(false)
              if (result) close()
            }}
          >
            Copiar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {preview.isError && <p className="text-sm text-tijolo">{errorMessage(preview.error)}</p>}
        <Field label="Semana de destino" hint={`Semana de ${formatDate(mondayOf(target))}`}>
          {(p) => <Input {...p} type="date" value={target} onChange={(e) => (setTarget(e.target.value), preview.reset())} />}
        </Field>
        <PreviewResult result={preview.data} />
        {preview.data && preview.data.created === 0 && <Badge tone="warn">Nada a copiar</Badge>}
      </div>
    </Dialog>
  )
}
