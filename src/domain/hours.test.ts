import { describe, expect, it } from 'vitest'
import { entryHours, fromMinutes, splitHours, toMinutes, workedMinutes, formatHours, timeRangeHours } from './hours'
import { DEFAULT_SETTINGS, type TimeEntry } from './types'

function entry(p: Partial<TimeEntry>): TimeEntry {
  return {
    id: 'e1',
    workerId: 'w1',
    siteId: 's1',
    date: '2026-10-15',
    clockIn: '08:00',
    clockOut: '17:00',
    breakMinutes: 60,
    breakStartedAt: null,
    source: 'ponto',
    status: 'submetido',
    corrections: [],
    rejectionReason: null,
    reviewedBy: null,
    approvedBy: null,
    note: '',
    ...p,
  }
}

describe('hours', () => {
  it('converte HH:MM em minutos e vice-versa', () => {
    expect(toMinutes('07:45')).toBe(465)
    expect(fromMinutes(465)).toBe('07:45')
    expect(fromMinutes(0)).toBe('00:00')
  })

  it('calcula minutos trabalhados descontando a pausa', () => {
    expect(workedMinutes(entry({}))).toBe(480)
    expect(workedMinutes(entry({ clockIn: '07:30', clockOut: '18:30' }))).toBe(600)
  })

  it('usa a hora atual quando a entrada está aberta', () => {
    expect(workedMinutes(entry({ clockOut: null, breakMinutes: 0 }), '10:30')).toBe(150)
  })

  it('desconta a pausa em curso até à hora atual', () => {
    expect(
      workedMinutes(entry({ clockOut: null, breakMinutes: 0, breakStartedAt: '12:00' }), '12:20'),
    ).toBe(240)
  })

  it('devolve 0 quando a saída é anterior à entrada', () => {
    expect(workedMinutes(entry({ clockIn: '17:00', clockOut: '08:00' }))).toBe(0)
  })

  it('separa normais e extra num dia útil', () => {
    expect(splitHours('2026-10-15', 8, 8)).toEqual({ normal: 8, extra: 0 })
    expect(splitHours('2026-10-15', 10, 8)).toEqual({ normal: 8, extra: 2 })
    expect(splitHours('2026-10-15', 6.5, 8)).toEqual({ normal: 6.5, extra: 0 })
  })

  it('conta todas as horas de fim de semana como extra', () => {
    expect(splitHours('2026-10-17', 6, 8)).toEqual({ normal: 0, extra: 6 })
  })

  it('resume uma entrada em trabalhadas, normais e extra', () => {
    expect(entryHours(entry({ clockIn: '07:30', clockOut: '18:30' }), DEFAULT_SETTINGS)).toEqual({
      worked: 10,
      normal: 8,
      extra: 2,
    })
  })

  it('calcula horas de um horário planeado com pausa', () => {
    expect(timeRangeHours('08:00', '17:00', 60)).toBe(8)
    expect(timeRangeHours('08:00', '12:00', 60)).toBe(4)
  })

  it('formata horas em pt-PT', () => {
    expect(formatHours(8)).toBe('8 h')
    expect(formatHours(7.5)).toBe('7,5 h')
    expect(formatHours(12345)).toBe('12 345 h')
    expect(formatHours(-2)).toBe('−2 h')
  })
})
