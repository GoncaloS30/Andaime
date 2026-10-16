import { Check, ChevronDown, HardHat, Smartphone, Briefcase } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ROLE_HOME, ROLE_LABEL } from '@/copy'
import { LEADER_CATEGORIES } from '@/domain/labels'
import type { Role } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Popover } from '@/ui/Menu'

const ICON = { gestor: Briefcase, encarregado: HardHat, trabalhador: Smartphone }

/** Alterna entre as três experiências e escolhe a persona de cada uma. */
export function RoleSwitcher({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const role = useDemo((s) => s.session.role)
  const personas = useDemo((s) => s.session.personas)
  const db = useDemo((s) => s.db)
  const setRole = useDemo((s) => s.setRole)
  const setPersona = useDemo((s) => s.setPersona)

  const nameOf = (r: Role) => (r === 'gestor' ? db.managers[personas.gestor]?.name : db.workers[personas[r]]?.name) ?? ''
  const Icon = ICON[role]

  const choose = (r: Role) => {
    setRole(r)
    setOpen(false)
    navigate(ROLE_HOME[r])
  }

  const leaders = Object.values(db.workers)
    .filter((w) => LEADER_CATEGORIES.includes(w.category) && Object.values(db.teams).some((t) => t.foremanId === w.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const workers = Object.values(db.workers).filter((w) => w.status === 'ativo').sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      label="Mudar de experiência"
      className="w-80 p-2"
      trigger={
        <button
          type="button"
          data-tour="role-switcher"
          className="flex h-9 items-center gap-2 rounded-md border border-line bg-surface pr-2 pl-1.5 text-sm hover:border-ink-4"
          aria-label={compact ? `Experiência: ${ROLE_LABEL[role]}, ${nameOf(role)}. Mudar.` : undefined}
        >
          <span className="flex size-6 items-center justify-center rounded-sm bg-pinho text-lima">
            <Icon className="size-3.5" aria-hidden />
          </span>
          {!compact && (
            <span className="hidden flex-col items-start leading-tight xl:flex">
              <span className="text-[11px] text-ink-3">{ROLE_LABEL[role]}</span>
              <span className="max-w-32 truncate text-xs font-semibold text-ink">{nameOf(role)}</span>
            </span>
          )}
          {!compact && <span className="sr-only xl:hidden">{ROLE_LABEL[role]} {nameOf(role)}</span>}
          {!compact && <span className="sr-only">(mudar de experiência)</span>}
          <ChevronDown className="size-3.5 text-ink-3" aria-hidden />
        </button>
      }
    >
      <p className="px-2 pt-1 pb-2 text-xs text-ink-3">Ver o Andaime como…</p>
      <ul className="flex flex-col gap-1">
        {(['gestor', 'encarregado', 'trabalhador'] as Role[]).map((r) => {
          const I = ICON[r]
          const active = r === role
          return (
            <li key={r} className={cn('rounded-md border', active ? 'border-pinho bg-lima-soft/50' : 'border-transparent')}>
              <button
                type="button"
                onClick={() => choose(r)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-line-2"
              >
                <span className="flex size-8 items-center justify-center rounded-md bg-pinho text-lima">
                  <I className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{ROLE_LABEL[r]}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {r === 'gestor' ? 'Backoffice completo' : r === 'encarregado' ? 'Só as obras e equipas que gere' : 'App no telemóvel'} · {nameOf(r)}
                  </span>
                </span>
                {active && <Check className="size-4 text-pinho" aria-label="Ativo" />}
              </button>
              {r !== 'gestor' && (
                <div className="px-2 pb-2">
                  <label className="sr-only" htmlFor={`persona-${r}`}>
                    Persona {ROLE_LABEL[r]}
                  </label>
                  <select
                    id={`persona-${r}`}
                    value={personas[r]}
                    onChange={(e) => {
                      setPersona(r, e.target.value)
                      if (r === role) navigate(ROLE_HOME[r])
                    }}
                    className="h-8 w-full rounded-sm border border-line bg-surface px-2 text-xs"
                  >
                    {(r === 'encarregado' ? leaders : workers).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} · {r === 'encarregado' ? Object.values(db.teams).find((t) => t.foremanId === w.id)?.name : w.category}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-2 flex items-center gap-2 border-t border-line-2 px-2 pt-2 text-xs text-ink-3">
        <Avatar name={nameOf(role)} size="xs" />
        As permissões são simuladas nesta demonstração.
      </div>
    </Popover>
  )
}
