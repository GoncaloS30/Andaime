import { Archive, ArrowLeft, Pencil, Plus, UserMinus, UserPlus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { SERIES } from '@/domain/palette'
import { cn } from '@/lib/cn'
import { Avatar, PhotoStack } from '@/ui/Avatar'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { errorMessage, isApiError } from '../../api/http'
import { atLeast } from '../../api/types'
import {
  addDaysIso,
  formatDate,
  todayIso,
  useArchiveTeam,
  useEmployeeOptions,
  useSaveTeam,
  useTeam,
  useTeamMembership,
  useTeams,
  type TeamDetail,
} from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { FormError } from '../auth/AuthLayout'
import { HistoryList } from './HistoryList'

function TeamForm({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing?: TeamDetail }) {
  const org = useActiveOrg()
  const save = useSaveTeam(org.id, existing?.id)
  const options = useEmployeeOptions(org.id, open)
  const navigate = useNavigate()
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? SERIES[0]!)
  const [foreman, setForeman] = useState(existing?.foremanEmployeeId ?? '')
  const [touched, setTouched] = useState(false)
  const nameError = name.trim().length < 2 ? 'Indique o nome da equipa.' : null

  const submit = () => {
    setTouched(true)
    if (nameError) return
    save.mutate(
      { name: name.trim(), color, foremanEmployeeId: foreman || null, version: existing?.version },
      {
        onSuccess: (team) => {
          toast.success(existing ? 'Equipa atualizada' : `Equipa ${team.name} criada`)
          onOpenChange(false)
          if (!existing) navigate(`/equipas/${team.id}`)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? `Editar ${existing.name}` : 'Nova equipa'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            {existing ? 'Guardar' : 'Criar equipa'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={isApiError(save.error, 'name-taken') ? save.error.message : save.error ? errorMessage(save.error) : null} />
        <Field label="Nome" error={touched ? nameError : null}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
        </Field>
        <Field label="Responsável" optional hint="Encarregado ou chefe de equipa. Com a conta ligada à ficha, vê esta equipa na sua área.">
          {(p) => (
            <Select {...p} value={foreman} onChange={(e) => setForeman(e.target.value)}>
              <option value="">Sem responsável</option>
              {options.data?.items.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} · {e.category}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Cor</legend>
          <div className="flex flex-wrap gap-2">
            {SERIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
                className={cn('size-7 rounded-full ring-offset-2', c === color && 'ring-2 ring-pinho')}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  )
}

export function TeamsPage() {
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const teams = useTeams(org.id)
  const [creating, setCreating] = useState(false)
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title="Equipas"
        description={teams.data ? `${teams.data.length} equipas · ${teams.data.reduce((s, t) => s + t.memberCount, 0)} trabalhadores em equipa` : undefined}
        actions={
          manager && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nova equipa
            </Button>
          )
        }
      />
      {teams.isPending ? (
        <SkeletonRows rows={6} />
      ) : teams.isError ? (
        <ErrorState onRetry={() => void teams.refetch()} />
      ) : teams.data.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState
            icon={<UsersRound />}
            title={manager ? 'Ainda não há equipas' : 'Não é responsável de nenhuma equipa'}
            action={manager && <Button variant="primary" onClick={() => setCreating(true)}>Criar equipa</Button>}
          >
            {manager ? 'Agrupe trabalhadores com um responsável para planear mais depressa.' : 'Peça ao escritório para o indicar como responsável de uma equipa.'}
          </EmptyState>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line bg-surface">
          {teams.data.map((t) => (
            <li key={t.id} className="border-b border-line-2 last:border-0">
              <Link
                to={`/equipas/${t.id}`}
                className="grid items-center gap-3 border-l-4 px-4 py-3 transition-colors hover:bg-cal md:grid-cols-[1.3fr_1.4fr_1fr]"
                style={{ borderLeftColor: t.color }}
              >
                <span className="min-w-0">
                  <span className="block font-wide text-base font-semibold">{t.name}</span>
                  <span className="block truncate text-xs text-ink-3">{t.foremanName ? `Responsável: ${t.foremanName}` : 'Sem responsável'}</span>
                </span>
                <span className="flex items-center gap-2">
                  <PhotoStack people={t.memberNames.map((n, i) => ({ id: `${t.id}-${i}`, name: n, color: t.color }))} max={5} />
                  <span className="text-xs text-ink-3">{t.memberCount} elementos</span>
                </span>
                <span>{t.memberCount === 0 ? <Badge tone="warn">Sem elementos</Badge> : <Badge dot>Ativa</Badge>}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <TeamForm open onOpenChange={setCreating} />}
    </div>
  )
}

function MemberDialog({ team, open, onOpenChange }: { team: TeamDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const org = useActiveOrg()
  const options = useEmployeeOptions(org.id, open)
  const membership = useTeamMembership(org.id, team.id)
  const [employeeId, setEmployeeId] = useState('')
  const [from, setFrom] = useState(todayIso())
  const current = new Set(team.members.map((m) => m.employeeId))
  const candidates = (options.data?.items ?? []).filter((e) => !current.has(e.id))
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Juntar à equipa ${team.name}`}
      description="Se o trabalhador estiver noutra equipa, sai dela na véspera. As semanas anteriores não mudam."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!employeeId || from < todayIso()}
            loading={membership.isPending}
            onClick={() =>
              membership.mutate(
                { action: 'join', employeeId, joinedOn: from },
                { onSuccess: () => (toast.success('Trabalhador adicionado'), onOpenChange(false), setEmployeeId('')) },
              )
            }
          >
            Juntar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={membership.error ? errorMessage(membership.error) : null} />
        <Field label="Trabalhador">
          {(p) => (
            <Select {...p} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Escolher…</option>
              {candidates.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} · {e.category}
                  {e.team ? ` (agora em ${e.team.name})` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="A partir de" hint="Hoje ou uma data futura." error={from < todayIso() ? 'Não é possível alterar o passado.' : null}>
          {(p) => <Input {...p} type="date" min={todayIso()} value={from} onChange={(e) => setFrom(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}

export function TeamDetailPage() {
  const { id = '' } = useParams()
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const team = useTeam(org.id, id)
  const membership = useTeamMembership(org.id, id)
  const archive = useArchiveTeam(org.id, id)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)

  if (team.isPending) return <SkeletonRows rows={8} />
  if (team.isError)
    return isApiError(team.error, 'not-found') ? (
      <EmptyState title="Equipa não encontrada" action={<Link to="/equipas" className="text-pinho underline">Voltar</Link>}>
        Não existe ou não está no seu âmbito.
      </EmptyState>
    ) : (
      <ErrorState onRetry={() => void team.refetch()} />
    )
  const t = team.data
  const past = t.history.filter((r) => r.leftOn && r.leftOn < todayIso())
  const future = t.history.filter((r) => r.joinedOn > todayIso())

  return (
    <div className="mx-auto max-w-[1280px]">
      <Link to="/equipas" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Equipas
      </Link>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-l-4 pl-3" style={{ borderLeftColor: t.color }}>
        <div>
          <h1 className="font-expanded text-2xl font-semibold tracking-tight">
            {t.name} {t.archived && <Badge>Arquivada</Badge>}
          </h1>
          <p className="text-sm text-ink-3">
            {t.members.length} elementos · {t.foremanName ? `Responsável: ${t.foremanName}` : 'sem responsável'}
          </p>
        </div>
        {manager && !t.archived && (
          <div className="flex flex-wrap gap-2">
            <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Editar
            </Button>
            <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
              Juntar trabalhador
            </Button>
            <Button
              variant="ghost"
              icon={<Archive className="size-4" />}
              loading={archive.isPending}
              onClick={() => archive.mutate(undefined, { onSuccess: () => toast.success('Equipa arquivada; os elementos saíram hoje.'), onError: (e) => toast.error(errorMessage(e)) })}
            >
              Arquivar
            </Button>
          </div>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Elementos hoje" flush>
          {t.members.length === 0 ? (
            <EmptyState compact title="A equipa não tem elementos hoje" />
          ) : (
            <ul className="divide-y divide-line-2">
              {t.members.map((m) => (
                <li key={m.employeeId} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={m.fullName} size="sm" color={t.color} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/trabalhadores/${m.employeeId}`} className="font-medium hover:underline">
                      {m.fullName}
                    </Link>
                    <p className="text-xs text-ink-3">
                      {m.category} · desde {formatDate(m.joinedOn)}
                      {m.leftOn && ` · sai a ${formatDate(addDaysIso(m.leftOn, 1))}`}
                    </p>
                  </div>
                  {m.employeeId === t.foremanEmployeeId && <Badge tone="accent">Responsável</Badge>}
                  {manager && !t.archived && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<UserMinus className="size-4" aria-hidden />}
                      aria-label={`Retirar ${m.fullName} da equipa`}
                      loading={membership.isPending && membership.variables?.employeeId === m.employeeId}
                      onClick={() =>
                        membership.mutate(
                          { action: 'leave', employeeId: m.employeeId, lastDay: todayIso() },
                          { onSuccess: () => toast.success(`${m.fullName} sai da equipa no fim de hoje`), onError: (e) => toast.error(errorMessage(e)) },
                        )
                      }
                    >
                      <span className="hidden sm:inline">Retirar</span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Composição ao longo do tempo" flush>
          {future.length + past.length === 0 ? (
            <EmptyState compact title="Sem entradas futuras nem saídas" />
          ) : (
            <ul className="divide-y divide-line-2 text-sm">
              {future.map((r) => (
                <li key={`f-${r.employeeId}-${r.joinedOn}`} className="px-4 py-2">
                  <strong className="font-medium">{r.fullName}</strong> entra a {formatDate(r.joinedOn)}
                </li>
              ))}
              {past.map((r) => (
                <li key={`p-${r.employeeId}-${r.joinedOn}`} className="px-4 py-2 text-ink-2">
                  <strong className="font-medium text-ink">{r.fullName}</strong> esteve de {formatDate(r.joinedOn)} a {formatDate(r.leftOn)}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {manager && (
        <div className="mt-5">
          <HistoryList entityType="team" id={id} />
        </div>
      )}
      {editing && <TeamForm open onOpenChange={setEditing} existing={t} />}
      {adding && <MemberDialog team={t} open onOpenChange={setAdding} />}
    </div>
  )
}
