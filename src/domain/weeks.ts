import type { ISODate } from './types'

/** Aritmética de datas civis em UTC: imune a fusos horários e mudanças de hora. */

const DAY_MS = 86_400_000
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MONTHS_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const DAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const DAYS_LONG = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado',
]

export function toUTC(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, day)
}

export function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Data local de hoje (do dispositivo) em ISO. */
export function localToday(now: Date = new Date()): ISODate {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * DAY_MS)
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS)
}

/** 0 = domingo … 6 = sábado */
export function weekday(d: ISODate): number {
  return new Date(toUTC(d)).getUTCDay()
}

export function weekStart(d: ISODate): ISODate {
  const wd = weekday(d)
  return addDays(d, wd === 0 ? -6 : 1 - wd)
}

export function weekDays(ws: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(ws, i))
}

export function isWeekend(d: ISODate): boolean {
  const wd = weekday(d)
  return wd === 0 || wd === 6
}

export function isoWeek(d: ISODate): number {
  // A semana ISO é a da quinta-feira dessa semana.
  const thursday = addDays(weekStart(d), 3)
  const yearStart = `${thursday.slice(0, 4)}-01-01`
  return Math.floor(diffDays(yearStart, thursday) / 7) + 1
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function inRange(d: ISODate, from: ISODate, to: ISODate): boolean {
  return d >= from && d <= to
}

function parts(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  return { y, m, day }
}

export function weekLabel(ws: ISODate): string {
  const a = parts(ws)
  const b = parts(addDays(ws, 6))
  if (a.y !== b.y) return `${a.day} ${MONTHS[a.m - 1]} ${a.y} – ${b.day} ${MONTHS[b.m - 1]} ${b.y}`
  if (a.m !== b.m) return `${a.day} ${MONTHS[a.m - 1]} – ${b.day} ${MONTHS[b.m - 1]} ${b.y}`
  return `${a.day}–${b.day} ${MONTHS[a.m - 1]} ${a.y}`
}

export function dayShort(d: ISODate): string {
  return DAYS_SHORT[weekday(d)]!
}

export function dayLong(d: ISODate): string {
  return DAYS_LONG[weekday(d)]!
}

/** "15 out" */
export function dateShort(d: ISODate): string {
  const p = parts(d)
  return `${p.day} ${MONTHS[p.m - 1]}`
}

/** "15/10/2026" */
export function dateNumeric(d: ISODate): string {
  const p = parts(d)
  return `${String(p.day).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`
}

/** "quinta-feira, 15 de outubro" */
export function dateLong(d: ISODate): string {
  const p = parts(d)
  return `${dayLong(d)}, ${p.day} de ${MONTHS_LONG[p.m - 1]}`
}

export function monthLabel(d: ISODate): string {
  const p = parts(d)
  return `${MONTHS_LONG[p.m - 1]} ${p.y}`
}
