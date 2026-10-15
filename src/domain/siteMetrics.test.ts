import { describe, expect, it } from 'vitest'
import { siteMetrics } from './siteMetrics'
import { DEFAULT_SETTINGS } from './types'
import { assignment, entry, site } from '@/test/builders'

const TODAY = '2026-10-15'

describe('siteMetrics', () => {
  const s = site({ id: 's1', hourLimit: 100 })

  it('conta como realizadas só entradas submetidas, revistas ou aprovadas', () => {
    const entries = [
      entry({ workerId: 'w1', siteId: 's1', date: '2026-10-12', status: 'submetido' }),
      entry({ workerId: 'w1', siteId: 's1', date: '2026-10-13', status: 'revisto' }),
      entry({ workerId: 'w1', siteId: 's1', date: '2026-10-14', status: 'aprovado' }),
      entry({ workerId: 'w2', siteId: 's1', date: '2026-10-14', status: 'rejeitado' }),
      entry({ workerId: 'w2', siteId: 's1', date: '2026-10-15', status: 'aberto', clockOut: null }),
      entry({ workerId: 'w3', siteId: 'outra', date: '2026-10-14', status: 'aprovado' }),
    ]
    const m = siteMetrics(s, [], entries, TODAY, DEFAULT_SETTINGS)
    expect(m.realized).toBe(24)
    expect(m.approved).toBe(8)
  })

  it('soma planeadas só de hoje em diante e sem entrada correspondente', () => {
    const assignments = [
      assignment({ workerId: 'w1', siteId: 's1', date: '2026-10-14' }), // passado
      assignment({ workerId: 'w1', siteId: 's1', date: '2026-10-15' }), // hoje, já com entrada
      assignment({ workerId: 'w2', siteId: 's1', date: '2026-10-15' }), // hoje, sem entrada
      assignment({ workerId: 'w2', siteId: 's1', date: '2026-10-16', hours: 4 }),
      assignment({ workerId: 'w2', siteId: 'outra', date: '2026-10-16' }),
    ]
    const entries = [entry({ workerId: 'w1', siteId: 's1', date: '2026-10-15', status: 'aberto', clockOut: null })]
    const m = siteMetrics(s, assignments, entries, TODAY, DEFAULT_SETTINGS)
    expect(m.plannedFuture).toBe(12)
  })

  it('uma entrada rejeitada não cobre a atribuição planeada', () => {
    const assignments = [assignment({ workerId: 'w1', siteId: 's1', date: '2026-10-15' })]
    const entries = [entry({ workerId: 'w1', siteId: 's1', date: '2026-10-15', status: 'rejeitado' })]
    expect(siteMetrics(s, assignments, entries, TODAY, DEFAULT_SETTINGS).plannedFuture).toBe(8)
  })

  it('inclui o histórico anterior e calcula saldo e projeção', () => {
    const withBaseline = { ...s, baselineRealized: 50, baselineApproved: 40 }
    const assignments = [assignment({ workerId: 'w1', siteId: 's1', date: '2026-10-16' })]
    const entries = [entry({ workerId: 'w1', siteId: 's1', date: '2026-10-14', status: 'aprovado' })]
    const m = siteMetrics(withBaseline, assignments, entries, TODAY, DEFAULT_SETTINGS)
    expect(m).toMatchObject({
      limit: 100,
      realized: 58,
      approved: 48,
      plannedFuture: 8,
      balance: 42,
      projection: 66,
      status: 'normal',
    })
    expect(m.pctRealized).toBeCloseTo(0.58)
    expect(m.pctProjection).toBeCloseTo(0.66)
  })

  it('classifica atenção a partir de 85 % de projeção', () => {
    const m = siteMetrics({ ...s, baselineRealized: 80 }, [assignment({ workerId: 'w', siteId: 's1', date: TODAY })], [], TODAY, DEFAULT_SETTINGS)
    expect(m.projection).toBe(88)
    expect(m.status).toBe('atencao')
  })

  it('classifica excede quando a projeção passa o limite', () => {
    const m = siteMetrics(
      { ...s, baselineRealized: 95 },
      [assignment({ workerId: 'w', siteId: 's1', date: TODAY })],
      [],
      TODAY,
      DEFAULT_SETTINGS,
    )
    expect(m.status).toBe('excede')
    expect(m.overBy).toBe(3)
  })

  it('sem limite definido não classifica risco', () => {
    const m = siteMetrics({ ...s, hourLimit: null, baselineRealized: 5000 }, [], [], TODAY, DEFAULT_SETTINGS)
    expect(m.status).toBe('sem_limite')
    expect(m.balance).toBeNull()
  })
})
