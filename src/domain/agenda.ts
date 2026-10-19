import { ABSENCE_COLOR, ABSENCE_TYPE } from './labels'
import type { CalendarEvent, DB, HHMM, ID, ISODate } from './types'
import { addDays, weekStart } from './weeks'

/** A grelha do mês corrida de segunda a domingo: começa na segunda antes do dia 1 e acaba no domingo depois do último. */
export function monthGrid(month: string): ISODate[][] {
  const first = `${month}-01`
  const [y, m] = month.split('-').map(Number) as [number, number]
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const last = `${month}-${String(lastDay).padStart(2, '0')}`
  const weeks: ISODate[][] = []
  for (let ws = weekStart(first); ws <= last; ws = addDays(ws, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(ws, i)))
  return weeks
}

export interface AgendaLayers {
  ausencias: boolean
  obras: boolean
  validades: boolean
  eventos: boolean
  google: boolean
}

export type AgendaKind = 'ausencia' | 'obra' | 'validade' | 'evento' | 'google'

export interface AgendaItem {
  id: string
  kind: AgendaKind
  title: string
  start: ISODate
  end: ISODate
  time: HHMM | null
  color: string
  /** Os itens da própria app abrem a entidade; os do Google não têm ligação. */
  link: string | null
}

const overlaps = (s: ISODate, e: ISODate, from: ISODate, to: ISODate) => s <= to && e >= from

/** Tudo o que a agenda mostra entre duas datas, já no mesmo formato e por ordem (dia inteiro primeiro). */
export function agendaItems(db: DB, from: ISODate, to: ISODate, layers: AgendaLayers): AgendaItem[] {
  const out: AgendaItem[] = []
  if (layers.ausencias) {
    for (const a of Object.values(db.absences)) {
      if (a.status !== 'aprovado' || !overlaps(a.start, a.end, from, to)) continue
      const w = db.workers[a.workerId]
      out.push({ id: `aus-${a.id}`, kind: 'ausencia', title: `${w?.name ?? 'Trabalhador'} · ${ABSENCE_TYPE[a.type]}`, start: a.start, end: a.end, time: null, color: ABSENCE_COLOR[a.type], link: `/trabalhadores/${a.workerId}?tab=ausencias` })
    }
  }
  if (layers.obras) {
    for (const s of Object.values(db.sites)) {
      const marks: [string, ISODate][] = [['Início', s.startDate], ['Fim contratual', s.contractEnd]]
      if (s.endDate !== s.contractEnd) marks.push(['Previsão de fim', s.endDate])
      for (const [label, d] of marks) {
        if (d >= from && d <= to) out.push({ id: `obra-${s.id}-${label}`, kind: 'obra', title: `${s.code} · ${label}`, start: d, end: d, time: null, color: s.color, link: `/obras/${s.id}` })
      }
    }
  }
  if (layers.validades) {
    for (const doc of Object.values(db.documents)) {
      if (!doc.expiresAt || doc.expiresAt < from || doc.expiresAt > to) continue
      const owner = doc.ownerType === 'trabalhador' ? db.workers[doc.ownerId]?.name : doc.ownerType === 'obra' ? db.sites[doc.ownerId]?.code : db.company.name
      const type = db.docTypes[doc.typeId]
      out.push({ id: `doc-${doc.id}`, kind: 'validade', title: `Validade: ${type?.short ?? 'documento'} · ${owner ?? ''}`, start: doc.expiresAt, end: doc.expiresAt, time: null, color: '#c98a12', link: `/documentos?documento=${doc.id}` })
    }
    for (const v of Object.values(db.vehicles)) {
      for (const [label, d] of [['Seguro', v.insuranceUntil], ['Inspeção', v.inspectionUntil]] as const) {
        if (d >= from && d <= to) out.push({ id: `vei-${v.id}-${label}`, kind: 'validade', title: `${label}: ${v.plate}`, start: d, end: d, time: null, color: '#c98a12', link: `/viaturas/${v.id}` })
      }
    }
  }
  for (const e of Object.values(db.events)) {
    const on = e.source === 'google' ? layers.google && db.integrations.google.connected : layers.eventos
    if (!on || !overlaps(e.date, e.endDate, from, to)) continue
    out.push({ id: `ev-${e.id}`, kind: e.source === 'google' ? 'google' : 'evento', title: e.title, start: e.date, end: e.endDate, time: e.time, color: e.source === 'google' ? '#3b6a8c' : '#13342a', link: null })
  }
  // Dia inteiro antes dos que têm hora, como no Google; depois pela hora e pelo título.
  return out.sort((a, b) => a.start.localeCompare(b.start) || (a.time ? 1 : 0) - (b.time ? 1 : 0) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title, 'pt'))
}

/** Os itens que atravessam um dia (um período de vários dias aparece em cada um). */
export function itemsOnDay(items: AgendaItem[], day: ISODate): AgendaItem[] {
  return items.filter((i) => i.start <= day && i.end >= day)
}

/**
 * Levar as férias aprovadas para o Google (simulado). Pode correr as vezes que quiser: o que já foi
 * enviado fica marcado pela chave "ferias:<id>" e não se duplica.
 */
export function syncVacationsPlan(db: DB): { create: CalendarEvent[]; existing: number } {
  const done = new Set(db.integrations.google.syncedKeys)
  const vacations = Object.values(db.absences).filter((a) => a.type === 'ferias' && a.status === 'aprovado')
  const create: CalendarEvent[] = []
  for (const a of vacations) {
    const key = `ferias:${a.id}`
    if (done.has(key)) continue
    create.push({ id: `g-${a.id}` as ID, title: `Férias · ${db.workers[a.workerId]?.name ?? ''}`, date: a.start, endDate: a.end, time: null, location: '', source: 'google', syncKey: key })
  }
  return { create, existing: vacations.length - create.length }
}
