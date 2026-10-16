import { describe, expect, it } from 'vitest'
import { plural } from './plural'

describe('plural', () => {
  it('concorda o nome (e o particípio) com o número', () => {
    expect(plural(1, 'registo aprovado', 'registos aprovados')).toBe('1 registo aprovado')
    expect(plural(3, 'registo aprovado', 'registos aprovados')).toBe('3 registos aprovados')
  })
  it('zero usa o plural', () => {
    expect(plural(0, 'atribuição', 'atribuições')).toBe('0 atribuições')
  })
})
