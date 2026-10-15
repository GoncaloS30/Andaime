import { describe, expect, it } from 'vitest'
import { newConflicts, planCopyWeek, workdaysBetween } from './planning'
import { absence, assignment, db, site, worker } from '@/test/builders'
import type { Conflict } from './conflicts'

const FROM = '2026-10-05'
const TO = '2026-10-12'

describe('planCopyWeek', () => {
  it('copia as atribuições desfasadas 7 dias, preservando obra, horário e viatura', () => {
    const data = db({
      workers: [worker({ id: 'w1', teamId: 't1' })],
      sites: [site({ id: 's1' })],
      assignments: [
        assignment({ workerId: 'w1', siteId: 's1', date: '2026-10-05', teamId: 't1', vehicleId: 'v1', start: '07:30', end: '16:30' }),
        assignment({ workerId: 'w1', siteId: 's1', date: '2026-10-06', teamId: 't1', vehicleId: 'v1' }),
      ],
    })
    const plan = planCopyWeek(data, FROM, TO, {})
    expect(plan.drafts.map((d) => [d.date, d.siteId, d.start, d.vehicleId])).toEqual([
      ['2026-10-12', 's1', '07:30', 'v1'],
      ['2026-10-13', 's1', '08:00', 'v1'],
    ])
    expect(plan.skipped).toEqual([])
  })

  it('salta dias com ausência aprovada, trabalhadores inativos e dias já planeados', () => {
    const data = db({
      workers: [worker({ id: 'w1' }), worker({ id: 'w2', status: 'inativo' }), worker({ id: 'w3' })],
      sites: [site({ id: 's1' })],
      absences: [absence({ workerId: 'w1', start: '2026-10-12', end: '2026-10-12' })],
      assignments: [
        assignment({ workerId: 'w1', siteId: 's1', date: '2026-10-05' }),
        assignment({ workerId: 'w2', siteId: 's1', date: '2026-10-05' }),
        assignment({ workerId: 'w3', siteId: 's1', date: '2026-10-05' }),
        assignment({ workerId: 'w3', siteId: 's1', date: '2026-10-12' }),
      ],
    })
    const plan = planCopyWeek(data, FROM, TO, {})
    expect(plan.drafts).toEqual([])
    expect(plan.skipped.map((s) => [s.workerId, s.reason])).toEqual([
      ['w1', 'ausente'],
      ['w2', 'inativo'],
      ['w3', 'ja_planeado'],
    ])
  })

  it('filtra por equipas', () => {
    const data = db({
      workers: [worker({ id: 'w1' }), worker({ id: 'w2' })],
      sites: [site({ id: 's1' })],
      assignments: [
        assignment({ workerId: 'w1', siteId: 's1', date: '2026-10-05', teamId: 't1' }),
        assignment({ workerId: 'w2', siteId: 's1', date: '2026-10-05', teamId: 't2' }),
      ],
    })
    expect(planCopyWeek(data, FROM, TO, { teamIds: ['t2'] }).drafts.map((d) => d.workerId)).toEqual(['w2'])
  })
})

describe('workdaysBetween', () => {
  it('lista dias úteis, ou todos com fins de semana', () => {
    expect(workdaysBetween('2026-10-16', '2026-10-19')).toEqual(['2026-10-16', '2026-10-19'])
    expect(workdaysBetween('2026-10-16', '2026-10-19', true)).toHaveLength(4)
  })
})

describe('newConflicts', () => {
  it('devolve só os conflitos que não existiam antes', () => {
    const c = (id: string) => ({ id }) as Conflict
    expect(newConflicts([c('a'), c('b')], [c('b'), c('c')]).map((x) => x.id)).toEqual(['c'])
  })
})
