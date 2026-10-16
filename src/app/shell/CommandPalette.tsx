import * as RD from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { Building2, CalendarPlus, CornerDownLeft, Search, Truck, User, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useDemo } from '@/store/store'
import { GESTOR_NAV } from '../nav'

const item =
  'flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm text-ink aria-selected:bg-line-2 [&_svg]:size-4 [&_svg]:text-ink-3'
const group = 'px-1 pt-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-3'

/** Pesquisa global: trabalhadores, obras, equipas, viaturas, páginas e ações. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDemo((s) => s.db)
  const role = useDemo((s) => s.session.role)
  const navigate = useNavigate()
  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }
  const gestor = role === 'gestor'

  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-pinho/30 animate-fade-in" />
        <RD.Content className="fixed top-[12vh] left-1/2 z-50 w-[min(600px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface shadow-e2 animate-pop-in focus:outline-none">
          <RD.Title className="sr-only">Pesquisar</RD.Title>
          <RD.Description className="sr-only">Pesquisar trabalhadores, obras, equipas, viaturas e páginas</RD.Description>
          <Command label="Pesquisa global" loop>
            <div className="flex items-center gap-2 border-b border-line-2 px-3">
              <Search className="size-4 text-ink-3" aria-hidden />
              <Command.Input
                autoFocus
                placeholder="Pesquisar trabalhadores, obras, matrículas…"
                className="h-12 flex-1 bg-transparent text-md outline-none placeholder:text-ink-4"
              />
            </div>
            <Command.List className="max-h-[56dvh] overflow-y-auto p-1 pb-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-ink-3">Nada encontrado. Experimente um nome, código de obra ou matrícula.</Command.Empty>
              {gestor && (
                <Command.Group heading="Ações" className={group}>
                  <Command.Item className={item} onSelect={() => go('/planeamento?nova=escala')}>
                    <CalendarPlus aria-hidden /> Nova escala
                  </Command.Item>
                  <Command.Item className={item} onSelect={() => go('/obras/nova')}>
                    <Building2 aria-hidden /> Nova obra
                  </Command.Item>
                </Command.Group>
              )}
              {gestor && (
                <Command.Group heading="Páginas" className={group}>
                  {GESTOR_NAV.flatMap((g) => g.items).map((n) => (
                    <Command.Item key={n.to} className={item} onSelect={() => go(n.to)} value={`página ${n.label}`}>
                      <n.icon aria-hidden /> {n.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {gestor && (
                <>
                  <Command.Group heading="Obras" className={group}>
                    {Object.values(db.sites).map((s) => (
                      <Command.Item key={s.id} className={item} value={`${s.code} ${s.name} ${s.city}`} onSelect={() => go(`/obras/${s.id}`)}>
                        <Building2 aria-hidden />
                        <span className="font-mono text-xs text-ink-3">{s.code}</span> {s.name}
                        <span className="ml-auto text-xs text-ink-3">{s.city}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Trabalhadores" className={group}>
                    {Object.values(db.workers).map((w) => (
                      <Command.Item key={w.id} className={item} value={`${w.name} ${w.number} ${w.category}`} onSelect={() => go(`/trabalhadores/${w.id}`)}>
                        <User aria-hidden /> {w.name}
                        <span className="ml-auto text-xs text-ink-3">{w.category}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Equipas" className={group}>
                    {Object.values(db.teams).map((t) => (
                      <Command.Item key={t.id} className={item} value={`equipa ${t.name}`} onSelect={() => go(`/equipas/${t.id}`)}>
                        <UsersRound aria-hidden /> {t.name}
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Viaturas" className={group}>
                    {Object.values(db.vehicles).map((v) => (
                      <Command.Item key={v.id} className={item} value={`${v.plate} ${v.make} ${v.model}`} onSelect={() => go(`/viaturas/${v.id}`)}>
                        <Truck aria-hidden /> <span className="font-mono text-xs">{v.plate}</span> {v.make} {v.model}
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              )}
            </Command.List>
            <div className="flex items-center gap-3 border-t border-line-2 px-3 py-2 text-xs text-ink-3">
              <span className="flex items-center gap-1">
                <CornerDownLeft className="size-3" aria-hidden /> abrir
              </span>
              <span>↑↓ navegar</span>
              <span>Esc fechar</span>
            </div>
          </Command>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
