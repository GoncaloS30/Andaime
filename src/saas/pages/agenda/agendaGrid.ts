import type { CalendarItem } from '../../api/calendar'

/** Soma dias a uma data ISO (sem fusos: tudo em UTC). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Dia da semana ISO: 1 = segunda … 7 = domingo. */
export function isoWeekday(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay() || 7
}

/** A grelha do mês corrida de segunda a domingo: da segunda antes do dia 1 ao domingo depois do último. */
export function monthGrid(month: string): string[][] {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const first = `${month}-01`
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const weeks: string[][] = []
  for (let monday = addDays(first, 1 - isoWeekday(first)); monday <= last; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)))
  }
  return weeks
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const date = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Os itens que atravessam um dia (um período de vários dias aparece em cada um), pela ordem do servidor. */
export function itemsOnDay(items: CalendarItem[], day: string): CalendarItem[] {
  return items.filter((i) => i.start <= day && i.end >= day)
}

export type LayerFilter = Record<CalendarItem['layer'], boolean>

export const ALL_LAYERS: LayerFilter = { ABSENCE: true, SITE: true, EXPIRY: true, HOLIDAY: true, EVENT: true }

/** Rota da entidade que um item abre (o encarregado tem a sua própria página de documentos). */
export function linkTarget(item: CalendarItem, foreman: boolean): string | null {
  const link = item.link
  if (!link) return null
  switch (link.type) {
    case 'EMPLOYEE':
      return `/trabalhadores/${link.id}`
    case 'SITE':
      return `/obras/${link.id}`
    case 'VEHICLE':
      return `/viaturas/${link.id}`
    case 'EMPLOYEE_DOCUMENTS':
      return `${foreman ? '/encarregado/documentos' : '/documentos'}?employeeId=${link.id}`
    default:
      return null
  }
}
