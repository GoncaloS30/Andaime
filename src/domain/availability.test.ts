import { describe, expect, it } from 'vitest'
import { availability, buildIndex } from './availability'
import { absence, assignment, db, worker } from '@/test/builders'

const D = '2026-10-15'

describe('availability', () => {
  it('livre quando não tem atribuições nem ausências', () => {
    const w = worker({ id: 'w1' })
    const data = db({ workers: [w] })
    expect(availability(w, D, buildIndex(data))).toMatchObject({ state: 'livre', plannedHours: 0, capacity: 8 })
  })

  it('atribuído quando as horas planeadas enchem a capacidade', () => {
    const w = worker({ id: 'w1' })
    const data = db({ workers: [w], assignments: [assignment({ workerId: 'w1', siteId: 's1', date: D })] })
    expect(availability(w, D, buildIndex(data)).state).toBe('atribuido')
  })

  it('parcial quando ainda sobram horas', () => {
    const w = worker({ id: 'w1' })
    const data = db({ workers: [w], assignments: [assignment({ workerId: 'w1', siteId: 's1', date: D, hours: 4 })] })
    expect(availability(w, D, buildIndex(data))).toMatchObject({ state: 'parcial', plannedHours: 4 })
  })

  it('ausente com ausência aprovada que cobre o dia', () => {
    const w = worker({ id: 'w1' })
    const a = absence({ workerId: 'w1', start: '2026-10-14', end: '2026-10-16' })
    const out = availability(w, D, buildIndex(db({ workers: [w], absences: [a] })))
    expect(out.state).toBe('ausente')
    expect(out.absence?.id).toBe(a.id)
    expect(out.capacity).toBe(0)
  })

  it('ignora pedidos ainda não aprovados', () => {
    const w = worker({ id: 'w1' })
    const a = absence({ workerId: 'w1', start: D, end: D, status: 'pedido' })
    expect(availability(w, D, buildIndex(db({ workers: [w], absences: [a] }))).state).toBe('livre')
  })

  it('ausência parcial reduz a capacidade do dia', () => {
    const w = worker({ id: 'w1' })
    const a = absence({ workerId: 'w1', start: D, end: D, type: 'parcial', hours: 3 })
    const out = availability(w, D, buildIndex(db({ workers: [w], absences: [a] })))
    expect(out).toMatchObject({ state: 'parcial', capacity: 5 })
  })

  it('inativo tem precedência', () => {
    const w = worker({ id: 'w1', status: 'inativo' })
    expect(availability(w, D, buildIndex(db({ workers: [w] }))).state).toBe('inativo')
  })
})
