import { History } from 'lucide-react'
import type { ActivityEvent } from '@/domain/types'
import { dateShort } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { EmptyState } from '@/ui/States'

const ROLE_TAG = { gestor: 'Gestor', encarregado: 'Encarregado', trabalhador: 'Trabalhador', sistema: 'Sistema' } as const

export function ActivityList({ events, limit = 12, className, empty = 'Ainda não há histórico.' }: { events: ActivityEvent[]; limit?: number; className?: string; empty?: string }) {
  const today = useDemo((s) => s.session.today)
  if (events.length === 0) return <EmptyState compact icon={<History />} title="Sem atividade">{empty}</EmptyState>
  return (
    <ol className={cn('flex flex-col', className)}>
      {events.slice(0, limit).map((e) => {
        const day = e.at.slice(0, 10)
        return (
          <li key={e.id} className="flex gap-2.5 py-2 first:pt-0">
            {e.role === 'sistema' ? (
              <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-line-2 text-[10px] font-bold text-ink-3">
                A
              </span>
            ) : (
              <Avatar name={e.actor} size="xs" className="mt-0.5 size-6 text-[9px]" color={e.role === 'gestor' ? '#13342a' : e.role === 'encarregado' ? '#3b6a8c' : '#6f9a84'} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-ink">
                <span className="font-semibold">{e.actor}</span> <span className="text-ink-2">{e.text.charAt(0).toLowerCase() + e.text.slice(1)}</span>
              </p>
              <p className="mt-0.5 text-xs text-ink-3">
                {ROLE_TAG[e.role]} · {day === today ? `hoje, ${e.at.slice(11, 16)}` : `${dateShort(day)}, ${e.at.slice(11, 16)}`}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
