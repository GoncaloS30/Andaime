import { AlertTriangle, CalendarRange, Check, ClipboardCheck, ClipboardPen, FileCheck2, HardHat, MessageSquareWarning, Phone, Send, UserX } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { DOC_STATE_LABEL, docState, latestDoc, requiredSiteDocTypes, workerCompliance } from '@/domain/documents'
import { entryHours, formatHours } from '@/domain/hours'
import { absenceOn, buildIndex, key } from '@/domain/indexes'
import { ABSENCE_TYPE, ISSUE_CATEGORY } from '@/domain/labels'
import type { EntryStatus, ID, IssueCategory } from '@/domain/types'
import { addDays, dateLong, dateNumeric, dateShort, dayShort, isWeekend, weekDays, weekStart } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { selectConflicts, selectForemanScope } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Badge, Plate, SiteCode } from '@/ui/Badge'
import { Button, buttonStyles } from '@/ui/Button'
import { Field, Select, Textarea } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { EmptyState } from '@/ui/States'
import { TabPanel, Tabs } from '@/ui/Tabs'
import { ConflictCard } from '../shared/ConflictCard'
import { ManualEntryDialog } from '../timesheets/EntryDialogs'
import { SheetList } from '../timesheets/SheetList'

function useScope() {
  return useDerived((s) => selectForemanScope(s), [])
}

