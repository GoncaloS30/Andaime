import { api, ApiError, errorMessage } from './http'

/**
 * Fila de toques de ponto feitos sem rede. Não é uma base de dados: guarda só os pedidos por enviar (com a chave de
 * idempotência e a hora do toque) e esvazia-se assim que o servidor os aceita. O servidor continua a ser a fonte de
 * verdade e valida a hora do dispositivo (até 72 h, por ordem).
 */

export type ClockAction = 'in' | 'break-start' | 'break-end' | 'out'

export interface PendingTap {
  action: ClockAction
  idempotencyKey: string
  deviceTime: string
  siteId?: string
}

export interface Rejected extends PendingTap {
  message: string
}

const key = (orgId: string) => `andaime:ponto-por-enviar:${orgId}`
const rejectedKey = (orgId: string) => `andaime:ponto-recusado:${orgId}`

function read<T>(name: string): T[] {
  try {
    const raw = window.localStorage.getItem(name)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

function write<T>(name: string, items: T[]) {
  try {
    if (items.length) window.localStorage.setItem(name, JSON.stringify(items))
    else window.localStorage.removeItem(name)
  } catch {
    // Sem armazenamento (modo privado): o toque fica só em memória até haver rede.
  }
}

export const pendingTaps = (orgId: string) => read<PendingTap>(key(orgId))
export const rejectedTaps = (orgId: string) => read<Rejected>(rejectedKey(orgId))
export const clearRejected = (orgId: string) => write(rejectedKey(orgId), [])

export function enqueueTap(orgId: string, tap: PendingTap) {
  write(key(orgId), [...pendingTaps(orgId), tap])
}

/** Um erro de rede (sem resposta do servidor) não é um ApiError. */
export const isNetworkError = (error: unknown) => !(error instanceof ApiError)

let flushing = false

/**
 * Envia os toques por ordem. Para ao primeiro erro de rede (tenta mais tarde); um toque recusado pelo servidor
 * (ex.: mais de 72 h) sai da fila e fica na lista de recusados, para a pessoa avisar o encarregado.
 */
export async function flushTaps(orgId: string): Promise<{ sent: number; rejected: number }> {
  if (flushing) return { sent: 0, rejected: 0 }
  flushing = true
  let sent = 0
  let rejected = 0
  try {
    for (;;) {
      const [next, ...rest] = pendingTaps(orgId)
      if (!next) break
      try {
        await api(`/orgs/${orgId}/me/clock/${next.action}`, {
          method: 'POST',
          body: { idempotencyKey: next.idempotencyKey, deviceTime: next.deviceTime, siteId: next.siteId, offline: true },
        })
        sent++
      } catch (error) {
        if (isNetworkError(error)) break
        write(rejectedKey(orgId), [...rejectedTaps(orgId), { ...next, message: errorMessage(error) }])
        rejected++
      }
      write(key(orgId), rest)
    }
  } finally {
    flushing = false
  }
  return { sent, rejected }
}
