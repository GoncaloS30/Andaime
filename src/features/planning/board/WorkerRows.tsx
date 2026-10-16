import { ChevronDown, Copy, CopyPlus, MoreHorizontal, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { entryHours } from '@/domain/hours'
import { ABSENCE_TYPE } from '@/domain/labels'
import type { ID, Team, Worker } from '@/domain/types'
import { dayShort, isWeekend } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Plate, SiteCode } from '@/ui/Badge'
import { IconButton } from '@/ui/Button'
import { Menu } from '@/ui/Menu'
import { cellOf } from '../model'
import { usePlanning } from '../PlanningContext'
import { DropCell } from './Cell'
import { AssignmentChip } from './Chip'
import { GRID_COLS } from './DayHeader'

interface Props {
  onDuplicateTeam: (teamId: ID) => void
  onCopyTeam: (teamId: ID) => void
}

export function WorkerRows({ onDuplicateTeam, onCopyTeam }: Props) {
  const { db, query, filterTeam, filterSite, days } = usePlanning()
  const q = query.trim().toLowerCase()
  const teams = Object.values(db.teams).sort((a, b) => a.name.localeCompare(b.name))
  const groups: { team: Team | null; workers: Worker[] }[] = teams.map((t) => ({
    team: t,
    workers: t.memberIds.map((id) => db.workers[id]!).filter(Boolean),
  }))
  const loose = Object.values(db.workers).filter((w) => !w.teamId || !db.teams[w.teamId])
  if (loose.length) groups.push({ team: null, workers: loose })

  const visible = groups
    .filter((g) => !filterTeam || g.team?.id === filterTeam)
    .map((g) => ({
      ...g,
      workers: g.workers
        .filter((w) => !q || w.name.toLowerCase().includes(q) || w.category.toLowerCase().includes(q))
        .filter((w) => !filterSite || days.some((d) => cellOf(db, w.id, d).assignments.some((a) => a.siteId === filterSite)))
        .sort((a, b) => Number(b.id === g.team?.foremanId) - Number(a.id === g.team?.foremanId) || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.workers.length > 0)

  if (visible.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-ink-3">Nenhum trabalhador corresponde aos filtros.</p>
  }

  return (
    <>
      {visible.map((g) => (
        <TeamGroup key={g.team?.id ?? 'sem'} team={g.team} workers={g.workers} onDuplicateTeam={onDuplicateTeam} onCopyTeam={onCopyTeam} />
      ))}
    </>
  )
}

function TeamGroup({ team, workers, onDuplicateTeam, onCopyTeam }: { team: Team | null; workers: Worker[] } & Props) {
  const [open, setOpen] = useState(true)
  const { db } = usePlanning()
  const navigate = useNavigate()
  const site = team?.siteId ? db.sites[team.siteId] : undefined
  const vehicle = team?.vehicleId ? db.vehicles[team.vehicleId] : undefined
  const foreman = team?.foremanId ? db.workers[team.foremanId] : undefined
  return (
    <div>
      <div className="sticky left-0 flex items-center gap-2 border-t border-line bg-cal/80 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-line-2"
        >
          <ChevronDown aria-hidden className={cn('size-3.5 text-ink-3 transition-transform', !open && '-rotate-90')} />
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: team?.color ?? '#9aa09b' }} />
          <span className="truncate font-wide text-sm font-semibold text-ink">{team?.name ?? 'Sem equipa'}</span>
          <span className="text-xs text-ink-3 tabular">{workers.length}</span>
        </button>
        {team && (
          <span className="hidden min-w-0 items-center gap-2 text-xs text-ink-3 md:flex">
            {foreman && <span className="truncate">Resp.: {foreman.name}</span>}
            {site && <SiteCode code={site.code} color={site.color} />}
            {vehicle && <Plate plate={vehicle.plate} />}
          </span>
        )}
        {team && (
          <span className="ml-auto">
            <Menu
              trigger={
                <IconButton label={`Ações da equipa ${team.name}`} size="sm">
                  <MoreHorizontal className="size-4" />
                </IconButton>
              }
              items={[
                { label: 'Duplicar escala para outras semanas', icon: <CopyPlus />, onSelect: () => onDuplicateTeam(team.id) },
                { label: 'Copiar semana anterior desta equipa', icon: <Copy />, onSelect: () => onCopyTeam(team.id) },
                'separator',
                { label: 'Abrir equipa', icon: <UsersRound />, onSelect: () => navigate(`/equipas/${team.id}`) },
              ]}
            />
          </span>
        )}
      </div>
      {open && workers.map((w) => <WorkerRow key={w.id} w={w} team={team} />)}
    </div>
  )
}

function WorkerRow({ w, team }: { w: Worker; team: Team | null }) {
  const ctx = usePlanning()
  const settings = useDemo((s) => s.session.settings)
  const { db, days, today } = ctx
  const isLeader = team?.foremanId === w.id
  return (
    <div className={cn('grid', GRID_COLS)} data-worker={w.id}>
      <div className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-t border-line-2 bg-surface px-3 py-1.5">
        <Avatar name={w.name} photo={w.photo} size="sm" color={team?.color ?? '#7d847f'} onSite={cellOf(db, w.id, today).assignments.length > 0} />
        <span className="min-w-0">
          <Link to={`/trabalhadores/${w.id}`} className="block truncate text-sm font-medium text-ink hover:underline">
            {w.name}
          </Link>
          <span className="block truncate text-[11px] text-ink-3">
            {isLeader ? 'Responsável · ' : ''}
            {w.category}
          </span>
        </span>
      </div>
      {days.map((d) => {
        const cell = cellOf(db, w.id, d)
        const fullAbsence = cell.absence && cell.absence.type !== 'parcial' ? cell.absence : undefined
        const capacity = fullAbsence ? 0 : w.dailyHours - (cell.absence?.type === 'parcial' ? (cell.absence.hours ?? 0) : 0)
        const hours = cell.assignments.reduce((s, a) => s + a.hours, 0)
        return (
          <DropCell
            key={d}
            id={`wd:${w.id}:${d}`}
            data={{ type: 'worker-day', workerId: w.id, date: d }}
            today={d === today}
            weekend={isWeekend(d)}
            muted={!!fullAbsence}
            ruler={!fullAbsence && (hours > 0 || !isWeekend(d)) ? { hours, capacity } : undefined}
            onAdd={fullAbsence ? undefined : () => ctx.add({ workerId: w.id, date: d })}
            addLabel={`Atribuir ${w.name} em ${d}`}
          >
            {cell.absence && (
              <span className={cn('rounded-xs px-1 py-0.5 text-[10.5px] font-semibold', fullAbsence ? 'bg-surface/80 text-ink-2' : 'text-ambar-ink')}>
                {ABSENCE_TYPE[cell.absence.type]}
                {cell.absence.type === 'parcial' && ` · ${cell.absence.hours}h`}
              </span>
            )}
            {cell.assignments.map((a) => {
              const entry = cell.entries.find((e) => e.siteId === a.siteId && e.status !== 'rejeitado')
              return (
                <AssignmentChip
                  key={a.id}
                  a={a}
                  site={db.sites[a.siteId]}
                  entry={entry}
                  realizedHours={entry && entry.clockOut ? entryHours(entry, settings).worked : undefined}
                  conflicts={ctx.conflictsByAssignment.get(a.id)}
                  muteCode={!!team && a.siteId === team.siteId}
                  resizable={a.date >= today}
                  selected={ctx.selected.has(a.id)}
                  focused={ctx.focusIds.has(a.id) || ctx.recentIds.has(a.id)}
                  dimmed={!!ctx.filterSite && a.siteId !== ctx.filterSite}
                  today={today}
                  context={`${w.name}, ${dayShort(d)} ${d.slice(8)}`}
                  onSelect={ctx.select}
                  onOpen={ctx.open}
                />
              )
            })}
          </DropCell>
        )
      })}
    </div>
  )
}
