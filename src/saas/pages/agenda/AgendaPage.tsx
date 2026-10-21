import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { Button, IconButton } from '@/ui/Button'
import { ChipToggle, Field, Input } from '@/ui/Field'
import { PageHeader } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'
import { ErrorState, SkeletonRows } from '@/ui/States'
import { useCalendarEvent, useCalendarMonth, type CalendarItem, type CalendarLayer, type CalendarTone } from '../../api/calendar'
import { errorMessage, isApiError } from '../../api/http'
import { formatDate, todayIso } from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { ALL_LAYERS, itemsOnDay, linkTarget, monthGrid, shiftMonth, type LayerFilter } from './agendaGrid'

const LAYERS: { key: CalendarLayer; label: string; tone: CalendarTone }[] = [
  { key: 'ABSENCE', label: 'Ausências', tone: 'vacation' },
  { key: 'SITE', label: 'Obras', tone: 'site' },
  { key: 'EXPIRY', label: 'Validades', tone: 'expiring' },
  { key: 'HOLIDAY', label: 'Feriados', tone: 'holiday' },
  { key: 'EVENT', label: 'Eventos', tone: 'event' },
]

const TONE_COLOR: Record<CalendarTone, string> = {
  vacation: 'var(--color-ok)',
  absence: 'var(--color-aco)',
  site: 'var(--color-musgo)',
  late: 'var(--color-tijolo)',
  expired: 'var(--color-tijolo)',
  expiring: 'var(--color-ambar)',
  valid: 'var(--color-ok)',
  holiday: 'var(--color-lima-2)',
  event: 'var(--color-pinho)',
}

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const VISIBLE = 3
const MONTH_LABEL = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const DAY_LONG = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

const monthLabel = (month: string) => MONTH_LABEL.format(new Date(`${month}-01T12:00:00Z`))
const dayLong = (iso: string) => DAY_LONG.format(new Date(`${iso}T12:00:00Z`))
const hhmm = (time: string | null) => (time ? time.slice(0, 5) : null)
const itemColor = (item: CalendarItem) => (item.tone === 'site' && item.color ? item.color : TONE_COLOR[item.tone])
const period = (item: CalendarItem) => (item.start === item.end ? formatDate(item.start) : `${formatDate(item.start)} a ${formatDate(item.end)}`)

