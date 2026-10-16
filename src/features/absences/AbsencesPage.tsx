import { produce } from 'immer'
import { CalendarRange, Check, ChevronLeft, ChevronRight, Palmtree, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { ModuleGuard } from '@/app/ModuleGuard'
import { detectConflicts } from '@/domain/conflicts'
import { ABSENCE_STATUS, ABSENCE_TYPE } from '@/domain/labels'
import { newConflicts } from '@/domain/planning'
import type { Absence, AbsenceType, ID } from '@/domain/types'
import { addDays, dateShort, eachDay, isWeekend, monthLabel, weekStart, weekday } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Badge, SiteCode } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { Field, Textarea } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'
import { EmptyState } from '@/ui/States'
import { Tabs, TabPanel } from '@/ui/Tabs'
import { AbsenceDialog } from '../shared/AbsenceDialog'
import { ConflictCard } from '../shared/ConflictCard'

const TYPE_COLOR: Record<AbsenceType, string> = {
  ferias: '#1a9e72',
  falta_justificada: '#2a78d6',
  falta_injustificada: '#b03a2e',
  baixa: '#8a4fc7',
  formacao: '#d4652f',
  parcial: '#8f8a14',
}

function Impact({ a }: { a: Absence }) {
  const db = useDemo((s) => s.db)
  const session = useDemo((s) => s.session)
  const data = useMemo(() => {
    const affected = Object.values(db.assignments).filter((x) => x.workerId === a.workerId && x.date >= a.start && x.date <= a.end)
    const range = { from: weekStart(a.start), to: addDays(weekStart(a.end), 6) }
    const after = produce(db, (d) => {
      d.absences[a.id]!.status = 'aprovado'
    })
    const created = newConflicts(detectConflicts(db, range, session.today, session.settings), detectConflicts(after, range, session.today, session.settings))
    return { affected, created }
  }, [db, a, session])
  const sites = [...new Set(data.affected.map((x) => x.siteId))]
  return (
    <div className="mt-2 rounded-md bg-cal p-2.5 text-sm">
      <p className="mb-1 text-xs font-semibold text-ink-3 uppercase">Impacto no planeamento</p>
      {data.affected.length === 0 ? (
        <p className="text-ok">Sem trabalho planeado nesse período. Aprovar não cria conflitos.</p>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-ink-2">
            {data.affected.length} {data.affected.length === 1 ? 'dia escalado' : 'dias escalados'} em
            {sites.map((s) => db.sites[s] && <SiteCode key={s} code={db.sites[s]!.code} color={db.sites[s]!.color} />)}
          </p>
          {data.created.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {data.created.map((c) => <ConflictCard key={c.id} conflict={c} preview compact />)}
              <p className="text-xs text-ink-3">Depois de aprovar, o planeamento sugere substitutos para estes dias.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Requests({ highlight }: { highlight: string | null }) {
  const db = useDemo((s) => s.db)
  const decide = useDemo((s) => s.decideAbsence)
  const navigate = useNavigate()
  const [refuse, setRefuse] = useState<ID | null>(null)
  const [note, setNote] = useState('')
  const list = Object.values(db.absences).filter((a) => a.status === 'pedido').sort((a, b) => a.start.localeCompare(b.start))
  if (list.length === 0) return <EmptyState icon={<Check />} title="Sem pedidos pendentes">Os pedidos de férias e faltas feitos na app do trabalhador aparecem aqui.</EmptyState>
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {list.map((a) => {
        const w = db.workers[a.workerId]
        return (
          <article key={a.id} className={cn('rounded-lg border bg-surface p-4', highlight === a.id ? 'border-pinho ring-2 ring-lima' : 'border-line')} aria-label={`Pedido de ${w?.name}`}>
            <header className="flex items-start gap-3">
              <Avatar name={w?.name ?? '?'} size="md" color={db.teams[w?.teamId ?? '']?.color} />
              <div className="min-w-0 flex-1">
                <Link to={`/trabalhadores/${a.workerId}?tab=ausencias`} className="font-semibold hover:underline">{w?.name}</Link>
                <p className="text-sm text-ink-2">
                  <span className="font-medium" style={{ color: TYPE_COLOR[a.type] }}>●</span> {ABSENCE_TYPE[a.type]} · {dateShort(a.start)}{a.end !== a.start && ` a ${dateShort(a.end)}`} ({eachDay(a.start, a.end).filter((d) => !isWeekend(d)).length} dias úteis)
                </p>
                {a.reason && <p className="mt-0.5 text-xs text-ink-3">“{a.reason}”</p>}
                <p className="mt-0.5 text-xs text-ink-3">Pedido a {dateShort(a.requestedAt.slice(0, 10))} às {a.requestedAt.slice(11, 16)}</p>
              </div>
            </header>
            <Impact a={a} />
            <div className="mt-3 flex justify-end gap-2">
              <Button icon={<X className="size-4" />} onClick={() => { setRefuse(a.id); setNote('') }}>Recusar</Button>
              <Button
                variant="primary"
                icon={<Check className="size-4" />}
                data-tour="approve-absence"
                onClick={() => {
                  decide(a.id, 'aprovado', '')
                  toast.success(`${ABSENCE_TYPE[a.type]} de ${w?.name} aprovada`, {
                    description: 'A disponibilidade foi atualizada. Os conflitos aparecem no planeamento.',
                    action: { label: 'Ver no planeamento', onClick: () => navigate(`/planeamento?semana=${weekStart(a.start)}&painel=conflitos`) },
                  })
                }}
              >
                Aprovar
              </Button>
            </div>
          </article>
        )
      })}
      {refuse && (
        <Dialog
          open
          onOpenChange={() => setRefuse(null)}
          size="sm"
          title="Recusar pedido"
          description="O trabalhador recebe o motivo na app."
          footer={
            <>
              <Button variant="ghost" onClick={() => setRefuse(null)}>Cancelar</Button>
              <Button variant="danger" disabled={!note.trim()} onClick={() => { decide(refuse, 'rejeitado', note); toast.success('Pedido recusado', { description: 'O trabalhador foi notificado.' }); setRefuse(null) }}>Recusar pedido</Button>
            </>
          }
        >
          <Field label="Motivo">{(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: período de pico na obra; propor outra data" autoFocus />}</Field>
        </Dialog>
      )}
    </div>
  )
}

function Calendar() {
  const today = useDemo((s) => s.session.today)
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`)
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10)
  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10)
  const days = eachDay(month, addDays(next, -1))
  const rows = useDerived(({ db }) => {
    const abs = Object.values(db.absences).filter((a) => a.status !== 'rejeitado' && a.end >= month && a.start < next)
    const byWorker = new Map<ID, Absence[]>()
    for (const a of abs) byWorker.set(a.workerId, [...(byWorker.get(a.workerId) ?? []), a])
    return [...byWorker.entries()].map(([wid, list]) => ({ w: db.workers[wid]!, list })).filter((r) => r.w).sort((a, b) => a.w.name.localeCompare(b.w.name))
  }, [month])
  return (
    <Panel
      title={<span className="capitalize">{monthLabel(month)}</span>}
      actions={
        <>
          <IconButton label="Mês anterior" size="sm" onClick={() => setMonth(prev)}><ChevronLeft className="size-4" /></IconButton>
          <IconButton label="Mês seguinte" size="sm" onClick={() => setMonth(next)}><ChevronRight className="size-4" /></IconButton>
        </>
      }
      flush
    >
      {rows.length === 0 ? <p className="px-4 py-6 text-center text-sm text-ink-3">Sem ausências neste mês.</p> : (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-44 bg-surface px-3 py-1.5 text-left font-semibold text-ink-3">Trabalhador</th>
                {days.map((d) => <th key={d} scope="col" className={cn('w-7 min-w-7 py-1 text-center font-condensed', isWeekend(d) && 'bg-line-2/50', d === today ? 'text-pinho' : 'text-ink-3', weekday(d) === 1 && 'border-l border-line')}>{Number(d.slice(8))}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ w, list }) => (
                <tr key={w.id}>
                  <th scope="row" className="sticky left-0 z-10 border-t border-line-2 bg-surface px-3 py-1 text-left font-medium">{w.name}</th>
                  {days.map((d) => {
                    const a = list.find((x) => x.start <= d && x.end >= d)
                    return (
                      <td key={d} className={cn('h-7 border-t border-line-2 p-[2px]', isWeekend(d) && 'bg-line-2/40', weekday(d) === 1 && 'border-l border-line')}>
                        {a && (
                          <span
                            title={`${ABSENCE_TYPE[a.type]} · ${ABSENCE_STATUS[a.status]}`}
                            aria-label={`${d}: ${ABSENCE_TYPE[a.type]}, ${ABSENCE_STATUS[a.status]}`}
                            className={cn('block h-full rounded-[3px]', a.status === 'pedido' && 'hatch border')}
                            style={a.status === 'pedido' ? { ['--hatch' as string]: TYPE_COLOR[a.type], borderColor: TYPE_COLOR[a.type] } : { background: TYPE_COLOR[a.type] }}
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-2 px-4 py-2 text-xs text-ink-3">
        {(Object.keys(TYPE_COLOR) as AbsenceType[]).map((t) => <li key={t} className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-xs" style={{ background: TYPE_COLOR[t] }} />{ABSENCE_TYPE[t]}</li>)}
        <li className="flex items-center gap-1.5"><span aria-hidden className="hatch size-2.5 rounded-xs border border-ink-3 [--hatch:var(--color-ink-3)]" />Pedido pendente</li>
      </ul>
    </Panel>
  )
}

function AllList() {
  const db = useDemo((s) => s.db)
  const cancel = useDemo((s) => s.cancelAbsence)
  const list = Object.values(db.absences).sort((a, b) => b.start.localeCompare(a.start))
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="table-a min-w-[760px]">
        <thead><tr><th scope="col">Trabalhador</th><th scope="col">Tipo</th><th scope="col">Período</th><th scope="col">Estado</th><th scope="col">Decisão</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {list.map((a) => (
            <tr key={a.id}>
              <td><Link to={`/trabalhadores/${a.workerId}?tab=ausencias`} className="hover:underline">{db.workers[a.workerId]?.name}</Link></td>
              <td>{ABSENCE_TYPE[a.type]}</td>
              <td className="text-xs">{dateShort(a.start)}{a.end !== a.start && ` a ${dateShort(a.end)}`}{a.hours ? ` · ${a.hours} h` : ''}</td>
              <td><Badge tone={a.status === 'aprovado' ? 'ok' : a.status === 'pedido' ? 'warn' : 'danger'} dot>{ABSENCE_STATUS[a.status]}</Badge></td>
              <td className="text-xs text-ink-3">{a.decidedBy ? `${a.decidedBy}${a.decisionNote ? `: ${a.decisionNote}` : ''}` : '—'}</td>
              <td className="text-right">{a.status !== 'pedido' && <Button size="sm" variant="ghost" onClick={() => { cancel(a.id); toast.success('Ausência cancelada', { description: 'A disponibilidade foi reposta.' }) }}>Cancelar</Button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AbsencesPage() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('vista') ?? 'pedidos'
  const pending = useDemo((s) => Object.values(s.db.absences).filter((a) => a.status === 'pedido').length)
  const [create, setCreate] = useState(false)
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title="Ausências"
        description="Férias, faltas, baixas e formações. Uma ausência aprovada retira a pessoa da disponibilidade e assinala conflitos no planeamento."
        actions={
          <>
            <Link to="/planeamento?painel=conflitos" className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-ink-2 hover:bg-line-2"><CalendarRange className="size-4" aria-hidden /> Conflitos</Link>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>Registar ausência</Button>
          </>
        }
      />
      <ModuleGuard empty={{ icon: <Palmtree />, title: 'Sem ausências', text: 'Os pedidos feitos na app do trabalhador e as ausências registadas aparecem aqui.' }}>
        <Tabs value={tab} onValueChange={(v) => setSp(v === 'pedidos' ? {} : { vista: v }, { replace: true })} label="Ausências" tabs={[{ value: 'pedidos', label: 'Pedidos', count: pending, tone: 'warn' }, { value: 'calendario', label: 'Calendário' }, { value: 'todas', label: 'Todas' }]}>
          <TabPanel value="pedidos"><Requests highlight={sp.get('id')} /></TabPanel>
          <TabPanel value="calendario"><Calendar /></TabPanel>
          <TabPanel value="todas"><AllList /></TabPanel>
        </Tabs>
      </ModuleGuard>
      {create && <AbsenceDialog open onOpenChange={setCreate} />}
    </div>
  )
}
