import { describe, expect, it } from 'vitest'
import type { CalendarItem } from '../../api/calendar'
import { itemsOnDay, linkTarget, monthGrid, shiftMonth } from './agendaGrid'

const item = (over: Partial<CalendarItem>): CalendarItem => ({
  id: 'x',
  layer: 'EVENT',
  kind: 'EVENT',
  title: 'Evento',
  detail: null,
  start: '2026-10-10',
  end: '2026-10-10',
  time: null,
  tone: 'event',
  color: null,
  late: false,
  link: null,
  ...over,
})

describe('agenda', () => {
  it('grelha do mês de segunda a domingo com os dias vizinhos', () => {
    const october = monthGrid('2026-10')
    expect(october).toHaveLength(5)
    expect(october[0]![0]).toBe('2026-09-28')
    expect(october.at(-1)!.at(-1)).toBe('2026-11-01')
    expect(monthGrid('2027-02')).toHaveLength(4)
    expect(monthGrid('2026-08')).toHaveLength(6)
  })

  it('muda de mês passando o ano', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('um período de vários dias aparece em cada dia que atravessa', () => {
    const items = [item({ id: 'a', start: '2026-10-09', end: '2026-10-12' }), item({ id: 'b' })]
    expect(itemsOnDay(items, '2026-10-11').map((i) => i.id)).toEqual(['a'])
    expect(itemsOnDay(items, '2026-10-10').map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('abre a entidade ligada', () => {
    expect(linkTarget(item({ link: { type: 'SITE', id: 's1' } }), false)).toBe('/obras/s1')
    expect(linkTarget(item({ link: { type: 'EMPLOYEE_DOCUMENTS', id: 'e1' } }), true)).toBe('/encarregado/documentos?employeeId=e1')
    expect(linkTarget(item({ link: { type: 'EVENT', id: 'e1' } }), false)).toBeNull()
  })
})
