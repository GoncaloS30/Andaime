import { Bell, CalendarDays, CloudOff, FileCheck2, House, Palmtree, RefreshCw, UserRound, Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { selectNotifications } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { AbsenceScreen, DocsScreen, NotificationsScreen, ProfileScreen, TodayScreen, UpcomingScreen, WeekScreen, type WorkerTab } from './WorkerScreens'

const TITLES: Record<WorkerTab, string> = {
  hoje: 'Hoje',
  proximas: 'Próximas atribuições',
  semana: 'A minha semana',
  ausencias: 'Ausências',
  documentos: 'Documentos',
  notificacoes: 'Notificações',
  perfil: 'Perfil',
}

const TABS: { tab: WorkerTab; label: string; icon: typeof House }[] = [
  { tab: 'hoje', label: 'Hoje', icon: House },
  { tab: 'semana', label: 'Semana', icon: CalendarDays },
  { tab: 'ausencias', label: 'Ausências', icon: Palmtree },
  { tab: 'documentos', label: 'Documentos', icon: FileCheck2 },
  { tab: 'perfil', label: 'Perfil', icon: UserRound },
]

interface Props {
  tab?: WorkerTab
  onTabChange?: (t: WorkerTab) => void
  /** Dentro do palco da apresentação (moldura de telemóvel). */
  embedded?: boolean
}

/** App do trabalhador: simples, de polegar, com botões grandes e um modo offline simulado. */
export function WorkerApp({ tab: controlled, onTabChange, embedded }: Props) {
  const [local, setLocal] = useState<WorkerTab>('hoje')
  const tab = controlled ?? local
  const go = (t: WorkerTab) => {
    if (onTabChange) onTabChange(t)
    else setLocal(t)
  }
  const db = useDemo((s) => s.db)
  const session = useDemo((s) => s.session)
  const setOnline = useDemo((s) => s.setOnline)
  const sync = useDemo((s) => s.syncOutbox)
  const unread = selectNotifications({ db, session: { ...session, role: 'trabalhador' } }).filter((n) => !n.read).length
  const { online, outbox, syncing } = session

  const doSync = async () => {
    const n = outbox.length
    await sync()
    toast.success(`${n} ${n === 1 ? 'operação sincronizada' : 'operações sincronizadas'}`, { description: 'O encarregado e o escritório já veem os registos.' })
  }

  return (
    <div className={cn('flex flex-col bg-cal', embedded ? 'h-full' : 'min-h-dvh')}>
      <header className={cn('sticky top-0 z-20 border-b border-line bg-surface/95 px-4 pb-2 backdrop-blur-sm', embedded ? 'pt-3' : 'pt-[max(0.75rem,env(safe-area-inset-top))]')}>
        <div className="flex items-center gap-2">
          <h1 className="flex-1 font-expanded text-lg font-semibold">{TITLES[tab]}</h1>
          <button
            type="button"
            onClick={() => setOnline(!online)}
            aria-pressed={!online}
            className={cn('flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold', online ? 'border-line text-ink-2' : 'border-tijolo bg-tijolo-soft text-tijolo-ink')}
            data-tour="worker-offline"
          >
            {online ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
            {online ? 'Com rede' : 'Sem rede'}
            <span className="sr-only">(simulação — carregue para alternar)</span>
          </button>
          <button type="button" onClick={() => go('notificacoes')} aria-label={unread ? `Notificações, ${unread} por ler` : 'Notificações'} className="relative flex size-9 items-center justify-center rounded-full hover:bg-line-2">
            <Bell className="size-5" aria-hidden />
            {unread > 0 && <span className="absolute top-0.5 right-0.5 min-w-4 rounded-full bg-tijolo px-1 text-[10px] leading-4 font-bold text-white">{unread}</span>}
          </button>
        </div>
        {(!online || outbox.length > 0) && (
          <div role="status" className={cn('mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-xs', online ? 'bg-ambar-soft text-ambar-ink' : 'bg-tijolo-soft text-tijolo-ink')}>
            {online ? <RefreshCw className={cn('size-4 shrink-0', syncing && 'animate-spin')} aria-hidden /> : <CloudOff className="size-4 shrink-0" aria-hidden />}
            <span className="flex-1">
              {!online
                ? `Sem rede (simulado). ${outbox.length ? `${outbox.length} ${outbox.length === 1 ? 'operação guardada' : 'operações guardadas'} no telemóvel.` : 'O que registar fica guardado no telemóvel.'}`
                : syncing
                  ? `A sincronizar… faltam ${outbox.length}`
                  : `${outbox.length} ${outbox.length === 1 ? 'operação por sincronizar' : 'operações por sincronizar'}.`}
            </span>
            {online && outbox.length > 0 && !syncing && (
              <Button size="sm" variant="primary" onClick={doSync} data-tour="worker-sync">Sincronizar</Button>
            )}
          </div>
        )}
        {outbox.length > 0 && (
          <ol className="mt-1.5 flex flex-wrap gap-1" aria-label="Operações pendentes">
            {outbox.map((o) => (
              <li key={o.id} className="rounded-xs bg-line-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2">{o.label} · {o.time}</li>
            ))}
          </ol>
        )}
      </header>

      <main className={cn('flex-1 overflow-y-auto px-4 py-4', embedded && 'min-h-0')}>
        {tab === 'hoje' && <TodayScreen go={go} />}
        {tab === 'proximas' && <UpcomingScreen />}
        {tab === 'semana' && <WeekScreen />}
        {tab === 'ausencias' && <AbsenceScreen />}
        {tab === 'documentos' && <DocsScreen />}
        {tab === 'notificacoes' && <NotificationsScreen go={go} />}
        {tab === 'perfil' && <ProfileScreen />}
      </main>

      <nav aria-label="App do trabalhador" className={cn('sticky bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface', !embedded && 'pb-[env(safe-area-inset-bottom)]')}>
        {TABS.map((t) => {
          const active = tab === t.tab || (t.tab === 'hoje' && tab === 'proximas')
          return (
            <button key={t.tab} type="button" onClick={() => go(t.tab)} aria-current={active ? 'page' : undefined} className={cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-pinho' : 'text-ink-3')}>
              {active && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-b-full bg-pinho" />}
              <t.icon className="size-5" aria-hidden strokeWidth={active ? 2.2 : 1.8} />
              {t.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
