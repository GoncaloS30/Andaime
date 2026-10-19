import { isWeekend } from './weeks'
import type { HHMM, ISODate, Settings, TimeEntry } from './types'

/** Pausa só é descontada em períodos acima de 6 horas (meio-dia não tem pausa). */
const BREAK_THRESHOLD_MIN = 360

export function toMinutes(t: HHMM): number {
  const [h, m] = t.split(':').map(Number) as [number, number]
  return h * 60 + m
}

export function fromMinutes(min: number): HHMM {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Minutos efetivamente trabalhados. Entradas abertas usam `now`. */
export function workedMinutes(entry: TimeEntry, now?: HHMM): number {
  const end = entry.clockOut ?? now
  if (!end) return 0
  const span = toMinutes(end) - toMinutes(entry.clockIn)
  if (span <= 0) return 0
  let pause = entry.breakMinutes
  if (entry.breakStartedAt && !entry.clockOut && now) {
    pause += Math.max(0, toMinutes(now) - toMinutes(entry.breakStartedAt))
  }
  return Math.max(0, span - pause)
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Horas normais vs. extra: acima do normal diário, e tudo ao fim de semana. */
export function splitHours(date: ISODate, hours: number, dailyNormal: number) {
  if (isWeekend(date)) return { normal: 0, extra: round2(hours) }
  const normal = Math.min(hours, dailyNormal)
  return { normal: round2(normal), extra: round2(Math.max(0, hours - dailyNormal)) }
}

export function entryHours(entry: TimeEntry, settings: Settings, now?: HHMM) {
  const worked = round2(workedMinutes(entry, now) / 60)
  return { worked, ...splitHours(entry.date, worked, settings.dailyNormal) }
}

/** Horas de um horário planeado (início–fim) com pausa descontada acima de 6 h. */
export function timeRangeHours(start: HHMM, end: HHMM, breakMinutes: number): number {
  const span = toMinutes(end) - toMinutes(start)
  if (span <= 0) return 0
  return round2((span - (span > BREAK_THRESHOLD_MIN ? breakMinutes : 0)) / 60)
}

const NBSP = ' '

/** "8 h", "7,5 h", "12 345 h" com espaços não separáveis. */
export function formatHours(h: number, unit = 'h'): string {
  const value = round2(Math.abs(h))
  const [int, dec] = String(value).split('.') as [string, string | undefined]
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  const sign = h < 0 ? '−' : ''
  return `${sign}${grouped}${dec ? `,${dec}` : ''}${unit ? `${NBSP}${unit}` : ''}`
}

/** Número com separadores pt-PT, sem unidade. */
export function formatNumber(n: number): string {
  return formatHours(n, '')
}

/** Hora de saída para um total de horas trabalhadas a partir da entrada (a pausa só conta acima de 6 h). */
export function clockOutFor(clockIn: HHMM, hours: number, breakMinutes: number): HHMM {
  const work = Math.round(hours * 60)
  return fromMinutes(toMinutes(clockIn) + work + (work > BREAK_THRESHOLD_MIN ? breakMinutes : 0))
}
