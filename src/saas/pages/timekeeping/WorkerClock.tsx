import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, Coffee, LogIn, LogOut, MapPin, Play } from 'lucide-react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Select } from '@/ui/Field'
import { Panel } from '@/ui/Layout'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { clearRejected, enqueueTap, flushTaps, isNetworkError, pendingTaps, rejectedTaps, type ClockAction, type PendingTap } from '../../api/clockOutbox'
import { errorMessage, isApiError } from '../../api/http'
import { hhmm } from '../../api/planning'
import { localTime, useClock, useClockAction, type ClockStatus } from '../../api/timekeeping'
import { minutesToHours, useSites } from '../../api/workforce'
import { useActiveOrg } from '../../session'

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const TIME = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' })

/** Estado da rede, reativo: sem rede, os toques vão logo para a fila (o TanStack Query poria o pedido em pausa). */
function subscribeNetwork(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

function useOnline() {
  return useSyncExternalStore(subscribeNetwork, () => navigator.onLine, () => true)
}

/** Estado mostrado: o do servidor, com os toques ainda por enviar aplicados por cima. */
function effective(status: ClockStatus, pending: PendingTap[]) {
  let working = !!status.open
  let onBreak = status.open?.onBreak ?? false
  let since = status.open ? localTime(status.open.startedAt, status.open.timezone) : null
  for (const tap of pending) {
    if (tap.action === 'in') {
      working = true
      onBreak = false
      since = TIME.format(new Date(tap.deviceTime))
    } else if (tap.action === 'break-start') onBreak = true
    else if (tap.action === 'break-end') onBreak = false
    else {
      working = false
      onBreak = false
    }
  }
  return { working, onBreak, since }
}

/**
 * Ponto do trabalhador. A hora conta-se no servidor; cada toque leva uma chave única, reutilizada nas repetições,
 * para que uma rede instável nunca registe duas entradas. Sem rede, o toque fica no telemóvel com a hora real e é
 * enviado quando a ligação voltar (o servidor aceita-o até 72 h depois, por ordem).
 */
export function WorkerClock() {
  const org = useActiveOrg()
  const qc = useQueryClient()
  const clock = useClock(org.id)
  const action = useClockAction(org.id)
  const [siteId, setSiteId] = useState('')
  const [pending, setPending] = useState<PendingTap[]>(() => pendingTaps(org.id))
  const [rejected, setRejected] = useState(() => rejectedTaps(org.id))
  const online = useOnline()
  const needsSite = isApiError(action.error, 'site-required')
  const sites = useSites(org.id, { status: 'ACTIVE' }, needsSite)

  const refresh = useCallback(() => {
    setPending(pendingTaps(org.id))
    setRejected(rejectedTaps(org.id))
  }, [org.id])

  const flush = useCallback(async () => {
    if (pendingTaps(org.id).length === 0) return
    const result = await flushTaps(org.id)
    refresh()
    if (result.sent) {
      toast.success(`${result.sent} registo(s) feito(s) sem rede enviado(s)`)
      void qc.invalidateQueries({ queryKey: ['org', org.id, 'clock'] })
    }
    if (result.rejected) toast.error('Um registo feito sem rede foi recusado. Veja o aviso no ecrã.')
  }, [org.id, qc, refresh])

  useEffect(() => {
    // Envia o que ficou por enviar ao abrir a app (fora do render) e sempre que a rede volta.
    const first = window.setTimeout(() => void flush(), 0)
    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    return () => {
      window.clearTimeout(first)
      window.removeEventListener('online', onOnline)
    }
  }, [flush])

  if (clock.isPending && pending.length === 0) return <SkeletonRows rows={3} />
  if (clock.isError && !isNetworkError(clock.error)) {
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

  const status: ClockStatus = clock.data ?? { employeeId: '', open: null, today: [], weekWorkedMin: 0, weekOvertimeMin: 0 }
  const state = effective(status, pending)
  const next = status.today.find((p) => !p.confirmed)
  const offline = !online

  const run = (kind: ClockAction, label: string) => {
    const tap: PendingTap = { action: kind, idempotencyKey: newKey(), deviceTime: new Date().toISOString(), siteId: kind === 'in' && siteId ? siteId : kind === 'in' ? next?.siteId : undefined }
    const queue = () => {
      enqueueTap(org.id, tap)
      refresh()
      toast.message('Sem rede: registado no telemóvel', { description: `${label} às ${TIME.format(new Date(tap.deviceTime))}. Envia sozinho quando houver rede.` })
    }
    if (offline || pendingTaps(org.id).length > 0) {
      queue()
      if (!offline) void flush()
      return
    }
    action.mutate(
      { action: kind, idempotencyKey: tap.idempotencyKey, siteId: kind === 'in' && siteId ? siteId : undefined },
      {
        onSuccess: () => toast.success(label),
        onError: (e) => {
          if (isNetworkError(e)) queue()
          else if (!isApiError(e, 'site-required')) toast.error(errorMessage(e))
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {(offline || pending.length > 0) && (
        <div role="status" className="flex items-center gap-2 rounded-md border border-ambar/40 bg-ambar-soft px-3 py-2 text-sm text-ambar-ink">
          <CloudOff className="size-4 shrink-0" aria-hidden />
          {offline ? 'Sem rede. ' : ''}
          {pending.length > 0 ? `${pending.length} registo(s) por enviar; seguem quando houver rede.` : 'Os registos ficam guardados no telemóvel.'}
        </div>
      )}
      {rejected.length > 0 && (
        <div role="alert" className="rounded-md border border-tijolo/40 bg-tijolo-soft px-3 py-2 text-sm text-tijolo">
          <p className="font-semibold">Registo sem rede recusado</p>
          {rejected.map((r) => (
            <p key={r.idempotencyKey}>
              {TIME.format(new Date(r.deviceTime))}: {r.message}
            </p>
          ))}
          <Button size="sm" variant="ghost" className="mt-1" onClick={() => (clearRejected(org.id), refresh())}>
            Já avisei o encarregado
          </Button>
        </div>
      )}
      <Panel>
        <div className="flex flex-col gap-4">
          {state.working ? (
            <div>
              <Badge tone={state.onBreak ? 'warn' : 'ok'} dot>
                {state.onBreak ? 'Em pausa' : 'A trabalhar'}
              </Badge>
              <p className="mt-2 text-sm text-ink-3">
                Entrada às <span className="font-semibold text-ink">{state.since}</span>
                {status.open && (
                  <>
                    {' '}em <span className="font-semibold text-ink">{status.open.siteCode}</span>
                    {status.open.breakMin > 0 && ` · ${status.open.breakMin} min de pausa`}
                  </>
                )}
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

          {needsSite && !state.working && (
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

          {!state.working ? (
            <Button variant="primary" size="lg" icon={<LogIn className="size-5" />} loading={action.isPending} disabled={needsSite && !siteId} onClick={() => run('in', 'Entrada registada')}>
              Registar entrada
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {state.onBreak ? (
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
