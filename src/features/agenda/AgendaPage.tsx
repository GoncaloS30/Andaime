import { CalendarDays, ChevronLeft, ChevronRight, Link2, Plus, RefreshCw, Trash2, Unlink } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { agendaItems, itemsOnDay, monthGrid, type AgendaItem, type AgendaLayers } from '@/domain/agenda'
import { dateLong, dateShort, dayShort, monthLabel } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Badge } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { ChipToggle, Field, Input } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'

const LAYERS: { key: keyof AgendaLayers; label: string }[] = [
  { key: 'ausencias', label: 'Ausências' },
  { key: 'obras', label: 'Datas das obras' },
  { key: 'validades', label: 'Validades' },
  { key: 'eventos', label: 'Eventos' },
  { key: 'google', label: 'Google' },
]
const VISIBLE = 3

function shiftMonth(month: string, d: number) {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const t = new Date(Date.UTC(y, m - 1 + d, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Agenda do mês: ausências, datas das obras, validades, eventos próprios e Google (simulado), em camadas. */
export function AgendaPage() {
  const [sp, setSp] = useSearchParams()
  const today = useDemo((s) => s.session.today)
  const month = sp.get('mes') ?? today.slice(0, 7)
  const setMonth = (m: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (m) n.set('mes', m); else n.delete('mes'); return n }, { replace: true })
  const [layers, setLayers] = useState<AgendaLayers>({ ausencias: true, obras: true, validades: true, eventos: true, google: true })
  const weeks = monthGrid(month)
  const items = useDerived(({ db }) => agendaItems(db, weeks[0]![0]!, weeks.at(-1)!.at(-1)!, layers), [month, ...Object.values(layers)])
  const [day, setDay] = useState<string | null>(null)
  const [event, setEvent] = useState<AgendaItem | null>(null)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const open = (i: AgendaItem) => (i.link ? navigate(i.link) : setEvent(i))
  const monthItems = items.filter((i) => i.end >= `${month}-01` && i.start <= `${month}-31`)
  const daysWithItems = [...new Set(weeks.flat().filter((d) => d.startsWith(month) && itemsOnDay(items, d).length))]

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Agenda"
        description={`${monthLabel(`${month}-01`)} · ${monthItems.length} ${monthItems.length === 1 ? 'marcação' : 'marcações'}`}
        actions={
          <>
            <div className="flex items-center rounded-md border border-line bg-surface">
              <IconButton label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="size-4" /></IconButton>
              <button type="button" onClick={() => setMonth(null)} className="h-9 border-x border-line px-3 text-sm font-medium hover:bg-cal">Este mês</button>
              <IconButton label="Mês seguinte" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="size-4" /></IconButton>
            </div>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Novo evento</Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Camadas">
        {LAYERS.map((l) => (
          <ChipToggle key={l.key} pressed={layers[l.key]} onClick={() => setLayers({ ...layers, [l.key]: !layers[l.key] })}>{l.label}</ChipToggle>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Grelha do mês (tablet e desktop) */}
        <div className="hidden overflow-hidden rounded-lg border border-line bg-surface md:block">
          <div className="grid grid-cols-7 border-b border-line text-xs font-semibold text-ink-3 uppercase">
            {weeks[0]!.map((d) => <div key={d} className="px-2 py-1.5 font-condensed">{dayShort(d)}</div>)}
          </div>
          {weeks.map((w) => (
            <div key={w[0]} className="grid grid-cols-7 border-b border-line-2 last:border-0">
              {w.map((d) => {
                const list = itemsOnDay(items, d)
                const outside = !d.startsWith(month)
                return (
                  <div key={d} className={cn('flex min-h-28 min-w-0 flex-col gap-0.5 border-l border-line-2 p-1 first:border-0', outside && 'bg-cal/60')}>
                    <button
                      type="button"
                      onClick={() => setDay(d)}
                      aria-label={`${dateLong(d)}: ${list.length} ${list.length === 1 ? 'marcação' : 'marcações'}`}
                      className={cn('mb-0.5 self-start rounded-sm px-1 text-xs font-semibold tabular hover:bg-line-2', outside ? 'text-ink-3' : 'text-ink-2', d === today && 'bg-pinho text-white hover:bg-pinho')}
                    >
                      {Number(d.slice(8))}
                    </button>
                    {list.slice(0, VISIBLE).map((i) => <Chip key={i.id} item={i} day={d} onOpen={open} />)}
                    {list.length > VISIBLE && (
                      <button type="button" onClick={() => setDay(d)} className="self-start px-1 text-[11px] font-medium text-pinho hover:underline">+{list.length - VISIBLE} mais</button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {/* Lista por dia (telemóvel) */}
        <ol className="flex flex-col gap-3 md:hidden">
          {daysWithItems.length === 0 && <li className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-3">Nada marcado neste mês com as camadas escolhidas.</li>}
          {daysWithItems.map((d) => (
            <li key={d} className="rounded-lg border border-line bg-surface p-3">
              <p className={cn('mb-1.5 text-sm font-semibold first-letter:uppercase', d === today && 'text-pinho')}>{dateLong(d)}</p>
              <ul className="flex flex-col gap-1">{itemsOnDay(items, d).map((i) => <li key={i.id}><Chip item={i} day={d} onOpen={open} roomy /></li>)}</ul>
            </li>
          ))}
        </ol>
        <GooglePanel />
      </div>

      {day && (
        <Dialog open onOpenChange={(o) => !o && setDay(null)} size="sm" title={dateLong(day)} description={`${itemsOnDay(items, day).length} marcações`}>
          <ul className="flex flex-col gap-1">{itemsOnDay(items, day).map((i) => <li key={i.id}><Chip item={i} day={day} onOpen={(x) => { setDay(null); open(x) }} roomy /></li>)}</ul>
        </Dialog>
      )}
      {event && <EventDialog item={event} onClose={() => setEvent(null)} />}
      {creating && <NewEventDialog onClose={() => setCreating(false)} />}
    </div>
  )
}

/** Uma marcação na grelha. Os períodos de vários dias continuam de célula para célula (cantos só no início e no fim). */
function Chip({ item, day, onOpen, roomy }: { item: AgendaItem; day: string; onOpen: (i: AgendaItem) => void; roomy?: boolean }) {
  const startsHere = item.start === day || roomy
  const endsHere = item.end === day || roomy
  // Num período que continua, o título só se repete no início de cada semana; nos outros dias fica a barra.
  const showTitle = startsHere || new Date(`${day}T12:00:00Z`).getUTCDay() === 1
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      title={item.title}
      aria-label={showTitle ? undefined : item.title}
      className={cn(
        'flex w-full min-w-0 items-center gap-1 border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight text-ink hover:brightness-95',
        roomy && 'py-1.5 text-sm',
        startsHere ? 'rounded-l-xs' : '-ml-1 border-l-0 pl-2',
        endsHere ? 'rounded-r-xs' : '-mr-1',
      )}
      style={{ borderLeftColor: startsHere ? item.color : undefined, background: `color-mix(in oklab, ${item.color} 14%, white)` }}
    >
      {item.time && <span className="shrink-0 font-mono tabular text-ink-2">{item.time}</span>}
      {showTitle ? <span className="truncate">{item.title}</span> : <span aria-hidden className="h-[1.1em]" />}
      {roomy && item.start !== item.end && <span className="ml-auto shrink-0 text-xs text-ink-2">{dateShort(item.start)}–{dateShort(item.end)}</span>}
    </button>
  )
}

function GooglePanel() {
  const g = useDemo((s) => s.db.integrations.google)
  const connect = useDemo((s) => s.connectGoogle)
  const sync = useDemo((s) => s.syncVacationsToGoogle)
  return (
    <Panel
      title="Google Calendar"
      actions={<Badge tone="info">Simulado</Badge>}
      description="Demonstração: não liga a nenhuma conta real e nunca pede credenciais."
      className="h-fit"
    >
      {g.connected ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ok">Ligado. Os eventos da conta aparecem na camada Google.</p>
          <Button
            icon={<RefreshCw className="size-4" />}
            onClick={() => {
              const r = sync()
              toast.success('Férias sincronizadas com o Google', { description: `${r.created} ${r.created === 1 ? 'nova' : 'novas'} · ${r.existing} já lá ${r.existing === 1 ? 'estava' : 'estavam'}. Repetir não duplica.` })
            }}
          >
            Sincronizar férias
          </Button>
          {g.lastSync && <p className="text-xs text-ink-3">Última sincronização: {dateShort(g.lastSync.slice(0, 10))}, {g.lastSync.slice(11, 16)}</p>}
          <Button variant="ghost" icon={<Unlink className="size-4" />} onClick={() => { connect(false); toast('Conta Google desligada (simulado)') }}>Desligar conta</Button>
        </div>
      ) : (
        <Button icon={<Link2 className="size-4" />} onClick={() => { connect(true); toast.success('Conta Google ligada (simulado)') }}>Ligar conta Google</Button>
      )}
    </Panel>
  )
}

function EventDialog({ item, onClose }: { item: AgendaItem; onClose: () => void }) {
  const ev = useDemo((s) => s.db.events[item.id.replace(/^ev-/, '')])
  const remove = useDemo((s) => s.removeEvent)
  const undo = useDemo((s) => s.undo)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      eyebrow={item.kind === 'google' ? 'Google Calendar (simulado)' : 'Evento'}
      title={item.title}
      description={`${dateShort(item.start)}${item.end !== item.start ? ` a ${dateShort(item.end)}` : ''}${item.time ? ` · ${item.time}` : ''}`}
      footer={
        ev?.source === 'andaime' ? (
          <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => { remove(ev.id); onClose(); toast('Evento apagado', { action: { label: 'Anular', onClick: () => undo() } }) }}>Apagar evento</Button>
        ) : undefined
      }
    >
      <p className="text-sm text-ink-2">{ev?.location || 'Sem local indicado.'}</p>
    </Dialog>
  )
}

function NewEventDialog({ onClose }: { onClose: () => void }) {
  const today = useDemo((s) => s.session.today)
  const create = useDemo((s) => s.createEvent)
  const [f, setF] = useState({ title: '', date: today, endDate: today, time: '', location: '' })
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    try {
      create({ title: f.title, date: f.date, endDate: f.endDate < f.date ? f.date : f.endDate, time: f.time || null, location: f.location })
      toast.success('Evento marcado na agenda', { description: `${f.title} · ${dateShort(f.date)}` })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar o evento.')
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Novo evento"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" icon={<CalendarDays className="size-4" />} onClick={save}>Marcar</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Título" error={error} className="sm:col-span-2">{(p) => <Input {...p} value={f.title} onChange={(e) => { setF({ ...f, title: e.target.value }); setError(null) }} placeholder="Reunião de obra" />}</Field>
        <Field label="Dia">{(p) => <Input {...p} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}</Field>
        <Field label="Até" hint="Para eventos de vários dias">{(p) => <Input {...p} type="date" value={f.endDate} min={f.date} onChange={(e) => setF({ ...f, endDate: e.target.value })} />}</Field>
        <Field label="Hora" optional>{(p) => <Input {...p} type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />}</Field>
        <Field label="Local" optional>{(p) => <Input {...p} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />}</Field>
      </div>
      <p className="mt-3 text-xs text-ink-3">As férias e as datas das obras entram sozinhas na agenda. <Link to="/ausencias?vista=ano" className="underline">Ver o mapa de férias</Link>.</p>
    </Dialog>
  )
}
