import { Coffee, LogIn, LogOut, MapPin, Play } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Select } from '@/ui/Field'
import { Panel } from '@/ui/Layout'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { errorMessage, isApiError } from '../../api/http'
import { hhmm } from '../../api/planning'
import { localTime, useClock, useClockAction } from '../../api/timekeeping'
import { minutesToHours, useSites } from '../../api/workforce'
import { useActiveOrg } from '../../session'

type Action = 'in' | 'break-start' | 'break-end' | 'out'

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Ponto do trabalhador. A hora conta-se no servidor; cada toque leva uma chave única, reutilizada nas repetições
 * automáticas, para que uma rede instável nunca registe duas entradas.
 */
export function WorkerClock() {
  const org = useActiveOrg()
  const clock = useClock(org.id)
  const action = useClockAction(org.id)
  const [siteId, setSiteId] = useState('')
  const needsSite = isApiError(action.error, 'site-required')
  const sites = useSites(org.id, { status: 'ACTIVE' }, needsSite)

  if (clock.isPending) return <SkeletonRows rows={3} />
  if (clock.isError) {
    return isApiError(clock.error, 'no-employee') ? (
      <Panel>
        <EmptyState icon={<MapPin />} title="Conta por ligar">
          {clock.error.message}
        </EmptyState>
      </Panel>
    ) : (
      <ErrorState onRetry={() => void clock.refetch()}>{errorMessage(clock.error)}</ErrorState>
    )
  }

  const status = clock.data
  const open = status.open
  const next = status.today.find((p) => !p.confirmed)
  const run = (kind: Action, label: string) =>
    action.mutate(
      { action: kind, idempotencyKey: newKey(), siteId: kind === 'in' && siteId ? siteId : undefined },
      {
        onSuccess: () => toast.success(label),
        onError: (e) => !isApiError(e, 'site-required') && toast.error(errorMessage(e)),
      },
    )

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="flex flex-col gap-4">
          {open ? (
            <div>
              <Badge tone={open.onBreak ? 'warn' : 'ok'} dot>
                {open.onBreak ? 'Em pausa' : 'A trabalhar'}
              </Badge>
              <p className="mt-2 text-sm text-ink-3">
                Entrada às <span className="font-semibold text-ink">{localTime(open.startedAt, open.timezone)}</span> em{' '}
                <span className="font-semibold text-ink">{open.siteCode}</span>
                {open.breakMin > 0 && ` · ${open.breakMin} min de pausa`}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-ink-3">Hoje</p>
              {next ? (
                <p className="font-expanded text-lg font-semibold text-ink">
                  {next.siteCode} · {hhmm(next.start)}–{hhmm(next.end)}
                </p>
              ) : (
                <p className="text-base text-ink">Sem obra planeada para hoje.</p>
              )}
              {next && <p className="text-sm text-ink-3">{next.siteName}</p>}
            </div>
          )}

          {needsSite && !open && (
            <div className="flex flex-col gap-2">
              <label htmlFor="obra-ponto" className="text-sm font-semibold text-ink">
                Em que obra está?
              </label>
              <Select id="obra-ponto" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">Escolha a obra…</option>
                {(sites.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {!open ? (
            <Button variant="primary" size="lg" icon={<LogIn className="size-5" />} loading={action.isPending} disabled={needsSite && !siteId} onClick={() => run('in', 'Entrada registada')}>
              Registar entrada
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {open.onBreak ? (
                <Button variant="secondary" size="lg" icon={<Play className="size-5" />} loading={action.isPending} onClick={() => run('break-end', 'Pausa terminada')}>
                  Retomar
                </Button>
              ) : (
                <Button variant="secondary" size="lg" icon={<Coffee className="size-5" />} loading={action.isPending} onClick={() => run('break-start', 'Pausa iniciada')}>
                  Pausa
                </Button>
              )}
              <Button variant="primary" size="lg" icon={<LogOut className="size-5" />} loading={action.isPending} onClick={() => run('out', 'Saída registada')}>
                Registar saída
              </Button>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Esta semana">
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-ink-3">Trabalhadas</dt>
            <dd className="font-expanded text-lg font-semibold tabular">{minutesToHours(status.weekWorkedMin)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Extra</dt>
            <dd className="font-expanded text-lg font-semibold tabular">{minutesToHours(status.weekOvertimeMin)}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  )
}