/** Agenda do mês: ausências, datas das obras, validades, feriados e eventos próprios, em camadas que se ligam e desligam. */
export function AgendaPage() {
  const org = useActiveOrg()
  const foreman = org.experience === 'encarregado'
  const [params, setParams] = useSearchParams()
  const today = todayIso()
  const month = /^\d{4}-\d{2}$/.test(params.get('mes') ?? '') ? params.get('mes')! : today.slice(0, 7)
  const setMonth = (next: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (next) n.set('mes', next)
        else n.delete('mes')
        return n
      },
      { replace: true },
    )
  const [layers, setLayers] = useState<LayerFilter>(ALL_LAYERS)
  const calendar = useCalendarMonth(org.id, month)
  const items = (calendar.data?.month === month ? calendar.data.items : []).filter((i) => layers[i.layer])
  const weeks = monthGrid(month)
  const [day, setDay] = useState<string | null>(null)
  const [detail, setDetail] = useState<CalendarItem | null>(null)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const open = (item: CalendarItem) => {
    const target = linkTarget(item, foreman)
    if (target) navigate(target)
    else setDetail(item)
  }
  const monthDays = weeks.flat().filter((d) => d.startsWith(month))
  const monthItems = items.filter((i) => i.end >= monthDays[0]! && i.start <= monthDays.at(-1)!)
  const daysWithItems = monthDays.filter((d) => itemsOnDay(items, d).length > 0)

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Agenda"
        description={
          <span className="first-letter:uppercase">
            {monthLabel(month)} · {monthItems.length} {monthItems.length === 1 ? 'marcação' : 'marcações'}
          </span>
        }
        actions={
          <>
            <div className="flex items-center rounded-md border border-line bg-surface">
              <IconButton label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))}>
                <ChevronLeft className="size-4" />
              </IconButton>
              <button type="button" onClick={() => setMonth(null)} className="h-9 border-x border-line px-3 text-sm font-medium hover:bg-cal">
                Hoje
              </button>
              <IconButton label="Mês seguinte" onClick={() => setMonth(shiftMonth(month, 1))}>
                <ChevronRight className="size-4" />
              </IconButton>
            </div>
            {calendar.data?.canManageEvents && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                Novo evento
              </Button>
            )}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Camadas da agenda">
        {LAYERS.map((l) => (
          <ChipToggle key={l.key} pressed={layers[l.key]} onClick={() => setLayers({ ...layers, [l.key]: !layers[l.key] })}>
            <span aria-hidden className="size-2.5 rounded-xs ring-1 ring-white/60" style={{ background: TONE_COLOR[l.tone] }} />
            {l.label}
          </ChipToggle>
        ))}
        {calendar.data && layers.EXPIRY && (
          <span className="text-xs text-ink-3">Validades até {formatDate(calendar.data.expiryHorizon)} (próximos 60 dias).</span>
        )}
      </div>

      {calendar.isError ? (
        <ErrorState onRetry={() => void calendar.refetch()}>{errorMessage(calendar.error)}</ErrorState>
      ) : calendar.isPending ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          {/* Grelha do mês (tablet e desktop) */}
          <div className="hidden overflow-hidden rounded-lg border border-line bg-surface md:block" aria-busy={calendar.isFetching}>
            <div className="grid grid-cols-7 border-b border-line text-xs font-semibold text-ink-3 uppercase" aria-hidden>
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-2 py-1.5">
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]} className="grid grid-cols-7 border-b border-line-2 last:border-0">
                {week.map((d) => {
                  const list = itemsOnDay(items, d)
                  const outside = !d.startsWith(month)
                  return (
                    <div key={d} className={cn('flex min-h-28 min-w-0 flex-col gap-0.5 border-l border-line-2 p-1 first:border-0', outside && 'bg-cal/70')}>
                      <button
                        type="button"
                        onClick={() => setDay(d)}
                        aria-label={`${dayLong(d)}: ${list.length} ${list.length === 1 ? 'marcação' : 'marcações'}`}
                        aria-current={d === today ? 'date' : undefined}
                        className={cn(
                          'mb-0.5 self-start rounded-sm px-1 text-xs font-semibold tabular hover:bg-line-2',
                          outside ? 'text-ink-3' : 'text-ink-2',
                          d === today && 'bg-pinho text-white hover:bg-pinho',
                        )}
                      >
                        {Number(d.slice(8))}
                      </button>
                      {list.slice(0, VISIBLE).map((i) => (
                        <Chip key={i.id} item={i} day={d} onOpen={open} />
                      ))}
                      {list.length > VISIBLE && (
                        <button type="button" onClick={() => setDay(d)} className="self-start px-1 text-[11px] font-medium text-pinho hover:underline">
                          +{list.length - VISIBLE} mais
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          {/* Lista por dia (telemóvel) */}
          <ol className="flex flex-col gap-3 md:hidden">
            {daysWithItems.length === 0 && (
              <li className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-3">Nada marcado neste mês com as camadas escolhidas.</li>
            )}
            {daysWithItems.map((d) => (
              <li key={d} className="rounded-lg border border-line bg-surface p-3">
                <p className={cn('mb-1.5 text-sm font-semibold first-letter:uppercase', d === today ? 'text-pinho' : 'text-ink')}>
                  {dayLong(d)}
                  {d === today && <span className="ml-1.5 text-xs font-medium text-ink-3">(hoje)</span>}
                </p>
                <ul className="flex flex-col gap-1">
                  {itemsOnDay(items, d).map((i) => (
                    <li key={i.id}>
                      <Chip item={i} day={d} onOpen={open} roomy />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}

      {day && (
        <Dialog open onOpenChange={(o) => !o && setDay(null)} size="sm" title={<span className="first-letter:uppercase">{dayLong(day)}</span>} description={`${itemsOnDay(items, day).length} marcações`}>
          {itemsOnDay(items, day).length === 0 ? (
            <p className="text-sm text-ink-3">Nada marcado neste dia.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {itemsOnDay(items, day).map((i) => (
                <li key={i.id}>
                  <Chip
                    item={i}
                    day={day}
                    roomy
                    onOpen={(x) => {
                      setDay(null)
                      open(x)
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
      {detail && <ItemDialog item={detail} canManage={!!calendar.data?.canManageEvents} onClose={() => setDetail(null)} />}
      {creating && <NewEventDialog onClose={() => setCreating(false)} defaultDay={month === today.slice(0, 7) ? today : `${month}-01`} />}
    </div>
  )
}

/** Uma marcação. Os períodos de vários dias continuam de célula para célula (cantos só no início e no fim). */
function Chip({ item, day, onOpen, roomy }: { item: CalendarItem; day: string; onOpen: (i: CalendarItem) => void; roomy?: boolean }) {
  const startsHere = item.start === day || roomy
  const endsHere = item.end === day || roomy
  // Num período que continua, o título repete-se no início de cada semana; nos outros dias fica só a barra.
  const showTitle = startsHere || new Date(`${day}T12:00:00Z`).getUTCDay() === 1
  const color = itemColor(item)
  const style: CSSProperties = { borderLeftColor: startsHere ? color : undefined, background: `color-mix(in oklab, ${color} 14%, white)` }
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      title={item.detail ? `${item.title} — ${item.detail}` : item.title}
      aria-label={`${item.title}${item.time ? `, ${hhmm(item.time)}` : ''}, ${period(item)}${item.late ? ', atrasada' : ''}`}
      className={cn(
        'flex w-full min-w-0 items-center gap-1 border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight text-ink hover:brightness-95',
        roomy && 'rounded-xs py-1.5 text-sm',
        !roomy && (startsHere ? 'rounded-l-xs' : '-ml-1 border-l-0 pl-2'),
        !roomy && (endsHere ? 'rounded-r-xs' : '-mr-1'),
        item.tone === 'late' && 'font-semibold',
      )}
      style={style}
    >
      {item.time && <span className="shrink-0 font-mono tabular text-ink-2">{hhmm(item.time)}</span>}
      {showTitle ? <span className="truncate">{item.title}</span> : <span aria-hidden className="h-[1.1em]" />}
      {roomy && item.start !== item.end && (
        <span className="ml-auto shrink-0 text-xs text-ink-2">
          {formatDate(item.start).slice(0, 5)}–{formatDate(item.end).slice(0, 5)}
        </span>
      )}
    </button>
  )
}

/** Detalhe de um item sem página própria (feriados e eventos); o gestor pode alterar e apagar eventos. */
function ItemDialog({ item, canManage, onClose }: { item: CalendarItem; canManage: boolean; onClose: () => void }) {
  const org = useActiveOrg()
  const action = useCalendarEvent(org.id)
  const event = item.layer === 'EVENT' && item.link?.type === 'EVENT' ? item.link.id : null
  const [editing, setEditing] = useState(false)
  if (editing && event) {
    return (
      <EventFormDialog
        title="Alterar evento"
        submitLabel="Guardar"
        initial={{ title: item.title, startsOn: item.start, endsOn: item.end, time: hhmm(item.time) ?? '', location: item.detail ?? '' }}
        onSubmit={(input) =>
          action.mutate(
            { action: 'update', id: event, input },
            {
              onSuccess: () => {
                toast.success('Evento alterado')
                onClose()
              },
              onError: (e) => {
                if (!isApiError(e, 'validation')) toast.error(errorMessage(e))
              },
            },
          )
        }
        pending={action.isPending}
        error={action.error}
        onClose={onClose}
      />
    )
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      eyebrow={item.layer === 'EVENT' ? 'Evento' : item.layer === 'HOLIDAY' ? 'Feriado' : undefined}
      title={item.title}
      description={`${period(item)}${item.time ? ` · ${hhmm(item.time)}` : ''}`}
      footer={
        event && canManage ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Alterar
            </Button>
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              loading={action.isPending}
              onClick={() =>
                action.mutate(
                  { action: 'delete', id: event },
                  { onSuccess: () => (toast('Evento apagado'), onClose()), onError: (e) => toast.error(errorMessage(e)) },
                )
              }
            >
              Apagar evento
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1.5 text-sm text-ink-2">
        {item.time && (
          <p className="flex items-center gap-1.5">
            <Clock aria-hidden className="size-4 text-ink-3" />
            {hhmm(item.time)}
          </p>
        )}
        {item.layer === 'EVENT' ? (
          <p className="flex items-center gap-1.5">
            <MapPin aria-hidden className="size-4 text-ink-3" />
            {item.detail || 'Sem local indicado.'}
          </p>
        ) : (
          item.detail && <p>{item.detail}</p>
        )}
      </div>
    </Dialog>
  )
}

function NewEventDialog({ onClose, defaultDay }: { onClose: () => void; defaultDay: string }) {
  const org = useActiveOrg()
  const action = useCalendarEvent(org.id)
  return (
    <EventFormDialog
      title="Novo evento"
      description="Reuniões, visitas e entregas da empresa. As férias, as datas das obras e as validades entram sozinhas na agenda."
      submitLabel="Marcar"
      initial={{ title: '', startsOn: defaultDay, endsOn: defaultDay, time: '', location: '' }}
      onSubmit={(input) =>
        action.mutate(
          { action: 'create', input },
          {
            onSuccess: () => {
              toast.success('Evento marcado na agenda', { description: `${input.title} · ${formatDate(input.startsOn)}` })
              onClose()
            },
            onError: (e) => {
              if (!isApiError(e, 'validation')) toast.error(errorMessage(e))
            },
          },
        )
      }
      pending={action.isPending}
      error={action.error}
      onClose={onClose}
    />
  )
}

function EventFormDialog({
  title,
  description,
  submitLabel,
  initial,
  onSubmit,
  pending,
  error,
  onClose,
}: {
  title: string
  description?: string
  submitLabel: string
  initial: { title: string; startsOn: string; endsOn: string; time: string; location: string }
  onSubmit: (input: { title: string; startsOn: string; endsOn: string; time: string | null; location: string | null }) => void
  pending: boolean
  error: unknown
  onClose: () => void
}) {
  const [f, setF] = useState(initial)
  const errors = isApiError(error) ? error.fieldErrors : {}
  const valid = f.title.trim().length >= 2 && !!f.startsOn && (!f.endsOn || f.endsOn >= f.startsOn)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<CalendarDays className="size-4" />}
            disabled={!valid}
            loading={pending}
            onClick={() =>
              onSubmit({
                title: f.title.trim(),
                startsOn: f.startsOn,
                endsOn: f.endsOn || f.startsOn,
                time: f.time || null,
                location: f.location.trim() || null,
              })
            }
          >
            {submitLabel}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Título" error={errors.title} className="sm:col-span-2">
          {(p) => <Input {...p} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Reunião de obra" />}
        </Field>
        <Field label="Dia" error={errors.startsOn}>
          {(p) => <Input {...p} type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value, endsOn: f.endsOn < e.target.value ? e.target.value : f.endsOn })} />}
        </Field>
        <Field label="Até" hint="Para eventos de vários dias" error={errors.endsOn}>
          {(p) => <Input {...p} type="date" min={f.startsOn} value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} />}
        </Field>
        <Field label="Hora" optional>
          {(p) => <Input {...p} type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />}
        </Field>
        <Field label="Local" optional error={errors.location}>
          {(p) => <Input {...p} maxLength={160} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />}
        </Field>
      </div>
      <p className="mt-3 text-xs text-ink-3">
        <Link to="/ausencias?vista=ano" className="underline">
          Ver o mapa de férias do ano
        </Link>
      </p>
    </Dialog>
  )
}
