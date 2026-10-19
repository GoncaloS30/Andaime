import { CalendarDays, Cloud, Link2, Unlink } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { dateShort } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { Badge } from '@/ui/Badge'
import { Button, buttonStyles } from '@/ui/Button'
import { Panel } from '@/ui/Layout'

const when = (iso: string | null) => (iso ? `${dateShort(iso.slice(0, 10))}, ${iso.slice(11, 16)}` : 'Ainda não sincronizado')

function Card(p: { icon: ReactNode; name: string; what: string; connected: boolean; last: string | null; onToggle: (on: boolean) => void; to: string; toLabel: string }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-cal text-pinho" aria-hidden>{p.icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{p.name}</h3>
          <p className="text-xs text-ink-3">{p.what}</p>
        </div>
        <Badge tone={p.connected ? 'ok' : 'neutral'}>{p.connected ? 'Ligado' : 'Desligado'}</Badge>
      </div>
      <p className="text-xs text-ink-3">Última sincronização: <span className="text-ink-2">{p.connected ? when(p.last) : '—'}</span></p>
      <div className="flex flex-wrap gap-2">
        {p.connected ? (
          <>
            <Link to={p.to} className={buttonStyles('secondary', 'sm')}>{p.toLabel}</Link>
            <Button size="sm" variant="ghost" icon={<Unlink className="size-3.5" />} onClick={() => p.onToggle(false)}>Desligar</Button>
          </>
        ) : (
          <Button size="sm" icon={<Link2 className="size-3.5" />} onClick={() => p.onToggle(true)}>Ligar {p.name}</Button>
        )}
      </div>
    </li>
  )
}

/** Integrações simuladas: estado, ligar/desligar e a última sincronização. Nunca pedem credenciais. */
export function IntegrationsPanel() {
  const { google, onedrive } = useDemo((s) => s.db.integrations)
  const connectGoogle = useDemo((s) => s.connectGoogle)
  const connectOneDrive = useDemo((s) => s.connectOneDrive)
  const lastBook = Object.values(onedrive.books).sort().at(-1) ?? null
  return (
    <Panel title="Integrações" actions={<Badge tone="info">Simulado</Badge>} description="Demonstração: não ligam a nenhuma conta real e nunca pedem credenciais.">
      <ul className="grid gap-3 sm:grid-cols-2">
        <Card
          icon={<CalendarDays className="size-4" />}
          name="Google Calendar"
          what="Mostra os eventos da conta na Agenda e envia as férias aprovadas."
          connected={google.connected}
          last={google.lastSync}
          onToggle={(on) => { connectGoogle(on); toast(on ? 'Google Calendar ligado (simulado)' : 'Google Calendar desligado (simulado)') }}
          to="/agenda"
          toLabel="Abrir a Agenda"
        />
        <Card
          icon={<Cloud className="size-4" />}
          name="OneDrive"
          what="Mantém o livro de horas do RH do mês numa pasta partilhada."
          connected={onedrive.connected}
          last={lastBook}
          onToggle={(on) => { connectOneDrive(on); toast(on ? 'OneDrive ligado (simulado)' : 'OneDrive desligado (simulado)') }}
          to="/horas?vista=rh"
          toLabel="Abrir o Livro do RH"
        />
      </ul>
    </Panel>
  )
}
