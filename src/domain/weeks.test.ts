import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayShort,
  diffDays,
  eachDay,
  isoWeek,
  isWeekend,
  weekDays,
  weekLabel,
  weekStart,
  inRange,
  dateLong,
} from './weeks'

describe('weeks', () => {
  it('soma dias atravessando meses e anos', () => {
    expect(addDays('2026-10-15', 1)).toBe('2026-10-16')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('devolve a segunda-feira da semana, mesmo ao domingo', () => {
    expect(weekStart('2026-10-15')).toBe('2026-10-12') // quinta
    expect(weekStart('2026-10-12')).toBe('2026-10-12') // segunda
    expect(weekStart('2026-10-18')).toBe('2026-10-12') // domingo
  })

  it('lista os 7 dias da semana a partir de segunda', () => {
    expect(weekDays('2026-10-12')).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ])
  })

  it('numera semanas pelo ISO 8601, incluindo a semana 53', () => {
    expect(isoWeek('2026-10-15')).toBe(42)
    expect(isoWeek('2026-12-31')).toBe(53)
    expect(isoWeek('2027-01-01')).toBe(53)
    expect(isoWeek('2027-01-04')).toBe(1)
    expect(isoWeek('2026-01-01')).toBe(1)
  })

  it('identifica fins de semana', () => {
    expect(isWeekend('2026-10-17')).toBe(true)
    expect(isWeekend('2026-10-18')).toBe(true)
    expect(isWeekend('2026-10-16')).toBe(false)
  })

  it('itera dias de forma inclusiva e calcula diferenças', () => {
    expect(eachDay('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])
    expect(eachDay('2026-10-02', '2026-10-01')).toEqual([])
    expect(diffDays('2026-10-01', '2026-10-15')).toBe(14)
    expect(inRange('2026-10-05', '2026-10-01', '2026-10-05')).toBe(true)
    expect(inRange('2026-10-06', '2026-10-01', '2026-10-05')).toBe(false)
  })

  it('formata rótulos em pt-PT', () => {
    expect(weekLabel('2026-10-12')).toBe('12–18 out 2026')
    expect(weekLabel('2026-10-26')).toBe('26 out – 1 nov 2026')
    expect(weekLabel('2026-12-28')).toBe('28 dez 2026 – 3 jan 2027')
    expect(dayShort('2026-10-15')).toBe('qui')
    expect(dateLong('2026-10-15')).toBe('quinta-feira, 15 de outubro')
  })
})

describe('daysRange', () => {
  it('comprime dias seguidos em intervalos', async () => {
    const { daysRange } = await import('./weeks')
    expect(daysRange(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'])).toBe('seg–sex')
    expect(daysRange(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-23'])).toBe('seg–qua, sex')
    expect(daysRange(['2026-10-22'])).toBe('qui')
    expect(daysRange(['2026-10-19', '2026-10-20'])).toBe('seg, ter')
    expect(daysRange([])).toBe('')
  })
})
