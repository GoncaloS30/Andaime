import { ArrowLeft, CalendarRange, Copy, Crown, UserMinus, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { availability, type AvailabilityState } from '@/domain/availability'
import { buildIndex } from '@/domain/indexes'
import { LEADER_CATEGORIES } from '@/domain/labels'
import { dateShort, dayShort, weekDays, weekStart } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Plate } from '@/ui/Badge'
import { Button, IconButton, buttonStyles } from '@/ui/Button'
import { Field, Select } from '@/ui/Field'
import { Panel } from '@/ui/Layout'
import { EmptyState } from '@/ui/States'
import { ActivityList } from '../shared/ActivityList'
import { ConflictCard } from '../shared/ConflictCard'

const CELL: Record<AvailabilityState, { label: string; cls: string }> = {
  livre: { label: 'Livre', cls: 'bg-ok-soft text-ok' },
  parcial: { label: 'Parcial', cls: 'bg-ambar-soft text-ambar-ink' },
  atribuido: { label: 'Em obra', cls: 'bg-musgo-soft text-pinho' },
  ausente: { label: 'Ausente', cls: 'bg-tijolo-soft text-tijolo-ink' },
  inativo: { label: 'Inativo', cls: 'bg-line-2 text-ink-3' },
}

export function TeamDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const updateTeam = useDemo((s) => s.updateTeam)
  const duplicateTeam = useDemo((s) => s.duplicateTeam)
  const previewVehicle = useDemo((s) => s.previewTeamVehicle)
  const setTeamVehicle = useDemo((s) => s.setTeamVehicle)
  const undo = useDemo((s) => s.undo)
  const t = db.teams[id]
  const [add, setAdd] = useState('')
  const [vehicle, setVehicle] = useState(t?.vehicleId ?? '')
  const days = weekDays(weekStart(today))
  const grid = useDerived(({ db: d }) => {
    const idx = buildIndex(d)
    return (d.teams[id]?.memberIds ?? []).map((m) => ({ w: d.workers[m]!, cells: days.map((x) => availability(d.workers[m]!, x, idx)) }))
  }, [id])
  const vehicleConflicts = useMemo(() => (t && vehicle && vehicle !== t.vehicleId ? previewVehicle(id, vehicle, today) : []), [db, vehicle]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!t) return <EmptyState title="Equipa não encontrada" action={<Link to="/equipas" className="text-pinho underline">Voltar</Link>}>Pode ter sido removida ao repor a demonstração.</EmptyState>
  const site = t.siteId ? db.sites[t.siteId] : undefined
  const v = t.vehicleId ? db.vehicles[t.vehicleId] : undefined
  const candidates = Object.values(db.workers).filter((w) => w.status === 'ativo' && !t.memberIds.includes(w.id)).sort((a, b) => Number(!!a.teamId) - Number(!!b.teamId) || a.name.localeCompare(b.name))
  const done = (m: string) => toast.success(m, { action: { label: 'Anular', onClick: () => undo() } })
  const history = [...t.history.map((h, i) => ({ id: `h${i}`, at: h.at, actor: 'Equipa', role: 'sistema' as const, kind: 'equipa', text: h.text, refs: {} })), ...db.activity.filter((e) => e.refs.teamId === id)].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="mx-auto max-w-[1280px]">
      <Link to="/equipas" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Equipas
      </Link>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-l-4 pl-3" style={{ borderLeftColor: t.color }}>
        <div>
          <h1 className="font-expanded text-2xl font-semibold tracking-tight">{t.name}</h1>
          <p className="text-sm text-ink-3">
            {t.memberIds.length} elementos · {site ? `${site.code} ${site.name}` : 'sem obra'} {v && <>· <Plate plate={v.plate} /></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/planeamento?equipa=${id}`} className={buttonStyles('secondary')}>
            <CalendarRange className="size-4" aria-hidden /> Ver no planeamento
          </Link>
          <Button
            icon={<Copy className="size-4" />}
            onClick={() => {
              const nid = duplicateTeam(id)
              toast.success('Equipa duplicada', { description: 'Escolha os elementos e a viatura da nova equipa.' })
              navigate(`/equipas/${nid}`)
            }}
          >
            Duplicar equipa
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Composição" description="O responsável lidera a equipa no terreno e revê as horas." flush>
            <ul className="divide-y divide-line-2">
              {t.memberIds.map((m) => {
                const w = db.workers[m]
                if (!w) return null
                const isLead = t.foremanId === m
                return (
                  <li key={m} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={w.name} photo={w.photo} size="sm" color={t.color} />
                    <Link to={`/trabalhadores/${m}`} className="min-w-0 flex-1 hover:underline">
                      <span className="block truncate text-sm font-medium">{w.name}</span>
                      <span className="block text-xs text-ink-3">{w.category}</span>
                    </Link>
                    {isLead ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-ambar-ink">
                        <Crown className="size-3.5" aria-hidden /> Responsável
                      </span>
                    ) : (
                      LEADER_CATEGORIES.includes(w.category) && (
                        <Button size="sm" variant="ghost" onClick={() => { updateTeam(id, { foremanId: m }); done(`${w.name} é agora o responsável`) }}>
                          Tornar responsável
                        </Button>
                      )
                    )}
                    <IconButton label={`Retirar ${w.name} da equipa`} size="sm" onClick={() => { updateTeam(id, { memberIds: t.memberIds.filter((x) => x !== m) }); done(`${w.name} saiu da equipa`) }}>
                      <UserMinus className="size-4" />
                    </IconButton>
                  </li>
                )
              })}
            </ul>
            <div className="flex items-end gap-2 border-t border-line-2 p-3">
              <Field label="Juntar trabalhador" className="flex-1">
                {(p) => (
                  <Select {...p} value={add} onChange={(e) => setAdd(e.target.value)}>
                    <option value="">Escolher…</option>
                    {candidates.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} · {w.category}{w.teamId ? ` (sai de ${db.teams[w.teamId]?.name})` : ''}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Button icon={<UserPlus className="size-4" />} disabled={!add} onClick={() => { updateTeam(id, { memberIds: [...t.memberIds, add] }); done(`${db.workers[add]?.name} entrou na equipa`); setAdd('') }}>
                Juntar
              </Button>
            </div>
          </Panel>

          <Panel title="Disponibilidade da semana" flush>
            <div className="overflow-x-auto">
              <table className="table-a min-w-[620px]">
                <thead>
                  <tr>
                    <th scope="col">Elemento</th>
                    {days.map((d) => (
                      <th key={d} scope="col" className={cn(d === today && 'text-pinho')}>{dayShort(d)} {d.slice(8)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.map(({ w, cells }) => (
                    <tr key={w.id}>
                      <td className="whitespace-nowrap">{w.name}</td>
                      {cells.map((c, i) => (
                        <td key={i}>
                          <span className={cn('inline-block rounded-xs px-1.5 py-0.5 text-[11px] font-semibold', CELL[c.state].cls)}>{CELL[c.state].label}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Obra associada">
            <Field label="Obra habitual da equipa">
              {(p) => (
                <Select {...p} value={t.siteId ?? ''} onChange={(e) => { updateTeam(id, { siteId: e.target.value || null }); done('Obra associada atualizada') }}>
                  <option value="">Sem obra</option>
                  {Object.values(db.sites).map((s) => (
                    <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
                  ))}
                </Select>
              )}
            </Field>
            <p className="mt-2 text-xs text-ink-3">Para mover o planeamento da equipa para outra obra, use o Planeamento ou a transferência.</p>
          </Panel>
          <Panel title="Viatura" description={v ? `${v.make} ${v.model} · ${v.seats} lugares para ${t.memberIds.length} pessoas` : 'Sem viatura atribuída'}>
            <Field label="Atribuir viatura a partir de hoje">
              {(p) => (
                <Select {...p} value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
                  <option value="">Escolher…</option>
                  {Object.values(db.vehicles).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.plate} · {x.seats} lugares{x.teamId && x.teamId !== id ? ` · com ${db.teams[x.teamId]?.name}` : ''}{x.status !== 'operacional' ? ' · indisponível' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {vehicleConflicts.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {vehicleConflicts.map((c) => <ConflictCard key={c.id} conflict={c} preview />)}
              </div>
            )}
            <Button
              className="mt-3 w-full"
              variant="primary"
              disabled={!vehicle || vehicle === t.vehicleId}
              onClick={() => { setTeamVehicle(id, vehicle, today); done(`Viatura ${db.vehicles[vehicle]?.plate} atribuída a ${t.name}`) }}
            >
              {vehicleConflicts.length ? 'Atribuir mesmo assim' : 'Atribuir viatura'}
            </Button>
          </Panel>
          <Panel title="Histórico">
            <ActivityList events={history} limit={20} />
            <p className="mt-2 text-xs text-ink-3">Desde {dateShort(t.history[0]?.at.slice(0, 10) ?? today)}</p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
