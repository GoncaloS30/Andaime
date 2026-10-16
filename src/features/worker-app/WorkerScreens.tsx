import { CalendarClock, Check, ChevronRight, Coffee, FileUp, LogIn, LogOut, MapPin, Phone, Send, Truck, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { DOC_STATE_LABEL, workerCompliance } from '@/domain/documents'
import { entryHours, formatHours, toMinutes, workedMinutes } from '@/domain/hours'
import { ABSENCE_STATUS, ABSENCE_TYPE, DELIVERY_STATUS, ENTRY_STATUS } from '@/domain/labels'
import type { AbsenceType } from '@/domain/types'
import { addDays, dateLong, dateShort, dayShort, weekDays, weekStart } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'
import { selectNotifications, selectWorkerView } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Badge, Plate } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { EmptyState } from '@/ui/States'
import { DocumentDialog } from '../shared/DocumentDialog'

export type WorkerTab = 'hoje' | 'proximas' | 'semana' | 'ausencias' | 'documentos' | 'notificacoes' | 'perfil'

function Card({ children, className, accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  return <section className={cn('rounded-lg border border-line bg-surface p-4', accent && 'border-l-4', className)} style={accent ? { borderLeftColor: accent } : undefined}>{children}</section>
}

const BIG = 'h-14 w-full rounded-lg text-md font-semibold'

/** Hoje: onde trabalho, com quem, e o ponto (entrada, pausas, saída). */
export function TodayScreen({ go }: { go: (t: WorkerTab) => void }) {
  const view = useDerived(selectWorkerView)
  const today = useDemo((s) => s.session.today)
  const settings = useDemo((s) => s.session.settings)
  const outbox = useDemo((s) => s.session.outbox)
  const online = useDemo((s) => s.session.online)
  const clockIn = useDemo((s) => s.clockIn)
  const startBreak = useDemo((s) => s.startBreak)
  const endBreak = useDemo((s) => s.endBreak)
  const clockOut = useDemo((s) => s.clockOut)
  const now = useNow()
  const { db, todayAssignments: list, todayEntry: e, worker } = view
  const a = list[0]
  const site = a ? db.sites[a.siteId] : undefined
  const foreman = site?.foremanId ? db.workers[site.foremanId] : undefined
  const mates = a ? Object.values(db.assignments).filter((x) => x.siteId === a.siteId && x.date === today && x.workerId !== worker?.id).map((x) => db.workers[x.workerId]!).filter(Boolean) : []
  const pendingKinds = new Set(outbox.map((o) => o.kind))
  const run = (fn: () => void, msg: string) => {
    try {
      fn()
      toast.success(msg, { description: online ? undefined : 'Sem rede: fica guardado no telemóvel até sincronizar.' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível registar.')
    }
  }
  const worked = e ? workedMinutes(e, now) : 0

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-3 first-letter:uppercase">{dateLong(today)}</p>
      {!a ? (
        <Card>
          <EmptyState compact icon={<CalendarClock />} title="Sem trabalho atribuído hoje" action={<Button onClick={() => go('proximas')}>Ver próximas atribuições</Button>}>
            {view.upcoming[0] ? `Próxima: ${db.sites[view.upcoming[0].siteId]?.name}, ${dayShort(view.upcoming[0].date)} ${dateShort(view.upcoming[0].date)}.` : 'Ainda não há escala publicada.'}
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card accent={site?.color}>
            <p className="font-mono text-xs font-semibold text-ink-3">{site?.code}</p>
            <h2 className="font-expanded text-xl leading-tight font-semibold">{site?.name}</h2>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{site?.address}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-ink-3">Horário</dt><dd className="font-semibold tabular">{a.start}–{a.end}</dd></div>
              <div><dt className="text-xs text-ink-3">Viatura</dt><dd>{a.vehicleId ? <span className="flex items-center gap-1"><Truck className="size-3.5" aria-hidden /><Plate plate={db.vehicles[a.vehicleId]?.plate ?? ''} /></span> : 'Transporte próprio'}</dd></div>
            </dl>
            {a.note && <p className="mt-3 rounded-md bg-cal px-3 py-2 text-sm">{a.note}</p>}
            {foreman && (
              <a href={`tel:${foreman.phone.replace(/\s/g, '')}`} className="mt-3 flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
                <Phone className="size-4 text-pinho" aria-hidden />
                <span className="flex-1">Encarregado: <strong>{foreman.name}</strong></span>
                <ChevronRight className="size-4 text-ink-4" aria-hidden />
              </a>
            )}
            {mates.length > 0 && (
              <p className="mt-3 flex items-center gap-2 text-xs text-ink-3">
                <Users className="size-3.5" aria-hidden />
                <span className="flex -space-x-1">{mates.slice(0, 5).map((m) => <Avatar key={m.id} name={m.name} size="xs" ring />)}</span>
                Com {mates.length} colegas
              </p>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-wide text-base font-semibold">Ponto</h2>
              {e && (
                <span className="text-xs text-ink-3">
                  {e.status === 'aberto' ? (e.breakStartedAt ? `Em pausa desde ${e.breakStartedAt}` : `A trabalhar desde ${e.clockIn}`) : ENTRY_STATUS[e.status]}
                  {pendingKinds.size > 0 && <Badge tone="warn" className="ml-1.5">por sincronizar</Badge>}
                </span>
              )}
            </div>
            {e && (
              <p className="mb-3 font-expanded text-3xl font-semibold tabular" aria-live="polite">
                {formatHours(Math.round((e.clockOut ? entryHours(e, settings).worked : worked / 60) * 100) / 100)}
                <span className="ml-2 font-sans text-sm font-normal text-ink-3">{e.clockIn}–{e.clockOut ?? 'agora'}{e.breakMinutes ? ` · pausa ${e.breakMinutes} min` : ''}</span>
              </p>
            )}
            {!e && (
              <Button variant="primary" className={BIG} icon={<LogIn className="size-5" />} onClick={() => run(() => clockIn(), `Entrada registada às ${now}`)} data-tour="worker-clockin">
                Registar entrada
              </Button>
            )}
            {e?.status === 'aberto' && (
              <div className="grid grid-cols-2 gap-2">
                {e.breakStartedAt ? (
                  <Button variant="accent" className={BIG} icon={<Coffee className="size-5" />} onClick={() => run(() => endBreak(), 'Pausa terminada')}>Terminar pausa</Button>
                ) : (
                  <Button className={BIG} icon={<Coffee className="size-5" />} onClick={() => run(() => startBreak(), `Pausa iniciada às ${now}`)}>Iniciar pausa</Button>
                )}
                <Button variant="primary" className={BIG} icon={<LogOut className="size-5" />} onClick={() => run(() => clockOut(), 'Saída registada. Enviada para revisão do encarregado.')} data-tour="worker-clockout">Registar saída</Button>
              </div>
            )}
            {e && e.status !== 'aberto' && (
              <p className="flex items-center gap-2 rounded-md bg-ok-soft px-3 py-2.5 text-sm text-ok"><Check className="size-4" aria-hidden /> Dia registado. {e.status === 'submetido' ? 'O encarregado vai rever.' : ENTRY_STATUS[e.status] + '.'}</p>
            )}
            {e?.rejectionReason && <p className="mt-2 rounded-md bg-tijolo-soft px-3 py-2 text-sm text-tijolo-ink">Devolvido: {e.rejectionReason}</p>}
            {toMinutes(now) > toMinutes(a.start) + 30 && !e && <p className="mt-2 text-xs text-ambar-ink">O seu horário começou às {a.start}.</p>}
          </Card>
          <Button variant="ghost" className="self-start" iconRight={<ChevronRight className="size-4" />} onClick={() => go('proximas')}>Próximas atribuições</Button>
        </>
      )}
    </div>
  )
}

export function UpcomingScreen() {
  const view = useDerived(selectWorkerView)
  const { db, upcoming } = view
  if (upcoming.length === 0) return <EmptyState icon={<CalendarClock />} title="Sem atribuições futuras">Quando o gestor publicar a escala, aparece aqui.</EmptyState>
  return (
    <ul className="flex flex-col gap-2">
      {upcoming.slice(0, 12).map((a) => {
        const s = db.sites[a.siteId]
        return (
          <li key={a.id}>
            <Card className="flex items-center gap-3 p-3" accent={s?.color}>
              <span className="w-12 text-center">
                <span className="block text-xs font-semibold text-ink-3 uppercase">{dayShort(a.date)}</span>
                <span className="font-expanded text-xl font-semibold tabular">{a.date.slice(8)}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{s?.name}</span>
                <span className="block text-xs text-ink-3">{s?.city} · {a.start}–{a.end}{a.vehicleId ? ` · ${db.vehicles[a.vehicleId]?.plate}` : ''}</span>
                {a.note && <span className="block truncate text-xs text-ink-2">{a.note}</span>}
              </span>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

export function WeekScreen() {
  const view = useDerived(selectWorkerView)
  const today = useDemo((s) => s.session.today)
  const settings = useDemo((s) => s.session.settings)
  const [offset, setOffset] = useState(0)
  const { db, worker } = view
  const ws = addDays(weekStart(today), offset * 7)
  const days = weekDays(ws)
  const total = Object.values(db.entries)
    .filter((x) => x.workerId === worker?.id && days.includes(x.date) && x.status !== 'rejeitado' && x.clockOut)
    .reduce((sum, x) => sum + entryHours(x, settings).worked, 0)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {[-1, 0, 1].map((o) => <Button key={o} size="sm" variant={offset === o ? 'primary' : 'secondary'} onClick={() => setOffset(o)}>{o === -1 ? 'Anterior' : o === 0 ? 'Esta semana' : 'Próxima'}</Button>)}
      </div>
      <ul className="flex flex-col gap-1.5">
        {days.map((d) => {
          const list = Object.values(db.assignments).filter((x) => x.workerId === worker?.id && x.date === d)
          const e = Object.values(db.entries).find((x) => x.workerId === worker?.id && x.date === d)
          const ab = Object.values(db.absences).find((x) => x.workerId === worker?.id && x.status === 'aprovado' && x.start <= d && x.end >= d)
          const h = e?.clockOut ? entryHours(e, settings).worked : 0
          return (
            <li key={d} className={cn('flex items-center gap-3 rounded-md border bg-surface px-3 py-2.5', d === today ? 'border-pinho' : 'border-line')}>
              <span className="w-12 text-xs font-semibold text-ink-3 uppercase">{dayShort(d)} {d.slice(8)}</span>
              <span className="min-w-0 flex-1 text-sm">
                {ab ? <Badge tone="danger">{ABSENCE_TYPE[ab.type]}</Badge> : list.length ? list.map((a) => <span key={a.id} className="block truncate">{db.sites[a.siteId]?.name} <span className="text-xs text-ink-3">{a.start}–{a.end}</span></span>) : <span className="text-ink-4">Folga</span>}
                {e?.rejectionReason && <span className="block text-xs text-tijolo-ink">Devolvido: {e.rejectionReason}</span>}
              </span>
              {e && (
                <span className="text-right">
                  <span className="block font-mono text-sm tabular">{e.clockOut ? formatHours(h) : '…'}</span>
                  <Badge tone={e.status === 'aprovado' ? 'ok' : e.status === 'rejeitado' ? 'danger' : 'warn'}>{ENTRY_STATUS[e.status]}</Badge>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-right text-sm">Total registado: <strong className="tabular">{formatHours(Math.round(total * 10) / 10)}</strong></p>
    </div>
  )
}

export function AbsenceScreen() {
  const view = useDerived(selectWorkerView)
  const today = useDemo((s) => s.session.today)
  const request = useDemo((s) => s.requestAbsence)
  const online = useDemo((s) => s.session.online)
  const [type, setType] = useState<AbsenceType>('ferias')
  const [start, setStart] = useState(addDays(weekStart(today), 7))
  const [end, setEnd] = useState(addDays(weekStart(today), 8))
  const [reason, setReason] = useState('')
  const mine = Object.values(view.db.absences).filter((a) => a.workerId === view.worker?.id).sort((a, b) => b.start.localeCompare(a.start))
  const invalid = end < start
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <h2 className="mb-3 font-wide text-base font-semibold">Pedir ausência</h2>
        <div className="flex flex-col gap-3">
          <Field label="Tipo">{(p) => <Select {...p} value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>{(['ferias', 'falta_justificada', 'formacao', 'parcial'] as AbsenceType[]).map((t) => <option key={t} value={t}>{ABSENCE_TYPE[t]}</option>)}</Select>}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="De">{(p) => <Input {...p} type="date" value={start} min={today} onChange={(e) => setStart(e.target.value)} />}</Field>
            <Field label="Até" error={invalid ? 'Antes do início.' : null}>{(p) => <Input {...p} type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />}</Field>
          </div>
          <Field label="Motivo" optional>{(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <Button
            variant="primary"
            className={BIG}
            icon={<Send className="size-5" />}
            disabled={invalid}
            data-tour="worker-request-absence"
            onClick={() => {
              request({ type, start, end: type === 'parcial' ? start : end, hours: type === 'parcial' ? 4 : null, reason })
              setReason('')
              toast.success('Pedido enviado', { description: online ? 'O gestor recebe o pedido para aprovar.' : 'Sem rede: é enviado ao sincronizar.' })
            }}
          >
            Enviar pedido
          </Button>
        </div>
      </Card>
      <h2 className="font-wide text-sm font-semibold">Os meus pedidos</h2>
      {mine.length === 0 ? <p className="text-sm text-ink-3">Ainda não fez pedidos.</p> : (
        <ul className="flex flex-col gap-1.5">
          {mine.map((a) => (
            <li key={a.id} className="rounded-md border border-line bg-surface px-3 py-2.5 text-sm">
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{ABSENCE_TYPE[a.type]}</span>
                <Badge tone={a.status === 'aprovado' ? 'ok' : a.status === 'pedido' ? 'warn' : 'danger'} dot>{a.id.includes('pend') ? 'Por sincronizar' : ABSENCE_STATUS[a.status]}</Badge>
              </span>
              <span className="text-xs text-ink-3">{dateShort(a.start)}{a.end !== a.start && ` a ${dateShort(a.end)}`}</span>
              {a.decisionNote && <span className="block text-xs text-ink-2">{a.decisionNote}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function DocsScreen() {
  const view = useDerived(selectWorkerView)
  const today = useDemo((s) => s.session.today)
  const [doc, setDoc] = useState<string | null>(null)
  const rows = view.worker ? workerCompliance(view.db, view.worker.id, today) : []
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-3">Documentos exigidos para as obras onde vai trabalhar. Envie uma fotografia quando renovar; o escritório verifica.</p>
      {rows.map((r) => (
        <Card key={r.type.id} className="flex items-center gap-3 p-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{r.type.name}</span>
            <span className="block text-xs text-ink-3">{r.doc?.expiresAt ? `Válido até ${dateShort(r.doc.expiresAt)}` : r.doc ? 'Sem validade' : 'Em falta'}</span>
          </span>
          <Badge tone={r.state === 'valido' ? 'ok' : r.state === 'a_expirar' || r.state === 'por_verificar' ? 'warn' : 'danger'} dot>{DOC_STATE_LABEL[r.state]}</Badge>
          {r.state !== 'valido' && r.state !== 'por_verificar' && <Button size="sm" icon={<FileUp className="size-3.5" />} onClick={() => setDoc(r.type.id)}>Enviar</Button>}
        </Card>
      ))}
      {doc && view.worker && <DocumentDialog open onOpenChange={() => setDoc(null)} ownerType="trabalhador" ownerId={view.worker.id} typeId={doc} />}
    </div>
  )
}

export function NotificationsScreen({ go }: { go: (t: WorkerTab) => void }) {
  const db = useDemo((s) => s.db)
  const session = useDemo((s) => s.session)
  const markRead = useDemo((s) => s.markNotificationRead)
  const list = selectNotifications({ db, session: { ...session, role: 'trabalhador' } })
  if (list.length === 0) return <EmptyState title="Sem notificações">Escalas novas e respostas aos pedidos aparecem aqui.</EmptyState>
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => {
              markRead(n.id)
              const t = n.link?.replace('/app/', '').replace('/app', 'hoje') as WorkerTab | undefined
              if (t) go(t)
            }}
            className={cn('w-full rounded-md border bg-surface px-3 py-2.5 text-left', n.read ? 'border-line' : 'border-pinho')}
          >
            <span className="flex justify-between gap-2 text-sm"><span className={cn(!n.read && 'font-semibold')}>{n.title}</span><span className="text-xs text-ink-3">{dateShort(n.at.slice(0, 10))}</span></span>
            <span className="block text-xs text-ink-3">{n.body}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ProfileScreen() {
  const view = useDerived(selectWorkerView)
  const { db, worker } = view
  if (!worker) return null
  const team = worker.teamId ? db.teams[worker.teamId] : undefined
  const lead = team?.foremanId ? db.workers[team.foremanId] : undefined
  const items = Object.values(db.deliveries).filter((d) => d.workerId === worker.id && d.status === 'entregue')
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex items-center gap-3">
        <Avatar name={worker.name} size="lg" color={team?.color} />
        <span>
          <span className="block font-expanded text-lg font-semibold">{worker.name}</span>
          <span className="block text-sm text-ink-3">{worker.category} · N.º {worker.number}</span>
          <span className="block text-sm text-ink-3">{team?.name ?? 'Sem equipa'}</span>
        </span>
      </Card>
      {lead && <Card><p className="text-xs text-ink-3">Responsável de equipa</p><p className="font-semibold">{lead.name}</p><p className="text-sm text-ink-2">{lead.phone}</p></Card>}
      <Card>
        <p className="mb-2 text-xs font-semibold text-ink-3 uppercase">Os meus tamanhos</p>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          {Object.entries({ 'T-shirt': worker.sizes.tshirt, Sweat: worker.sizes.sweat, Parka: worker.sizes.parka, Calças: worker.sizes.calcas, Botas: worker.sizes.botas, Luvas: worker.sizes.luvas }).map(([k, v]) => <div key={k}><dt className="text-xs text-ink-3">{k}</dt><dd className="font-mono">{v ?? '—'}</dd></div>)}
        </dl>
      </Card>
      <Card>
        <p className="mb-2 text-xs font-semibold text-ink-3 uppercase">Equipamento comigo ({items.length})</p>
        <ul className="flex flex-col gap-1 text-sm">{items.slice(0, 12).map((d) => <li key={d.id} className="flex justify-between"><span>{db.equipment[d.itemId]?.name}</span><span className="text-xs text-ink-3">{d.size || DELIVERY_STATUS[d.status]}</span></li>)}</ul>
      </Card>
      <p className="text-center text-xs text-ink-3">Andaime · demonstração com dados fictícios</p>
    </div>
  )
}
