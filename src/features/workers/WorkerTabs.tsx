import { ArrowRightLeft, FileSignature, FileUp, PackageCheck, Pencil, Plus, Shirt } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { DOC_STATE_LABEL, workerCompliance } from '@/domain/documents'
import { entryHours, formatHours } from '@/domain/hours'
import { buildIndex, absenceOn, key } from '@/domain/indexes'
import { ABSENCE_STATUS, ABSENCE_TYPE, COUNTRY_NAME, DELIVERY_STATUS, ENTRY_STATUS, VERIFICATION } from '@/domain/labels'
import type { DeliveryStatus, ID } from '@/domain/types'
import { addDays, dateNumeric, dateShort, dayShort, isoWeek, weekDays, weekStart } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Badge, Plate, SiteCode } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Select } from '@/ui/Field'
import { Detail, Panel } from '@/ui/Layout'
import { Menu } from '@/ui/Menu'
import { EmptyState } from '@/ui/States'
import { ActivityList } from '../shared/ActivityList'
import { DocumentDialog } from '../shared/DocumentDialog'
import { runs } from '../planning/model'
import { SiteDonut } from './SiteDonut'
import { SizesFields } from './WorkerForm'
import { plural } from '@/lib/plural'
import { Photo } from '@/ui/Photo'

const tone = (st: string) => (st === 'valido' || st === 'aprovado' || st === 'verificado' ? 'ok' : st === 'a_expirar' || st === 'por_verificar' || st === 'pedido' || st === 'revisto' || st === 'submetido' ? 'warn' : st === 'aberto' ? 'info' : 'danger')