/** Hoje: quem devia estar em obra, quem já entrou, e confirmar presenças. */
export function ForemanToday() {
  const scope = useScope()
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const settings = useDemo((s) => s.session.settings)
  const personaId = useDemo((s) => s.session.personas.encarregado)
  const confirm = useDemo((s) => s.confirmPresence)
  const [manual, setManual] = useState(false)
  const conflicts = useDerived((s) => selectConflicts(s).filter((c) => c.siteIds.some((x) => scope.siteIds.includes(x))), [scope.siteIds.join(',')])
  const idx = buildIndex(db)
  const me = db.workers[personaId]
  const sites = scope.siteIds.map((id) => db.sites[id]!).filter(Boolean)
  const people = sites.flatMap((s) => (idx.bySiteDate.get(key(s.id, today)) ?? []).map((a) => ({ a, s })))
  const teamAbsent = scope.workerIds.filter((w) => absenceOn(idx, w, today) && db.workers[w]?.teamId && scope.teamIds.includes(db.workers[w]!.teamId!))
  const pending = Object.values(db.entries).filter((e) => e.status === 'submetido' && scope.workerIds.includes(e.workerId)).length
  const present = people.filter(({ a }) => (idx.entriesByWorkerDate.get(key(a.workerId, today)) ?? []).length > 0).length

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        eyebrow={dateLong(today)}
        title={sites.length === 1 ? `Hoje em ${sites[0]!.name}` : 'Hoje nas minhas obras'}
        description={`${me?.name} · ${scope.teamIds.map((t) => db.teams[t]?.name).join(', ')}`}
        actions={
          <>
            <Link to="/encarregado/problemas" className={buttonStyles('secondary')}><MessageSquareWarning className="size-4" aria-hidden /> Reportar problema</Link>
            <Button variant="primary" icon={<ClipboardPen className="size-4" />} onClick={() => setManual(true)}>Registar horas</Button>
          </>
        }
      />
      <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line-2 sm:grid-cols-4">
        {[
          ['Escalados hoje', people.length],
          ['Já entraram', present],
          ['Registos por rever', pending],
          ['Conflitos nas minhas obras', conflicts.length],
        ].map(([l, v]) => (
          <div key={l} className="bg-surface px-4 py-3">
            <dt className="text-xs text-ink-3">{l}</dt>
            <dd className="font-expanded text-2xl font-semibold tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Presenças de hoje" description="Confirme quem está em obra. Quem não registou entrada pode ser confirmado por si." flush>
          {people.length === 0 ? (
            <EmptyState compact icon={<HardHat />} title="Ninguém escalado hoje">{isWeekend(today) ? 'É fim de semana.' : 'Veja a escala da semana.'}</EmptyState>
          ) : (
            <ul className="divide-y divide-line-2">
              {people.map(({ a, s }) => {
                const w = db.workers[a.workerId]
                const e = (idx.entriesByWorkerDate.get(key(a.workerId, today)) ?? [])[0]
                const ab = absenceOn(idx, a.workerId, today)
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <Avatar name={w?.name ?? '?'} size="sm" color={db.teams[w?.teamId ?? '']?.color} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{w?.name}</span>
                      <span className="flex items-center gap-2 text-xs text-ink-3">
                        {sites.length > 1 && <SiteCode code={s.code} color={s.color} />}
                        {a.start}–{a.end}
                        {a.vehicleId && <Plate plate={db.vehicles[a.vehicleId]?.plate ?? ''} />}
                      </span>
                    </span>
                    {ab && ab.type !== 'parcial' ? (
                      <Badge tone="danger" dot>{ABSENCE_TYPE[ab.type]}</Badge>
                    ) : e ? (
                      <Badge tone={e.status === 'aberto' ? 'info' : 'ok'} dot>
                        {e.status === 'aberto' ? `Entrou ${e.clockIn}` : `${e.clockIn}–${e.clockOut} · ${formatHours(entryHours(e, settings).worked)}`}
                      </Badge>
                    ) : (
                      <span className="flex gap-1">
                        <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={() => { confirm(a.workerId, today, true); toast.success(`Presença de ${w?.name} confirmada`, { description: `Entrada às ${a.start}, registada por si.` }) }}>Presente</Button>
                        <Button size="sm" icon={<UserX className="size-3.5" />} onClick={() => { confirm(a.workerId, today, false); toast.success(`Falta de ${w?.name} reportada`, { description: 'O gestor recebe o pedido para validar.' }) }}>Faltou</Button>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
        <div className="flex flex-col gap-4">
          {teamAbsent.length > 0 && (
            <Panel title="Ausentes hoje">
              <ul className="flex flex-col gap-1.5 text-sm">
                {teamAbsent.map((w) => <li key={w} className="flex justify-between"><span>{db.workers[w]?.name}</span><Badge tone="danger">{ABSENCE_TYPE[absenceOn(idx, w, today)!.type]}</Badge></li>)}
              </ul>
            </Panel>
          )}
          <Panel title="Conflitos nas minhas obras" description="O gestor resolve; aqui fica a saber o que vem aí.">
            {conflicts.length === 0 ? <p className="text-sm text-ok">Sem conflitos.</p> : (
              <div className="flex flex-col gap-2">{conflicts.slice(0, 4).map((c) => <ConflictCard key={c.id} conflict={c} compact />)}</div>
            )}
          </Panel>
          <Panel title="Atalhos" bodyClassName="grid grid-cols-2 gap-2">
            <Link to="/encarregado/horas" className={buttonStyles('secondary', 'md', 'justify-start')}><ClipboardCheck className="size-4" aria-hidden /> Rever horas</Link>
            <Link to="/encarregado/semana" className={buttonStyles('secondary', 'md', 'justify-start')}><CalendarRange className="size-4" aria-hidden /> Escala</Link>
            <Link to="/encarregado/documentos" className={buttonStyles('secondary', 'md', 'justify-start')}><FileCheck2 className="size-4" aria-hidden /> Documentação</Link>
            <Link to="/encarregado/problemas" className={buttonStyles('secondary', 'md', 'justify-start')}><AlertTriangle className="size-4" aria-hidden /> Problemas</Link>
          </Panel>
        </div>
      </div>
      {manual && <ManualEntryDialog onClose={() => setManual(false)} workerIds={scope.workerIds} />}
    </div>
  )
}

/** Escala da semana das equipas do encarregado (só leitura). */
export function ForemanWeek() {
  const scope = useScope()
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const [offset, setOffset] = useState(0)
  const ws = addDays(weekStart(today), offset * 7)
  const days = weekDays(ws)
  const idx = buildIndex(db)
  const conflicts = useDerived((s) => selectConflicts(s, { from: ws, to: addDays(ws, 6) }).filter((c) => c.siteIds.some((x) => scope.siteIds.includes(x)) || c.workerIds.some((x) => scope.workerIds.includes(x))), [ws, scope.siteIds.join(',')])
  const workers = scope.workerIds.map((id) => db.workers[id]!).filter(Boolean).sort((a, b) => Number(scope.teamIds.includes(b.teamId ?? '')) - Number(scope.teamIds.includes(a.teamId ?? '')) || a.name.localeCompare(b.name))
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Escala da semana" description="Planeada pelo gestor. Para mudanças, fale com a direção de obra." actions={
        <div className="flex gap-1">
          <Button size="sm" variant={offset === 0 ? 'primary' : 'secondary'} onClick={() => setOffset(0)}>Esta semana</Button>
          <Button size="sm" variant={offset === 1 ? 'primary' : 'secondary'} onClick={() => setOffset(1)}>Próxima</Button>
        </div>
      } />
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="table-a min-w-[860px]">
          <thead><tr><th scope="col">Trabalhador</th>{days.map((d) => <th key={d} scope="col" className={cn(d === today && 'text-pinho')}>{dayShort(d)} {d.slice(8)}</th>)}</tr></thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id}>
                <td className="whitespace-nowrap">{w.name}<span className="block text-xs text-ink-3">{w.category}</span></td>
                {days.map((d) => {
                  const list = idx.byWorkerDate.get(key(w.id, d)) ?? []
                  const ab = absenceOn(idx, w.id, d)
                  return (
                    <td key={d} className={cn(isWeekend(d) && 'bg-line-2/40', d === today && 'bg-lima-soft/40')}>
                      {ab && <Badge tone="danger">{ABSENCE_TYPE[ab.type]}</Badge>}
                      {list.map((a) => {
                        const s = db.sites[a.siteId]
                        return <span key={a.id} className="block"><SiteCode code={s?.code.slice(3) ?? ''} color={s?.color ?? '#999'} /> <span className="font-mono text-[11px] text-ink-3">{a.start}</span></span>
                      })}
                      {!ab && list.length === 0 && <span className="text-ink-4">·</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {conflicts.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 font-wide text-sm font-semibold">Avisos desta semana</h2>
          <div className="grid gap-2 md:grid-cols-2">{conflicts.map((c) => <ConflictCard key={c.id} conflict={c} preview />)}</div>
        </div>
      )}
    </div>
  )
}

/** Rever horas da equipa: valida e segue para o gestor, ou devolve com motivo. */
export function ForemanHours() {
  const scope = useScope()
  const [sp, setSp] = useSearchParams()
  const status = (['submetido', 'revisto', 'rejeitado', 'aprovado'].includes(sp.get('estado') ?? '') ? sp.get('estado') : 'submetido') as EntryStatus
  const [manual, setManual] = useState(false)
  const counts = useDerived(({ db }) => {
    const set = new Set(scope.workerIds)
    const e = Object.values(db.entries).filter((x) => set.has(x.workerId))
    return { submetido: e.filter((x) => x.status === 'submetido').length, rejeitado: e.filter((x) => x.status === 'rejeitado').length }
  }, [scope.workerIds.join(',')])
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Horas da equipa" description="Reveja os registos de ponto. Os validados seguem para aprovação do gestor." actions={<Button variant="primary" icon={<ClipboardPen className="size-4" />} onClick={() => setManual(true)}>Registar horas</Button>} />
      <Tabs value={status} onValueChange={(v) => setSp(v === 'submetido' ? {} : { estado: v }, { replace: true })} label="Estado" tabs={[{ value: 'submetido', label: 'Por rever', count: counts.submetido, tone: 'warn' }, { value: 'revisto', label: 'Enviadas ao gestor' }, { value: 'rejeitado', label: 'Devolvidas', count: counts.rejeitado, tone: 'danger' }, { value: 'aprovado', label: 'Aprovadas' }]}>
        <TabPanel value={status} className="mt-3 pt-0"><SheetList mode="encarregado" status={status} workerIds={scope.workerIds} /></TabPanel>
      </Tabs>
      {manual && <ManualEntryDialog onClose={() => setManual(false)} workerIds={scope.workerIds} />}
    </div>
  )
}

/** Documentação operacional das obras e da equipa (só leitura). */
export function ForemanDocs() {
  const scope = useScope()
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="Documentação" description="O que precisa de ter à mão em obra. Atualizações são feitas pelo escritório." />
      <div className="grid gap-4 lg:grid-cols-2">
        {scope.siteIds.map((sid) => {
          const s = db.sites[sid]!
          const director = db.managers[s.directorId]
          return (
            <Panel key={sid} title={`${s.code} ${s.name}`} description={`${s.address}`}>
              <ul className="flex flex-col gap-2 text-sm">
                {requiredSiteDocTypes(db, s.country).map((t) => {
                  const d = latestDoc(db, sid, t.id)
                  const st = docState(d, today)
                  return <li key={t.id} className="flex items-center justify-between gap-2"><span>{t.name}{d && <span className="block text-xs text-ink-3">{d.number}{d.expiresAt ? ` · até ${dateNumeric(d.expiresAt)}` : ''}</span>}</span><Badge tone={st === 'valido' ? 'ok' : st === 'a_expirar' ? 'warn' : 'danger'} dot>{DOC_STATE_LABEL[st]}</Badge></li>
                })}
              </ul>
              {director && <p className="mt-3 flex items-center gap-1.5 border-t border-line-2 pt-2 text-xs text-ink-3"><Phone className="size-3" aria-hidden /> Direção de obra: {director.name} · {director.email}</p>}
            </Panel>
          )
        })}
        <Panel title="Documentos da equipa" flush className="lg:col-span-2">
          <ul className="divide-y divide-line-2">
            {scope.workerIds.map((wid) => {
              const w = db.workers[wid]!
              const bad = workerCompliance(db, wid, today).filter((r) => r.state !== 'valido')
              return (
                <li key={wid} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                  <span className="flex-1">{w.name}</span>
                  {bad.length === 0 ? <Badge tone="ok" dot>Em dia</Badge> : bad.map((r) => <Badge key={r.type.id} tone={r.state === 'a_expirar' || r.state === 'por_verificar' ? 'warn' : 'danger'} dot>{r.type.short}: {DOC_STATE_LABEL[r.state].toLowerCase()}</Badge>)}
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

/** Reportar um problema na obra; o gestor é notificado. */
export function ForemanIssues() {
  const scope = useScope()
  const db = useDemo((s) => s.db)
  const report = useDemo((s) => s.reportIssue)
  const [siteId, setSite] = useState<ID>(scope.siteIds[0] ?? '')
  const [category, setCategory] = useState<IssueCategory>('material')
  const [text, setText] = useState('')
  const issues = Object.values(db.issues).filter((i) => scope.siteIds.includes(i.siteId)).sort((a, b) => b.at.localeCompare(a.at))
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader title="Problemas" description="Falta de material, segurança, acessos ou equipamento. O gestor recebe uma notificação." />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Reportar problema">
          <div className="flex flex-col gap-3">
            <Field label="Obra">{(p) => <Select {...p} value={siteId} onChange={(e) => setSite(e.target.value)}>{scope.siteIds.map((s) => <option key={s} value={s}>{db.sites[s]?.code} · {db.sites[s]?.name}</option>)}</Select>}</Field>
            <Field label="Tipo">{(p) => <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as IssueCategory)}>{Object.entries(ISSUE_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
            <Field label="O que se passa">{(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: o camião da betonagem não chegou; estamos parados desde as 10:00" />}</Field>
            <Button variant="primary" icon={<Send className="size-4" />} disabled={!text.trim() || !siteId} onClick={() => { report({ siteId, category, text }); setText(''); toast.success('Problema reportado', { description: 'O gestor foi notificado.' }) }}>Enviar ao gestor</Button>
          </div>
        </Panel>
        <Panel title="Reportados" flush>
          {issues.length === 0 ? <p className="px-4 py-4 text-sm text-ink-3">Ainda não reportou problemas.</p> : (
            <ul className="divide-y divide-line-2">
              {issues.map((i) => (
                <li key={i.id} className="px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2"><Badge tone={i.status === 'aberto' ? 'warn' : 'ok'} dot>{i.status === 'aberto' ? 'Aberto' : 'Resolvido'}</Badge><span className="text-xs text-ink-3">{db.sites[i.siteId]?.code} · {ISSUE_CATEGORY[i.category]} · {dateShort(i.at.slice(0, 10))}</span></span>
                  <p className="mt-1">{i.text}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
