import type { Absence, DB, ISODate } from '@/domain/types'
import { addDays, weekStart } from '@/domain/weeks'

/**
 * Férias ao longo do ano para o mapa do ano ficar com conteúdo: um período passado por quase todos,
 * e no futuro alguns aprovados e outros pedidos. Tudo fora da janela do planeamento (−4 a +2 semanas),
 * para não criar conflitos que a demonstração não explica.
 */
export function seedVacations(db: DB, today: ISODate): Record<string, Absence> {
  const out: Record<string, Absence> = {}
  const ws = weekStart(today)
  const workers = Object.values(db.workers).filter((w) => w.status === 'ativo').sort((a, b) => a.id.localeCompare(b.id))
  workers.forEach((w, i) => {
    if (i % 5 !== 4) {
      const start = addDays(ws, -140 + ((i * 7) % 63))
      const id = `ab-v1-${w.id}`
      out[id] = { id, workerId: w.id, type: 'ferias', start, end: addDays(start, 11), hours: null, status: 'aprovado', reason: 'Férias de verão', requestedAt: `${addDays(start, -40)}T09:00:00`, decidedBy: 'Marta Albuquerque', decidedAt: `${addDays(start, -35)}T10:00:00`, decisionNote: '' }
    }
    if (i % 3 === 0 || i % 6 === 1) {
      const start = addDays(ws, 49 + ((i * 5) % 42))
      const id = `ab-v2-${w.id}`
      const approved = i % 3 === 0
      out[id] = { id, workerId: w.id, type: 'ferias', start, end: addDays(start, 4), hours: null, status: approved ? 'aprovado' : 'pedido', reason: approved ? 'Férias de fim de ano' : 'Pedido de férias', requestedAt: `${addDays(today, -6)}T09:00:00`, decidedBy: approved ? 'Marta Albuquerque' : null, decidedAt: approved ? `${addDays(today, -4)}T10:00:00` : null, decisionNote: '' }
    }
  })
  return out
}
