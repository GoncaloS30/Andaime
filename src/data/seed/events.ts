import type { CalendarEvent, ISODate } from '@/domain/types'
import { addDays, weekStart } from '@/domain/weeks'

/** Alguns eventos próprios da empresa (fictícios), à volta de hoje. */
export function seedEvents(today: ISODate): Record<string, CalendarEvent> {
  const ws = weekStart(today)
  const list: CalendarEvent[] = [
    { id: 'ev-1', title: 'Reunião de obra — Edifício Atlântida', date: addDays(ws, 2), endDate: addDays(ws, 2), time: '10:00', location: 'Estaleiro OB-24-031', source: 'andaime' },
    { id: 'ev-2', title: 'Visita da fiscalização — Hotel Ribeira Douro', date: addDays(ws, 8), endDate: addDays(ws, 8), time: '09:30', location: 'Porto', source: 'andaime' },
    { id: 'ev-3', title: 'Montagem da grua — Centro Logístico Algarve', date: addDays(ws, 14), endDate: addDays(ws, 16), time: null, location: 'Loulé', source: 'andaime' },
    { id: 'ev-4', title: 'Fecho do mês: horas para o RH', date: addDays(ws, 18), endDate: addDays(ws, 18), time: '16:00', location: 'Escritório', source: 'andaime' },
  ]
  return Object.fromEntries(list.map((e) => [e.id, e]))
}
