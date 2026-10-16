import { Copy, CopyPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { SKIP_REASON } from '@/domain/planning'
import type { ID, ISODate } from '@/domain/types'
import { addDays, dateShort, dayShort, isoWeek, weekLabel } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { Checkbox, ChipToggle } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'

interface CopyProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  targetWeek: ISODate
  teamIds?: ID[]
}

/** Copiar a semana anterior para a semana visível, com pré-visualização do que fica de fora. */
export function CopyWeekDialog({ open, onOpenChange, targetWeek, teamIds: initialTeams }: CopyProps) {
  const db = useDemo((s) => s.db)
  const previewCopy = useDemo((s) => s.previewCopyWeek)
  const applyCopy = useDemo((s) => s.applyCopyWeek)
  const undo = useDemo((s) => s.undo)
  const fromWeek = addDays(targetWeek, -7)
  const allTeams = Object.values(db.teams).sort((a, b) => a.name.localeCompare(b.name))
  const [teams, setTeams] = useState<ID[]>(initialTeams ?? allTeams.map((t) => t.id))
  const plan = useMemo(() => previewCopy(fromWeek, targetWeek, { teamIds: teams }), [db, fromWeek, targetWeek, teams]) // eslint-disable-line react-hooks/exhaustive-deps
  const perTeam = new Map<ID, number>()
  for (const d of plan.drafts) if (d.teamId) perTeam.set(d.teamId, (perTeam.get(d.teamId) ?? 0) + 1)

  const apply = () => {
    const res = applyCopy(fromWeek, targetWeek, { teamIds: teams })
    toast.success(`Semana ${isoWeek(fromWeek)} copiada para a semana ${isoWeek(targetWeek)}`, {
      description: `${res.created} atribuições criadas${plan.skipped.length ? `, ${plan.skipped.length} ficaram de fora` : ''}.`,
      action: { label: 'Anular', onClick: () => undo() },
    })
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      eyebrow="Copiar semana anterior"
      title={`Semana ${isoWeek(fromWeek)} → semana ${isoWeek(targetWeek)}`}
      description={`${weekLabel(fromWeek)} para ${weekLabel(targetWeek)}. Dias já planeados não são substituídos.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={plan.drafts.length === 0} icon={<Copy className="size-4" />} onClick={apply}>
            Copiar {plan.drafts.length} atribuições
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Equipas a copiar</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {allTeams.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2">
              <Checkbox
                label={
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: t.color }} />
                    {t.name}
                  </span>
                }
                checked={teams.includes(t.id)}
                onChange={() => setTeams((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))}
              />
              <span className="text-xs text-ink-3 tabular">{perTeam.get(t.id) ?? 0}</span>
            </div>
          ))}
        </div>
      </fieldset>
      {plan.skipped.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-semibold">Fica de fora ({plan.skipped.length})</p>
          <ul className="max-h-48 divide-y divide-line-2 overflow-y-auto rounded-md border border-line text-sm">
            {plan.skipped.map((s) => (
              <li key={`${s.workerId}-${s.date}`} className="flex justify-between gap-3 px-3 py-1.5">
                <span className="truncate">
                  {db.workers[s.workerId]?.name} · {dayShort(s.date)} {dateShort(s.date)}
                </span>
                <span className="shrink-0 text-xs text-ink-3">{SKIP_REASON[s.reason]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.drafts.length === 0 && (
        <p className="mt-4 rounded-md bg-cal px-3 py-2.5 text-sm text-ink-2">
          Nada para copiar: a semana de destino já está planeada para estas equipas ou a semana anterior está vazia.
        </p>
      )}
    </Dialog>
  )
}

interface DupProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  teamId: ID
  week: ISODate
}

/** Duplicar a escala de uma equipa para as semanas seguintes. */
export function DuplicateTeamWeekDialog({ open, onOpenChange, teamId, week }: DupProps) {
  const db = useDemo((s) => s.db)
  const previewCopy = useDemo((s) => s.previewCopyWeek)
  const applyCopy = useDemo((s) => s.applyCopyWeek)
  const undo = useDemo((s) => s.undo)
  const team = db.teams[teamId]
  const targets = [1, 2, 3, 4].map((i) => addDays(week, i * 7))
  const [chosen, setChosen] = useState<ISODate[]>([targets[0]!])
  const counts = useMemo(
    () => Object.fromEntries(targets.map((t) => [t, previewCopy(week, t, { teamIds: [teamId] }).drafts.length])),
    [db, week, teamId], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const total = chosen.reduce((s, t) => s + (counts[t] ?? 0), 0)

  const apply = () => {
    let created = 0
    let applied = 0
    for (const t of chosen) {
      const n = applyCopy(week, t, { teamIds: [teamId] }).created
      created += n
      if (n > 0) applied++
    }
    toast.success(`Escala de ${team?.name} duplicada`, {
      description: `${created} atribuições em ${chosen.length} ${chosen.length === 1 ? 'semana' : 'semanas'}.`,
      action: {
        label: 'Anular',
        onClick: () => {
          for (let i = 0; i < applied; i++) undo()
        },
      },
    })
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      eyebrow="Duplicar escala"
      title={team ? team.name : 'Equipa'}
      description={`Copia a semana ${isoWeek(week)} desta equipa para as semanas escolhidas.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={total === 0} icon={<CopyPlus className="size-4" />} onClick={apply}>
            Duplicar {total} atribuições
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        {targets.map((t) => (
          <ChipToggle
            key={t}
            pressed={chosen.includes(t)}
            onClick={() => setChosen((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}
            className="justify-between rounded-md"
          >
            <span>
              Semana {isoWeek(t)} · {weekLabel(t)}
            </span>
            <span className="tabular opacity-80">{counts[t] ? `${counts[t]} novas` : 'já planeada'}</span>
          </ChipToggle>
        ))}
      </div>
    </Dialog>
  )
}
