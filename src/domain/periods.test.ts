import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './types'
import { db as makeDB, entry, site, worker } from '@/test/builders'
import { hoursTotals, periodRange, shiftPeriod } from './periods'

describe('períodos', () => {
  it('semana: 7 dias, com o fim de semana marcado como opcional', () => {
    const r = periodRange('semana', '2026-10-14')
    expect(r.from).toBe('2026-10-12')
    expect(r.to).toBe('2026-10-18')
    expect(r.columns.map((c) => c.optional)).toEqual([false, false, false, false, false, true, true])
  })
  it('mês: as semanas que o atravessam, cortadas ao mês', () => {
    const r = periodRange('mes', '2026-10-14')
    expect(r.from).toBe('2026-10-01')
    expect(r.to).toBe('2026-10-31')
    expect(r.columns[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-04' })
    expect(r.columns.at(-1)).toMatchObject({ from: '2026-10-26', to: '2026-10-31' })
  })
  it('ano: 12 meses; andar para trás e para a frente', () => {
    expect(periodRange('ano', '2026-10-14').columns).toHaveLength(12)
    expect(shiftPeriod('mes', '2026-01-15', -1)).toBe('2025-12-01')
    expect(shiftPeriod('semana', '2026-10-14', 1)).toBe('2026-10-19')
  })
  it('totais: realizadas (submetido, revisto, aprovado) por trabalhador e coluna, e por obra × trabalhador', () => {
    const d = makeDB({
      sites: [site({ id: 's1', code: 'OB-1' }), site({ id: 's2', code: 'OB-2' })],
      workers: [worker({ id: 'w1', name: 'Ana' }), worker({ id: 'w2', name: 'Bruno' })],
      entries: [
        entry({ workerId: 'w1', siteId: 's1', date: '2026-10-12' }), // 8 h
        entry({ workerId: 'w1', siteId: 's2', date: '2026-10-13', clockOut: '19:00' }), // 10 h
        entry({ workerId: 'w2', siteId: 's1', date: '2026-10-17', status: 'aprovado' }), // sábado 8 h
        entry({ workerId: 'w2', siteId: 's1', date: '2026-10-14', status: 'aberto' }), // não conta
        entry({ workerId: 'w2', siteId: 's1', date: '2026-10-15', status: 'rejeitado' }), // não conta
      ],
    })
    const t = hoursTotals(d, DEFAULT_SETTINGS, periodRange('semana', '2026-10-14'), {})
    expect(t.workers.find((r) => r.workerId === 'w1')).toMatchObject({ cells: [8, 10, 0, 0, 0, 0, 0], total: 18 })
    expect(t.workers.find((r) => r.workerId === 'w2')!.total).toBe(8)
    // o sábado aparece porque alguém lá tem horas; o domingo não
    expect(t.visible).toEqual([true, true, true, true, true, true, false])
    expect(t.sites.find((r) => r.siteId === 's1')).toMatchObject({ total: 16 })
    expect(t.sites.find((r) => r.siteId === 's1')!.byWorker).toMatchObject({ w1: 8, w2: 8 })
    // filtro por obra
    expect(hoursTotals(d, DEFAULT_SETTINGS, periodRange('semana', '2026-10-14'), { siteId: 's2' }).workers.map((r) => r.total)).toEqual([10])
  })
})
