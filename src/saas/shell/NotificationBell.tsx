import { Bell } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { cn } from '@/lib/cn'
import { Button, IconButton } from '@/ui/Button'
import { Popover } from '@/ui/Menu'
import { useMarkNotificationsRead, useNotifications } from '../api/operations'
import { useActiveOrg } from '../session'

const WHEN = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Notificações persistentes do utilizador na empresa ativa (pedidos, decisões, validades). */
export function NotificationBell() {
  const org = useActiveOrg()
  const inbox = useNotifications(org.id)
  const markRead = useMarkNotificationsRead(org.id)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const unread = inbox.data?.unread ?? 0
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      label="Notificações"
      className="w-[min(22rem,calc(100vw-24px))] p-0"
      trigger={
        <IconButton label={unread ? `Notificações, ${unread} por ler` : 'Notificações'} className="relative">
          <Bell className="size-5" />
          {unread > 0 && (
            <span aria-hidden className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-tijolo px-1 text-[10px] leading-4 font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </IconButton>
      }
    >
      <div className="flex items-center justify-between border-b border-line-2 px-3 py-2">
        <span className="text-sm font-semibold text-ink">Notificações</span>
        {unread > 0 && (
          <Button variant="ghost" size="sm" loading={markRead.isPending} onClick={() => markRead.mutate([])}>
            Marcar todas como lidas
          </Button>
        )}
      </div>
      {(inbox.data?.items ?? []).length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-ink-3">Sem notificações.</p>
      ) : (
        <ul className="max-h-96 overflow-y-auto">
          {inbox.data!.items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn('flex w-full flex-col items-start gap-0.5 border-b border-line-2 px-3 py-2 text-left last:border-0 hover:bg-cal', !n.read && 'bg-lima-soft/30')}
                onClick={() => {
                  if (!n.read) markRead.mutate([n.id])
                  setOpen(false)
                  if (n.link) navigate(n.link)
                }}
              >
                <span className={cn('text-sm text-ink', !n.read && 'font-semibold')}>{n.title}</span>
                {n.body && <span className="text-xs text-ink-3">{n.body}</span>}
                <span className="text-[11px] text-ink-4">{WHEN.format(new Date(n.createdAt))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  )
}
