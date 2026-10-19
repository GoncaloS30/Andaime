import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './types'
import { assignment, db as makeDB, entry, site, worker } from '@/test/builders'
import { weekChart } from './weekCharts'
import { clockOutFor } from './hours'

describe('como correu a semana', () => {
  it('horas por dia (realizadas e planeadas), por obra e por pessoa', () => {
    const d = makeDB({
      sites: [site({ id: 's1', hourLimit: 100 })],
      workers: [worker({ id: 'w1' })],
      entries: [entry({ workerId: 'w1', siteId: 's1', date: '2026-10-12' })],
      assignments: [assignment({ workerId: 'w1', siteId: 's1', date: '2026-10-13', hours: 8 })],
    })
    const c = weekChart(d, DEFAULT_SETTINGS, '2026-10-12')
    expect(c.days[0]).toMatchObject({ date: '2026-10-12', realized: 8, planned: 0 })
    expect(c.days[1]).toMatchObject({ realized: 0, planned: 8 })
    expect(c.sites[0]).toMatchObject({ siteId: 's1', realized: 8, planned: 8 })
    expect(c.workers[0]).toMatchObject({ workerId: 'w1', realized: 8, extra: 0 })
  })
  it('hora de saída para um total de horas (pausa só acima de 6 h)', () => {
    expect(clockOutFor('08:00', 8, 60)).toBe('17:00')
    expect(clockOutFor('08:00', 10, 60)).toBe('19:00')
    expect(clockOutFor('08:00', 5, 60)).toBe('13:00')
  })
})
