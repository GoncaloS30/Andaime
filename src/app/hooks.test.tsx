import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDerived } from './hooks'

describe('useDerived', () => {
  it('recalcula quando muda um valor usado pela função (ex.: a semana visível)', () => {
    const { result, rerender } = renderHook(({ week }) => useDerived(() => week, [week]), { initialProps: { week: '2026-10-12' } })
    expect(result.current).toBe('2026-10-12')
    rerender({ week: '2026-10-19' })
    expect(result.current).toBe('2026-10-19')
  })
})
