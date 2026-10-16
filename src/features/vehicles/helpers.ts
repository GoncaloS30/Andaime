import type { ISODate, Vehicle } from '@/domain/types'
import { addDays, dateNumeric } from '@/domain/weeks'

/** Estado de uma validade (seguro, inspeção, manutenção) face a hoje. */
export function validity(date: ISODate, today: ISODate): { tone: 'ok' | 'warn' | 'danger'; label: string } {
  if (date < today) return { tone: 'danger', label: `Caducou ${dateNumeric(date)}` }
  if (date <= addDays(today, 30)) return { tone: 'warn', label: `Até ${dateNumeric(date)}` }
  return { tone: 'ok', label: `Até ${dateNumeric(date)}` }
}

export function isUnavailable(v: Vehicle, today: ISODate) {
  return v.status !== 'operacional' || v.inspectionUntil < today || v.insuranceUntil < today
}
