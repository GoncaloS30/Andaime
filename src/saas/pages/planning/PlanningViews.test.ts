import { describe, expect, it } from 'vitest'
import { daysBetween, monthRange, shiftMonth } from './PlanningViews'

describe('intervalos do planeamento mensal', () => {
  it('calcula o primeiro e o último dia, incluindo anos bissextos', () => {
    expect(monthRange('2028-02-15')).toEqual(['2028-02-01', '2028-02-29'])
    expect(monthRange('2027-02-15')).toEqual(['2027-02-01', '2027-02-28'])
  })

  it('avança entre anos sem depender do fuso do browser', () => {
    expect(shiftMonth('2026-12-20', 1)).toBe('2027-01-01')
    expect(shiftMonth('2026-01-20', -1)).toBe('2025-12-01')
  })

  it('enumera os dias do intervalo pelas datas ISO', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  })
})
