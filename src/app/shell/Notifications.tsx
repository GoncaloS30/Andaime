import { Bell, CheckCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { dateShort } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { selectNotifications } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { Button, IconButton } from '@/ui/Button'
import { Popover } from '@/ui/Menu'
import { EmptyState } from '@/ui/States'

export function Notifications() {
  const [open, setOpen] = useState(false)
  const db = useDemo((s) => s.db)
  const session = useDemo((s) => s.session)
  const markAll = useDemo((s) => s.markNotificationsRead)
  const markOne = useDemo((s) => s.markNotificationRead)
  const navigate = useNavigate()
  const list = useMemo(() => selectNotifications({ db, session }).slice(0, 30), [db, session])
  const unread = list.filter((n) => !n.read).length

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      label="Notificações"
      className="w-[min(380px,calc(100vw-24px))] p-0"
      trigger={
        <IconButton label={unread ? `Notificações: ${unread} por ler` : 'Notificações'} className="relative">
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-tijolo px-1 text-[10px] font-bold text-white tabular">
              {unread}
            </span>
          )}
        </IconButton>
      }
    >
      <div className="flex items-center justify-between border-b border-line-2 px-3 py-2">
        <p className="font-wide text-sm font-semibold">Notificações</p>
        <Button size="sm" variant="ghost" icon={<CheckCheck className="size-3.5" />} onClick={markAll} disabled={!unread}>
          Marcar como lidas
        </Button>
      </div>
      {list.length === 0 ? (
        <EmptyState compact icon={<Bell />} title="Sem notificações">
          Quando houver pedidos, escalas ou registos para tratar, aparecem aqui.
        </EmptyState>
      ) : (
        <ul className="max-h-[60dvh] overflow-y-auto">
          {list.map((n) => (
            <li key={n.id} className="border-b border-line-2 last:border-0">
              <button
                type="button"
                onClick={() => {
                  markOne(n.id)
                  setOpen(false)
                  if (n.link) navigate(n.link)
                }}
                className="flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-cal"
              >
                <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-tijolo')} />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2">
                    <span className={cn('text-sm text-ink', !n.read && 'font-semibold')}>{n.title}</span>
                    <span className="shrink-0 text-xs text-ink-3 tabular">
                      {n.at.slice(0, 10) === session.today ? n.at.slice(11, 16) : dateShort(n.at.slice(0, 10))}
                    </span>
                  </span>
                  {n.body && <span className="mt-0.5 block text-xs text-ink-3">{n.body}</span>}
                  {!n.read && <span className="sr-only">Por ler</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  )
}
