import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { AlertOctagon, CalendarPlus, CalendarRange, ChevronLeft, ChevronRight, Copy, Search, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { ModuleGuard } from '@/app/ModuleGuard'
import type { ID, ISODate } from '@/domain/types'
import { addDays, dateShort, isoWeek, weekDays, weekLabel, weekStart } from '@/domain/weeks'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { selectConflicts } from '@/store/selectors'
import { demoStore, useDemo } from '@/store/store'
import { Button, IconButton } from '@/ui/Button'
import { Input, Segmented, Select } from '@/ui/Field'
import { PageHeader } from '@/ui/Layout'
import { Drawer } from '@/ui/Overlay'
import { ConflictCard } from '../shared/ConflictCard'
import { AssignmentDetail } from './AssignmentDetail'
import { DayHeader } from './board/DayHeader'
import { ChipGhost } from './board/Chip'
import { SiteRows } from './board/SiteRows'
import { TeamRows } from './board/TeamRows'
import { VehicleRows } from './board/VehicleRows'
import { WorkerRows } from './board/WorkerRows'
import { BulkBar } from './BulkBar'
import { AssignDialog } from './dialogs/AssignDialog'
import { CopyWeekDialog, DuplicateTeamWeekDialog } from './dialogs/CopyWeekDialog'
import { NewScheduleDialog } from './dialogs/NewScheduleDialog'
import { MobilePlanning } from './MobilePlanning'
import { conflictIndex, type Perspective } from './model'
import { MonthBoard } from './MonthBoard'
import { PlanningContext, type AddTarget, type PlanningCtx } from './PlanningContext'
import { Tray } from './Tray'
import { usePlanningParams } from './usePlanningParams'

type DragData =
  | { type: 'assignment'; id: ID }
  | { type: 'site'; siteId: ID }
  | { type: 'worker'; workerId: ID }
  | { type: 'vehicle-block'; vehicleId: ID; date: ISODate; ids: ID[] }

type DropData =
  | { type: 'worker-day'; workerId: ID; date: ISODate }
  | { type: 'site-day'; siteId: ID; date: ISODate }
  | { type: 'vehicle-day'; vehicleId: ID; date: ISODate }

export function PlanningPage() {
  const isMobile = useMediaQuery('(max-width: 767px)')
  return (
    <ModuleGuard
      empty={{
        icon: <CalendarRange />,
        title: 'Sem planeamento',
        text: 'Ainda não há obras nem equipas. Crie uma obra e uma equipa para começar a planear a semana.',
      }}
    >
      {isMobile ? <MobilePlanning /> : <DesktopPlanning />}
    </ModuleGuard>
  )
}

function DesktopPlanning() {
  const params = usePlanningParams()
  const { week, perspective, scale, update } = params
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const undo = useDemo((s) => s.undo)
  const canUndo = useDemo((s) => s.undoStack.length > 0)
  const days = useMemo(() => weekDays(week), [week])
  const conflicts = useDerived((s) => selectConflicts(s, { from: week, to: addDays(week, 6) }), [week])
  const byAssignment = useMemo(() => conflictIndex(conflicts), [conflicts])

  const [selected, setSelected] = useState<Set<ID>>(new Set())
  const [detail, setDetail] = useState<ID | null>(null)
  const [recent, setRecent] = useState<Set<ID>>(new Set())
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null)
  const [copyOpen, setCopyOpen] = useState<{ teamIds?: ID[] } | null>(null)
  const [dupTeam, setDupTeam] = useState<ID | null>(null)
  const [active, setActive] = useState<DragData | null>(null)
  const altDown = useRef(false)
  const panelOpen = params.panel === 'conflitos' || detail !== null
  const wide = useMediaQuery('(min-width: 1280px)')
  const xwide = useMediaQuery('(min-width: 1680px)')

  const focusConflict = conflicts.find((c) => c.id === params.focus)
  const focusIds = useMemo(() => new Set(focusConflict?.assignmentIds ?? []), [focusConflict])

  useEffect(() => {
    const first = focusConflict?.assignmentIds[0]
    if (first) document.querySelector(`[data-assignment="${first}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }, [focusConflict])

  useEffect(() => {
    if (recent.size === 0) return
    const t = setTimeout(() => setRecent(new Set()), 2400)
    return () => clearTimeout(t)
  }, [recent])

  // Atalhos: Ctrl+Z anula; Alt durante o arrasto copia; Esc limpa a seleção.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') altDown.current = true
      const tag = (e.target as HTMLElement)?.tagName
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        e.preventDefault()
        const label = demoStore.getState().undo()
        if (label) toast(`Anulado: ${label.toLowerCase()}`)
      }
      if (e.key === 'Escape') setSelected(new Set())
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') altDown.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const select = useCallback((id: ID, additive: boolean) => {
    setSelected((prev) => {
      const next = new Set(additive ? prev : [])
      if (prev.has(id) && additive) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const open = useCallback((id: ID) => {
    setSelected(new Set())
    setDetail(id)
  }, [])

  const ctx: PlanningCtx = {
    db,
    today,
    days,
    conflictsByAssignment: byAssignment,
    focusIds,
    recentIds: recent,
    selected,
    select,
    open,
    add: setAddTarget,
    filterSite: params.site,
    filterTeam: params.team,
    query: params.query,
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))

  const labelOf = (d: DragData | null): string => {
    if (!d) return ''
    if (d.type === 'assignment') {
      const a = db.assignments[d.id]
      return a ? `${db.workers[a.workerId]?.name} em ${db.sites[a.siteId]?.code}` : 'atribuição'
    }
    if (d.type === 'site') return `obra ${db.sites[d.siteId]?.code}`
    if (d.type === 'worker') return db.workers[d.workerId]?.name ?? 'trabalhador'
    return `viatura ${db.vehicles[d.vehicleId]?.plate}`
  }
  const targetLabel = (t: DropData | undefined) => {
    if (!t) return ''
    const day = `${dateShort(t.date)}`
    if (t.type === 'worker-day') return `${db.workers[t.workerId]?.name}, ${day}`
    if (t.type === 'site-day') return `${db.sites[t.siteId]?.code}, ${day}`
    return `${db.vehicles[t.vehicleId]?.plate}, ${day}`
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `A mover ${labelOf(active.data.current as DragData)}. Use as setas e Espaço para largar, Escape para cancelar.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.data.current as DragData)} sobre ${targetLabel(over.data.current as DropData)}` : 'Fora de uma célula'),
    onDragEnd: ({ active, over }) => (over ? `${labelOf(active.data.current as DragData)} largado em ${targetLabel(over.data.current as DropData)}` : 'Arrasto cancelado'),
    onDragCancel: () => 'Arrasto cancelado',
  }

  const onDragStart = (e: DragStartEvent) => setActive(e.active.data.current as DragData)
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null)
    const src = e.active.data.current as DragData | undefined
    const dst = e.over?.data.current as DropData | undefined
    if (!src || !dst) return
    const s = demoStore.getState()
    const before = new Set(selectConflicts(s, { from: week, to: addDays(week, 6) }).map((c) => c.id))
    const copy = altDown.current
    let msg = ''
    try {
      if (src.type === 'assignment') {
        const a = s.db.assignments[src.id]
        if (!a) return
        if (dst.type === 'worker-day') {
          if (a.workerId === dst.workerId && a.date === dst.date) return
          const nid = s.moveAssignment(src.id, { workerId: dst.workerId, date: dst.date }, copy)
          setRecent(new Set([nid]))
          msg = `${copy ? 'Copiado' : 'Movido'} para ${db.workers[dst.workerId]?.name}, ${dateShort(dst.date)}`
        } else if (dst.type === 'site-day') {
          if (a.siteId === dst.siteId && a.date === dst.date) return
          const nid = s.moveAssignment(src.id, { siteId: dst.siteId, date: dst.date }, copy)
          setRecent(new Set([nid]))
          msg = `${copy ? 'Copiado' : 'Movido'} para ${db.sites[dst.siteId]?.code}, ${dateShort(dst.date)}`
        }
      } else if (src.type === 'site' && dst.type === 'worker-day') {
        const nid = s.assign({ workerId: dst.workerId, siteId: src.siteId, date: dst.date })
        setRecent(new Set([nid]))
        msg = `${db.workers[dst.workerId]?.name} atribuído a ${db.sites[src.siteId]?.code}, ${dateShort(dst.date)}`
      } else if (src.type === 'worker' && dst.type === 'site-day') {
        const nid = s.assign({ workerId: src.workerId, siteId: dst.siteId, date: dst.date })
        setRecent(new Set([nid]))
        msg = `${db.workers[src.workerId]?.name} atribuído a ${db.sites[dst.siteId]?.code}, ${dateShort(dst.date)}`
      } else if (src.type === 'vehicle-block' && dst.type === 'vehicle-day') {
        if (src.vehicleId === dst.vehicleId) return
        if (src.date !== dst.date) {
          toast.error('Só pode trocar de viatura no mesmo dia.')
          return
        }
        s.bulkUpdate(src.ids, { vehicleId: dst.vehicleId })
        msg = `Viatura trocada para ${db.vehicles[dst.vehicleId]?.plate}`
      } else return
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível concluir.')
      return
    }
    const after = selectConflicts(demoStore.getState(), { from: week, to: addDays(week, 6) }).filter((c) => !before.has(c.id))
    if (after.length) {
      toast.warning(msg, {
        description: `Criou ${after.length === 1 ? 'um conflito' : `${after.length} conflitos`}: ${after[0]!.title}`,
        action: { label: 'Anular', onClick: () => undo() },
      })
      update({ painel: 'conflitos' })
    } else {
      toast.success(msg, { action: { label: 'Anular', onClick: () => undo() } })
    }
  }

  const ghost =
    active?.type === 'assignment'
      ? (() => {
          const a = db.assignments[active.id]
          return a ? <ChipGhost label={`${db.sites[a.siteId]?.code} · ${db.workers[a.workerId]?.name.split(' ')[0]}`} color={db.sites[a.siteId]?.color ?? '#999'} hours={a.hours} /> : null
        })()
      : active?.type === 'site'
        ? <ChipGhost label={db.sites[active.siteId]?.code ?? ''} color={db.sites[active.siteId]?.color ?? '#999'} />
        : active?.type === 'worker'
          ? <ChipGhost label={db.workers[active.workerId]?.name ?? ''} color="#13342a" />
          : active?.type === 'vehicle-block'
            ? <ChipGhost label={db.vehicles[active.vehicleId]?.plate ?? ''} color="#13342a" />
            : null

  const totals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const a of Object.values(db.assignments)) if (days.includes(a.date)) t[a.date] = (t[a.date] ?? 0) + a.hours
    return t
  }, [db, days])

  const panelBody =
    detail !== null ? (
      <AssignmentDetail key={detail} id={detail} onClose={() => setDetail(null)} />
    ) : (
      <div className="flex flex-col gap-2" data-tour="conflicts-panel">
        {conflicts.length === 0 ? (
          <p className="rounded-md bg-ok-soft px-3 py-2.5 text-sm font-medium text-ok">Sem conflitos nesta semana.</p>
        ) : (
          conflicts.map((c) => (
            <ConflictCard
              key={c.id}
              conflict={c}
              onFocus={(x) => update({ foco: x.id, semana: x.date ? weekStart(x.date) : week })}
              className={params.focus === c.id ? 'ring-2 ring-pinho' : undefined}
            />
          ))
        )}
      </div>
    )
  const panelTitle = detail !== null ? 'Atribuição' : `Conflitos · semana ${isoWeek(week)}`
  const closePanel = () => {
    setDetail(null)
    update({ painel: null, foco: null })
  }

  return (
    <PlanningContext.Provider value={ctx}>
      <div className="mx-auto max-w-[1680px]">
        <PageHeader
          eyebrow={`Semana ${isoWeek(week)} · ${weekLabel(week)}`}
          title="Planeamento"
          actions={
            <>
              <Button icon={<Undo2 className="size-4" />} variant="ghost" disabled={!canUndo} onClick={() => { const l = undo(); if (l) toast(`Anulado: ${l.toLowerCase()}`) }} title="Anular (Ctrl+Z)">
                Anular
              </Button>
              <Button icon={<Copy className="size-4" />} onClick={() => setCopyOpen({})} data-tour="copy-week">
                Copiar semana anterior
              </Button>
              <Button variant="primary" icon={<CalendarPlus className="size-4" />} onClick={() => update({ nova: 'escala' })} data-tour="new-schedule">
                Nova escala
              </Button>
            </>
          }
        />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-line bg-surface">
            <IconButton label="Semana anterior" size="md" onClick={() => update({ semana: addDays(week, scale === 'mes' ? -28 : -7), foco: null })}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <button type="button" onClick={() => update({ semana: null, foco: null })} className="h-9 border-x border-line px-3 text-sm font-medium hover:bg-cal">
              Hoje
            </button>
            <IconButton label="Semana seguinte" size="md" onClick={() => update({ semana: addDays(week, scale === 'mes' ? 28 : 7), foco: null })}>
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
          <Segmented
            label="Escala de tempo"
            value={scale}
            onChange={(v) => update({ escala: v === 'semana' ? null : v })}
            options={[
              { value: 'semana', label: 'Semana' },
              { value: 'mes', label: 'Mês' },
            ]}
          />
          <Segmented<Perspective>
            label="Perspetiva"
            value={perspective}
            onChange={(v) => update({ vista: v === 'trabalhadores' ? null : v })}
            options={[
              { value: 'trabalhadores', label: 'Trabalhadores' },
              { value: 'equipas', label: 'Equipas' },
              { value: 'obras', label: 'Obras' },
              { value: 'viaturas', label: 'Viaturas' },
            ]}
          />
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
            <label htmlFor="plan-q" className="sr-only">
              Filtrar
            </label>
            <Input id="plan-q" value={params.query} onChange={(e) => update({ q: e.target.value })} placeholder="Filtrar…" className="h-9 w-32 pl-8 text-sm" />
          </div>
          <label htmlFor="plan-team" className="sr-only">
            Equipa
          </label>
          <Select id="plan-team" value={params.team ?? ''} onChange={(e) => update({ equipa: e.target.value })} className="h-9 w-36 text-sm">
            <option value="">Todas as equipas</option>
            {Object.values(db.teams).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <label htmlFor="plan-site" className="sr-only">
            Obra
          </label>
          <Select id="plan-site" value={params.site ?? ''} onChange={(e) => update({ obra: e.target.value })} className="h-9 w-40 text-sm">
            <option value="">Todas as obras</option>
            {Object.values(db.sites).map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </Select>
          {(params.team || params.site || params.query) && (
            <Button variant="ghost" size="sm" icon={<X className="size-3.5" />} onClick={() => update({ equipa: null, obra: null, q: null })}>
              Limpar filtros
            </Button>
          )}
          <Button
            className="ml-auto"
            variant={params.panel === 'conflitos' ? 'primary' : 'secondary'}
            icon={<AlertOctagon className="size-4" />}
            aria-pressed={params.panel === 'conflitos'}
            onClick={() => {
              setDetail(null)
              update({ painel: params.panel === 'conflitos' ? null : 'conflitos' })
            }}
            data-tour="conflicts-toggle"
          >
            Conflitos
            <span className={conflicts.length ? 'rounded-xs bg-tijolo px-1 text-[11px] text-white tabular' : 'text-ink-3 tabular'}>{conflicts.length}</span>
          </Button>
        </div>

        <div className="flex overflow-hidden rounded-lg border border-line bg-surface">
          {scale === 'semana' && (perspective === 'trabalhadores' || perspective === 'obras') && (!panelOpen || xwide) && (
            <div className="hidden lg:flex">
              <Tray perspective={perspective} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {scale === 'mes' ? (
              <MonthBoard week={week} perspective={perspective} onOpenWeek={(d) => update({ semana: d, escala: null })} />
            ) : (
              <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)} accessibility={{ announcements, screenReaderInstructions: { draggable: 'Para mover, carregue em Espaço. Use as setas para escolher o destino e Espaço para largar. Escape cancela.' } }}>
                <div className="max-h-[calc(100dvh-15rem)] overflow-auto" role="grid" aria-label={`Planeamento da semana ${isoWeek(week)} por ${perspective}`} data-tour="board">
                  <div className="min-w-[860px]">
                    <DayHeader label={{ trabalhadores: 'Trabalhador', equipas: 'Equipa', obras: 'Obra', viaturas: 'Viatura' }[perspective]} totals={totals} />
                    {perspective === 'trabalhadores' && <WorkerRows onDuplicateTeam={setDupTeam} onCopyTeam={(t) => setCopyOpen({ teamIds: [t] })} />}
                    {perspective === 'obras' && <SiteRows />}
                    {perspective === 'equipas' && <TeamRows />}
                    {perspective === 'viaturas' && <VehicleRows />}
                  </div>
                </div>
                <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)' }}>{ghost}</DragOverlay>
              </DndContext>
            )}
          </div>
          {panelOpen && wide && (
            <aside aria-label={panelTitle} className="flex w-[360px] shrink-0 flex-col border-l border-line animate-drawer-in">
              <div className="flex items-center justify-between border-b border-line-2 px-4 py-2.5">
                <h2 className="font-wide text-sm font-semibold">{panelTitle}</h2>
                <IconButton label="Fechar painel" size="sm" onClick={closePanel}>
                  <X className="size-4" />
                </IconButton>
              </div>
              <div className="max-h-[calc(100dvh-15rem)] overflow-y-auto p-3">{panelBody}</div>
            </aside>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-3">
          Arraste para mover · Alt + arrastar para copiar · Shift + clique para selecionar vários · Ctrl+Z para anular · + em cada dia para atribuir pelo teclado
        </p>
      </div>

      {panelOpen && !wide && (
        <Drawer open onOpenChange={(o) => !o && closePanel()} title={panelTitle} size="md">
          {panelBody}
        </Drawer>
      )}
      <BulkBar ids={[...selected]} onClear={() => setSelected(new Set())} />
      {addTarget && (
        <AssignDialog
          open
          onOpenChange={(o) => !o && setAddTarget(null)}
          days={days}
          workerId={addTarget.workerId}
          siteId={addTarget.siteId}
          date={addTarget.date}
          onCreated={(ids) => setRecent(new Set(ids))}
        />
      )}
      {params.newSchedule && (
        <NewScheduleDialog
          open
          onOpenChange={(o) => !o && update({ nova: null })}
          initialWeek={week}
          onCreated={(w, ids) => {
            update({ semana: w, nova: null })
            setRecent(new Set(ids))
          }}
        />
      )}
      {copyOpen && <CopyWeekDialog open onOpenChange={(o) => !o && setCopyOpen(null)} targetWeek={week} teamIds={copyOpen.teamIds} />}
      {dupTeam && <DuplicateTeamWeekDialog open onOpenChange={(o) => !o && setDupTeam(null)} teamId={dupTeam} week={week} />}
    </PlanningContext.Provider>
  )
}