export function OverviewTab({ id }: { id: ID }) {
  const d = useDerived(({ db, session }) => {
    const idx = buildIndex(db)
    const ws = weekStart(session.today)
    const days = weekDays(ws).map((date) => ({
      date,
      list: idx.byWorkerDate.get(key(id, date)) ?? [],
      entry: (idx.entriesByWorkerDate.get(key(id, date)) ?? []).find((e) => e.status !== 'rejeitado'),
      absence: absenceOn(idx, id, date),
    })).map((x) => ({ ...x, worked: x.entry?.clockOut ? entryHours(x.entry, session.settings).worked : null }))
    const planned = days.reduce((s, x) => s + x.list.reduce((a, b) => a + b.hours, 0), 0)
    const realized = days.reduce((s, x) => s + (x.entry && x.entry.clockOut ? entryHours(x.entry, session.settings).worked : 0), 0)
    let extra4 = 0
    for (const e of Object.values(db.entries)) {
      if (e.workerId === id && e.date >= addDays(ws, -28) && e.status !== 'rejeitado' && e.clockOut) extra4 += entryHours(e, session.settings).extra
    }
    const nextAbs = Object.values(db.absences).filter((a) => a.workerId === id && a.end >= session.today && a.status !== 'rejeitado').sort((a, b) => a.start.localeCompare(b.start))[0]
    const docs = workerCompliance(db, id, session.today).filter((r) => r.state !== 'valido')
    return { days, planned, realized, extra4, nextAbs, docs, today: session.today, db }
  }, [id])
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Panel title="Esta semana" description={`Semana ${isoWeek(d.today)}`}>
        <ol className="grid grid-cols-7 gap-1.5">
          {d.days.map(({ date, list, worked, absence }) => (
            <li key={date} className={cn('flex min-h-24 min-w-0 flex-col gap-1 rounded-md border p-1.5', date === d.today ? 'border-pinho bg-lima-soft/40' : 'border-line-2')}>
              <span className="text-[11px] font-semibold text-ink-3 uppercase">
                {dayShort(date)} {date.slice(8)}
              </span>
              {absence && <Badge tone="danger">{ABSENCE_TYPE[absence.type]}</Badge>}
              {list.map((a) => {
                const s = d.db.sites[a.siteId]
                return s ? <SiteCode key={a.id} code={s.code.slice(3)} color={s.color} /> : null
              })}
              {list.length > 0 && <span className="mt-auto flex flex-wrap gap-x-1 font-mono text-[11px] leading-tight text-ink-2 tabular">{worked !== null ? <><span aria-hidden>✓</span><span className="sr-only">Registado:</span><span className="whitespace-nowrap">{formatHours(Math.round(worked * 10) / 10)}</span></> : `${list.reduce((s, x) => s + x.hours, 0)}h plan.`}</span>}
              {!list.length && !absence && <span className="mt-auto text-[11px] text-ink-3">Livre</span>}
            </li>
          ))}
        </ol>
      </Panel>
      <div className="flex flex-col gap-4">
        <Panel title="Resumo">
          <dl className="grid grid-cols-2 gap-3">
            <Detail label="Planeadas na semana">{formatHours(d.planned)}</Detail>
            <Detail label="Realizadas na semana">{formatHours(Math.round(d.realized * 10) / 10)}</Detail>
            <Detail label="Extra (4 semanas)">{formatHours(Math.round(d.extra4 * 10) / 10)}</Detail>
            <Detail label="Próxima ausência">{d.nextAbs ? `${ABSENCE_TYPE[d.nextAbs.type]} · ${dateShort(d.nextAbs.start)}` : '—'}</Detail>
          </dl>
        </Panel>
        <Panel title="Documentos a tratar">
          {d.docs.length === 0 ? (
            <p className="text-sm text-ok">Tudo em dia.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {d.docs.map((r) => (
                <li key={r.type.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{r.type.short}</span>
                  <Badge tone={tone(r.state)} dot>
                    {DOC_STATE_LABEL[r.state]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

export function ProfessionalTab({ id, onEdit }: { id: ID; onEdit: () => void }) {
  const db = useDemo((s) => s.db)
  const w = db.workers[id]!
  const team = w.teamId ? db.teams[w.teamId] : undefined
  return (
    <Panel title="Dados profissionais" actions={<Button size="sm" icon={<Pencil className="size-3.5" />} onClick={onEdit}>Editar</Button>}>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Detail label="N.º mecanográfico">{w.number}</Detail>
        <Detail label="Categoria">{w.category}</Detail>
        <Detail label="Equipa">{team?.name ?? 'Sem equipa'}</Detail>
        <Detail label="Data de admissão">{dateNumeric(w.hireDate)}</Detail>
        <Detail label="Nacionalidade">{w.nationality}</Detail>
        <Detail label="Residência">{w.homeCity}</Detail>
        <Detail label="Horas normais por dia">{formatHours(w.dailyHours)}</Detail>
        <Detail label="Custo por hora">{w.hourlyCost.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}</Detail>
        <Detail label="Viatura habitual">{w.usualVehicleId ? db.vehicles[w.usualVehicleId]?.plate : '—'}</Detail>
      </dl>
    </Panel>
  )
}

export function SitesTab({ id, onTransfer }: { id: ID; onTransfer: () => void }) {
  const d = useDerived(({ db, session }) => {
    const mine = Object.values(db.assignments).filter((a) => a.workerId === id)
    const upcoming = runs(mine.filter((a) => a.date >= session.today))
    const bySite = new Map<ID, number>()
    for (const e of Object.values(db.entries)) {
      if (e.workerId !== id || e.status === 'rejeitado' || !e.clockOut) continue
      bySite.set(e.siteId, (bySite.get(e.siteId) ?? 0) + entryHours(e, session.settings).worked)
    }
    return { upcoming, past: [...bySite.entries()].sort((a, b) => b[1] - a[1]), db, mine }
  }, [id])
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Próximas atribuições" actions={<Button size="sm" icon={<ArrowRightLeft className="size-3.5" />} onClick={onTransfer}>Transferir</Button>} flush>
        {d.upcoming.length === 0 ? (
          <EmptyState compact title="Sem trabalho planeado">Use Transferir ou o Planeamento para o atribuir a uma obra.</EmptyState>
        ) : (
          <ul className="divide-y divide-line-2">
            {d.upcoming.map((r) => {
              const s = d.db.sites[r.siteId]
              const a = d.db.assignments[r.ids[0]!]
              return (
                <li key={r.ids[0]} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    {s && <SiteCode code={s.code} color={s.color} />}
                    <Link to={`/obras/${r.siteId}`} className="block truncate text-sm font-medium hover:underline">{s?.name}</Link>
                    <span className="text-xs text-ink-3">
                      {dateShort(r.from)}
                      {r.to !== r.from && ` a ${dateShort(r.to)}`} · {plural(r.days, 'dia', 'dias')} · {a?.start}–{a?.end}
                    </span>
                  </span>
                  {a?.vehicleId && <Plate plate={d.db.vehicles[a.vehicleId]?.plate ?? ''} />}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      <Panel title="Horas realizadas por obra" description="Últimas semanas registadas" flush>
        <ul className="divide-y divide-line-2">
          {d.past.map(([sid, h]) => {
            const s = d.db.sites[sid]
            return (
              <li key={sid} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  {s && <SiteCode code={s.code} color={s.color} />}
                  {s?.name}
                </span>
                <span className="font-mono tabular">{formatHours(Math.round(h * 10) / 10)}</span>
              </li>
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}

export function HoursTab({ id }: { id: ID }) {
  const settings = useDemo((s) => s.session.settings)
  const [siteFilter, setSiteFilter] = useState('')
  const share = useDerived(({ db, session }) => {
    const bySite = new Map<string, number>()
    for (const e of Object.values(db.entries)) {
      if (e.workerId !== id || !['submetido', 'revisto', 'aprovado'].includes(e.status) || !e.clockOut) continue
      bySite.set(e.siteId, (bySite.get(e.siteId) ?? 0) + entryHours(e, session.settings).worked)
    }
    const parts = [...bySite.entries()].map(([sid, hours]) => ({ site: db.sites[sid]!, hours })).filter((p) => p.site).sort((a, b) => b.hours - a.hours)
    return { parts, total: parts.reduce((t, p) => t + p.hours, 0) }
  }, [id])
  const d = useDerived(({ db, session }) => {
    const ws = weekStart(session.today)
    const weeks = [0, -7, -14, -21, -28].map((o) => addDays(ws, o))
    return weeks.map((w) => {
      const end = addDays(w, 6)
      const entries = Object.values(db.entries).filter((e) => e.workerId === id && e.date >= w && e.date <= end).sort((a, b) => a.date.localeCompare(b.date))
      const planned = Object.values(db.assignments).filter((a) => a.workerId === id && a.date >= w && a.date <= end).reduce((s, a) => s + a.hours, 0)
      return { w, entries, planned, db }
    })
  }, [id])
  return (
    <div className="flex flex-col gap-4">
      {share.total > 0 && (
        <Panel
          title="Horas por obra"
          description="Parte de cada obra nas horas realizadas"
          actions={
            <>
              <label className="sr-only" htmlFor={`hf-${id}`}>Filtrar registos por obra</label>
              <Select id={`hf-${id}`} value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="w-52">
                <option value="">Registos de todas as obras</option>
                {share.parts.map((p) => <option key={p.site.id} value={p.site.id}>{p.site.code} · {p.site.name}</option>)}
              </Select>
            </>
          }
        >
          <SiteDonut parts={share.parts} total={share.total} />
        </Panel>
      )}
      {d.map(({ w, entries: all, planned, db }) => {
        const entries = siteFilter ? all.filter((e) => e.siteId === siteFilter) : all
        const valid = entries.filter((e) => e.status !== 'rejeitado' && e.clockOut)
        const sum = valid.reduce((s, e) => s + entryHours(e, settings).worked, 0)
        const extra = valid.reduce((s, e) => s + entryHours(e, settings).extra, 0)
        return (
          <Panel key={w} title={`Semana ${isoWeek(w)}`} description={`Planeadas ${formatHours(planned)} · realizadas ${formatHours(Math.round(sum * 10) / 10)}${extra ? ` · ${formatHours(Math.round(extra * 10) / 10)} extra` : ''}`} flush>
            {entries.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-3">Sem registos nesta semana.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-a min-w-[640px]">
                  <thead>
                    <tr>
                      <th scope="col">Dia</th>
                      <th scope="col">Obra</th>
                      <th scope="col">Entrada–saída</th>
                      <th scope="col" className="num">Pausa</th>
                      <th scope="col" className="num">Normais</th>
                      <th scope="col" className="num">Extra</th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const h = entryHours(e, settings)
                      return (
                        <tr key={e.id}>
                          <td className="whitespace-nowrap">{dayShort(e.date)} {dateShort(e.date)}</td>
                          <td>{db.sites[e.siteId]?.code}</td>
                          <td className="font-mono text-xs">{e.clockIn}–{e.clockOut ?? '…'}</td>
                          <td className="num font-mono text-xs">{e.breakMinutes} min</td>
                          <td className="num font-mono text-xs">{e.clockOut ? h.normal : '—'}</td>
                          <td className="num font-mono text-xs">{e.clockOut && h.extra ? h.extra : '—'}</td>
                          <td>
                            <Badge tone={tone(e.status)} dot>{ENTRY_STATUS[e.status]}</Badge>
                            {e.corrections.length > 0 && <span className="ml-1.5 text-xs text-ink-3">corrigido</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )
      })}
    </div>
  )
}

export function DocumentsTab({ id, openDoc }: { id: ID; openDoc: string | null }) {
  const rows = useDerived(({ db, session }) => workerCompliance(db, id, session.today), [id])
  const [editing, setEditing] = useState<string | null>(openDoc)
  return (
    <Panel title="Documentos" description="Exigidos pelos países onde trabalha ou vai trabalhar. Requisitos ilustrativos, não constituem aconselhamento jurídico." flush>
      <div className="overflow-x-auto">
        <table className="table-a min-w-[760px]">
          <thead>
            <tr>
              <th scope="col">Documento</th>
              <th scope="col">Exigido em</th>
              <th scope="col">Número</th>
              <th scope="col">Validade</th>
              <th scope="col">Estado</th>
              <th scope="col">Versões</th>
              <th scope="col"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.type.id} className={cn(editing === r.type.id && 'bg-lima-soft/40')}>
                <td className="font-medium">{r.type.name}</td>
                <td className="text-xs text-ink-3">{r.countries.length ? r.countries.map((c) => COUNTRY_NAME[c]).join(', ') : 'Opcional'}</td>
                <td className="font-mono text-xs">{r.doc?.number ?? '—'}</td>
                <td className="font-mono text-xs">{r.doc?.expiresAt ? dateNumeric(r.doc.expiresAt) : r.doc ? 'Sem validade' : '—'}</td>
                <td>
                  <Badge tone={tone(r.state)} dot>{DOC_STATE_LABEL[r.state]}</Badge>
                  {r.doc && r.doc.verification !== 'verificado' && r.state !== 'por_verificar' && <span className="ml-1 text-xs text-ink-3">{VERIFICATION[r.doc.verification]}</span>}
                </td>
                <td className="text-xs text-ink-3 tabular">{r.doc?.versions.length ?? 0}</td>
                <td className="text-right">
                  <Button size="sm" variant={r.state === 'valido' ? 'ghost' : 'primary'} icon={<FileUp className="size-3.5" />} onClick={() => setEditing(r.type.id)}>
                    {r.doc ? 'Atualizar' : 'Registar'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <DocumentDialog open onOpenChange={() => setEditing(null)} ownerType="trabalhador" ownerId={id} typeId={editing} />}
    </Panel>
  )
}

export function AbsencesTab({ id, onNew }: { id: ID; onNew: () => void }) {
  const list = useDerived(({ db }) => Object.values(db.absences).filter((a) => a.workerId === id).sort((a, b) => b.start.localeCompare(a.start)), [id])
  return (
    <Panel title="Ausências" actions={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={onNew}>Registar</Button>} flush>
      {list.length === 0 ? (
        <EmptyState compact title="Sem ausências">Férias, faltas, baixas e formações aparecem aqui.</EmptyState>
      ) : (
        <ul className="divide-y divide-line-2">
          {list.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{ABSENCE_TYPE[a.type]}</span>
                <span className="block text-xs text-ink-3">
                  {dateShort(a.start)}{a.end !== a.start && ` a ${dateShort(a.end)}`}{a.hours ? ` · ${a.hours} h` : ''}{a.reason && ` · ${a.reason}`}
                </span>
                {a.decisionNote && <span className="block text-xs text-ink-3">Nota: {a.decisionNote}</span>}
              </span>
              <Badge tone={tone(a.status)} dot>{ABSENCE_STATUS[a.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function DeliveriesList({ id, kinds }: { id: ID; kinds: string[] }) {
  const db = useDemo((s) => s.db)
  const recordReturn = useDemo((s) => s.recordReturn)
  const list = Object.values(db.deliveries)
    .filter((d) => d.workerId === id && kinds.includes(db.equipment[d.itemId]?.kind ?? ''))
    .sort((a, b) => b.date.localeCompare(a.date))
  if (list.length === 0) return <EmptyState compact title="Nada entregue">Registe a primeira entrega.</EmptyState>
  const act = (did: ID, status: Exclude<DeliveryStatus, 'entregue'>) => {
    recordReturn(did, status, '')
    toast.success(status === 'devolvido' ? 'Devolução registada, stock reposto' : `Registado como ${DELIVERY_STATUS[status].toLowerCase()}`)
  }
  return (
    <div className="overflow-x-auto">
      <table className="table-a min-w-[600px]">
        <thead>
          <tr>
            <th scope="col">Artigo</th>
            <th scope="col">Tamanho</th>
            <th scope="col" className="num">Qtd.</th>
            <th scope="col">Entregue</th>
            <th scope="col">Estado</th>
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {list.map((d) => (
            <tr key={d.id}>
              <td>
                <span className="flex items-center gap-2">
                  <Photo photo={db.equipment[d.itemId]?.photo} format="artigo" alt="" sizes="32px" rounded="sm" className="w-8" fallback={<Shirt className="size-3.5 text-ink-4" aria-hidden />} />
                  <span>
                    {db.equipment[d.itemId]?.name}
                    {d.note && <span className="block text-xs text-ink-3">{d.note}</span>}
                  </span>
                </span>
              </td>
              <td className="font-mono text-xs">{d.size || '—'}</td>
              <td className="num tabular">{d.qty}</td>
              <td className="text-xs whitespace-nowrap">{dateNumeric(d.date)}</td>
              <td>
                <Badge tone={d.status === 'entregue' ? 'info' : d.status === 'devolvido' ? 'neutral' : 'danger'} dot>{DELIVERY_STATUS[d.status]}</Badge>
                {d.returnedAt && <span className="ml-1 text-xs text-ink-3">{dateShort(d.returnedAt)}</span>}
              </td>
              <td className="text-right">
                {d.status === 'entregue' && (
                  <Menu
                    trigger={<Button size="sm" variant="ghost">Registar…</Button>}
                    items={[
                      { label: 'Devolução', onSelect: () => act(d.id, 'devolvido') },
                      { label: 'Danificado', onSelect: () => act(d.id, 'danificado') },
                      { label: 'Perdido', onSelect: () => act(d.id, 'perdido'), danger: true },
                    ]}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Ações do painel de entregas: a folha para assinar e registar uma entrega. */
function DeliveryActions({ onDeliver, onSheet, tour }: { onDeliver: () => void; onSheet: () => void; tour?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" icon={<FileSignature className="size-3.5" />} onClick={onSheet}>Folha de entrega</Button>
      <Button size="sm" variant="primary" icon={<PackageCheck className="size-3.5" />} onClick={onDeliver} data-tour={tour}>Registar entrega</Button>
    </div>
  )
}

export function UniformTab({ id, onDeliver, onSheet }: { id: ID; onDeliver: () => void; onSheet: () => void }) {
  const w = useDemo((s) => s.db.workers[id]!)
  const updateSizes = useDemo((s) => s.updateSizes)
  const [sizes, setSizes] = useState(w.sizes)
  const dirty = JSON.stringify(sizes) !== JSON.stringify(w.sizes)
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <Panel title="Tamanhos" description="Usados para preencher as entregas automaticamente.">
        <SizesFields sizes={sizes} onChange={setSizes} />
        <Button className="mt-4" variant="primary" disabled={!dirty} onClick={() => { updateSizes(id, sizes); toast.success('Tamanhos guardados') }}>
          Guardar tamanhos
        </Button>
      </Panel>
      <Panel title="Fardamento entregue" actions={<DeliveryActions onDeliver={onDeliver} onSheet={onSheet} tour="deliver" />} flush>
        <DeliveriesList id={id} kinds={['fardamento']} />
      </Panel>
    </div>
  )
}

export function EquipmentTab({ id, onDeliver, onSheet }: { id: ID; onDeliver: () => void; onSheet: () => void }) {
  return (
    <Panel title="EPI e ferramentas" actions={<DeliveryActions onDeliver={onDeliver} onSheet={onSheet} />} flush>
      <DeliveriesList id={id} kinds={['epi', 'ferramenta']} />
    </Panel>
  )
}

export function HistoryTab({ id }: { id: ID }) {
  const events = useDemo((s) => s.db.activity)
  const mine = events.filter((e) => e.refs.workerId === id)
  return (
    <Panel title="Histórico">
      <ActivityList events={mine} limit={60} empty="As alterações a este trabalhador (escalas, transferências, documentos, entregas) aparecem aqui." />
    </Panel>
  )
}
