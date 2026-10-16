import { describe, expect, it } from 'vitest'
import { SERIES } from '@/domain/palette'
import { avatarBackground } from './Avatar'

const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}

describe('avatarBackground', () => {
  it('garante contraste ≥ 4,5:1 com iniciais brancas para todas as cores usadas', () => {
    for (const c of [...SERIES, '#6f9a84', '#7d847f', '#13342a', '#3b6a8c', '#24543f']) {
      const ratio = 1.05 / (lum(avatarBackground(c)) + 0.05)
      expect(ratio, c).toBeGreaterThanOrEqual(4.5)
    }
  })
})
