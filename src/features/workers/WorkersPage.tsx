import { Plus, Search, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useDerived } from '@/app/hooks'
import { ModuleGuard } from '@/app/ModuleGuard'
import { availability, type AvailabilityState } from '@/domain/availability'
import { DOC_STATE_LABEL, workerCompliance, type DocState } from '@/domain/documents'
import { formatHours } from '@/domain/hours'
import { buildIndex } from '@/domain/indexes'
import { ABSENCE_TYPE, CATEGORIES } from '@/domain/labels'
import { addDays, weekStart } from '@/domain/weeks'
import { Avatar } from '@/ui/Avatar'
import { Badge, SiteCode } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Input, Select } from '@/ui/Field'
import { PageHeader } from '@/ui/Layout'
import { EmptyState } from '@/ui/States'
import { WorkerForm } from './WorkerForm'

const AVAIL: Record<AvailabilityState, { label: string; tone: 'ok' | 'warn' | 'neutral' | 'danger' | 'info' }> = {
  livre: { label: 'Livre', tone: 'ok' },
  parcial: { label: 'Parcial', tone: 'warn' },
  atribuido: { label: 'Em obra', tone: 'info' },
  ausente: { label: 'Ausente', tone: 'danger' },
  inativo: { label: 'Inativo', tone: 'neutral' },
}
const DOC_RANK: DocState[] = ['em_falta', 'expirado', 'rejeitado', 'a_expirar', 'por_verificar', 'valido']

export function WorkersPage() {
  const [sp, setSp] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const q = sp.get('q') ?? ''
  const team = sp.get('equipa') ?? ''
  const cat = sp.get('categoria') ?? ''
  const avail = sp.get('disponibilidade') ?? ''
  const set = (k: string, v: string) =>
    setSp((p) => {
      const n = new URLSearchParams(p)
      if (v) n.set(k, v)
      else n.delete(k)
      return n
    }, { replace: true })

  const rows = useDerived(({ db, session }) => {
    const idx = buildIndex(db)
    const today = session.today
    const ws = weekStart(today)
    return Object.values(db.workers).map((w) => {
      const a = availability(w, today, idx)
      const todayAssign = idx.byWorkerDate.get(`${w.id}|${today}`)?.[0]
      let week = 0
      for (let i = 0; i < 7; i++) week += (idx.byWorkerDate.get(`${w.id}|${addDays(ws, i)}`) ?? []).reduce((s, x) => s + x.hours, 0)
      const comp = workerCompliance(db, w.id, today)
      const worst = comp.map((c) => c.state).sort((x, y) => DOC_RANK.indexOf(x) - DOC_RANK.indexOf(y))[0] ?? 'valido'
      return { w, a, site: todayAssign ? db.sites[todayAssign.siteId] : undefined, week, worst, team: w.teamId ? db.teams[w.teamId] : undefined }
    })
  })

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => !q || `${r.w.name} ${r.w.number} ${r.w.category}`.toLowerCase().includes(q.toLowerCase()))
        .filter((r) => !team || (team === 'sem' ? !r.w.teamId : r.w.teamId === team))
        .filter((r) => !cat || r.w.category === cat)
        .filter((r) => !avail || r.a.state === avail || (avail === 'livre' && r.a.state === 'parcial'))
        .sort((a, b) => a.w.name.localeCompare(b.w.name)),
    [rows, q, team, cat, avail],
  )
  const teams = useDerived(({ db }) => Object.values(db.teams).sort((a, b) => a.name.localeCompare(b.name)))

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Trabalhadores"
        description={`${rows.filter((r) => r.w.status === 'ativo').length} ativos · ${rows.filter((r) => r.a.state === 'livre').length} livres hoje`}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Novo trabalhador
          </Button>
        }
      />
      <ModuleGuard empty={{ icon: <Users />, title: 'Ainda não há trabalhadores', text: 'Registe os trabalhadores para os planear em obra, registar horas e controlar documentos.', action: <Button variant="primary" onClick={() => setCreating(true)}>Registar trabalhador</Button> }}>
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
            <label className="sr-only" htmlFor="w-q">Pesquisar</label>
            <Input id="w-q" value={q} onChange={(e) => set('q', e.target.value)} placeholder="Nome, número ou categoria" className="w-64 pl-8" />
          </div>
          <label className="sr-only" htmlFor="w-team">Equipa</label>
          <Select id="w-team" value={team} onChange={(e) => set('equipa', e.target.value)} className="w-44">
            <option value="">Todas as equipas</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
            <option value="sem">Sem equipa</option>
          </Select>
          <label className="sr-only" htmlFor="w-cat">Categoria</label>
          <Select id="w-cat" value={cat} onChange={(e) => set('categoria', e.target.value)} className="w-48">
            <option value="">Todas as categorias</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <label className="sr-only" htmlFor="w-av">Disponibilidade hoje</label>
          <Select id="w-av" value={avail} onChange={(e) => set('disponibilidade', e.target.value)} className="w-44">
            <option value="">Qualquer disponibilidade</option>
            <option value="livre">Livres hoje</option>
            <option value="atribuido">Em obra hoje</option>
            <option value="ausente">Ausentes hoje</option>
          </Select>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          {filtered.length === 0 ? (
            <EmptyState icon={<Search />} title="Nenhum trabalhador encontrado">Ajuste a pesquisa ou os filtros.</EmptyState>
          ) : (
            <table className="table-a min-w-[860px]">
              <thead>
                <tr>
                  <th scope="col">Trabalhador</th>
                  <th scope="col">Categoria</th>
                  <th scope="col">Equipa</th>
                  <th scope="col">Hoje</th>
                  <th scope="col" className="num">Semana</th>
                  <th scope="col">Documentos</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ w, a, site, week, worst, team: t }) => (
                  <tr key={w.id}>
                    <td>
                      <Link to={`/trabalhadores/${w.id}`} className="flex items-center gap-2.5 font-medium text-ink hover:underline">
                        <Avatar name={w.name} size="sm" color={t?.color ?? '#7d847f'} />
                        <span>
                          {w.name}
                          <span className="block text-xs font-normal text-ink-3 tabular">N.º {w.number}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="text-ink-2">{w.category}</td>
                    <td>{t ? <Link to={`/equipas/${t.id}`} className="hover:underline">{t.name}</Link> : <span className="text-ink-3">—</span>}</td>
                    <td>
                      <span className="flex items-center gap-2">
                        <Badge tone={AVAIL[a.state].tone} dot>
                          {a.absence ? ABSENCE_TYPE[a.absence.type] : AVAIL[a.state].label}
                        </Badge>
                        {site && <SiteCode code={site.code} color={site.color} />}
                      </span>
                    </td>
                    <td className="num font-mono text-xs">{formatHours(week)}</td>
                    <td>
                      <Badge tone={worst === 'valido' ? 'ok' : worst === 'a_expirar' || worst === 'por_verificar' ? 'warn' : 'danger'} dot>
                        {worst === 'valido' ? 'Em dia' : DOC_STATE_LABEL[worst]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </ModuleGuard>
      {creating && <WorkerForm open onOpenChange={setCreating} />}
    </div>
  )
}
