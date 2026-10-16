import { describe, expect, it } from 'vitest'
import { conflictIndex, runs } from './model'
import type { Conflict } from '@/domain/conflicts'
import { assignment } from '@/test/builders'

describe('runs', () => {
  it('agrupa dias seguidos na mesma obra, atravessando o fim de semana', () => {
    const list = [
      assignment({ workerId: 'w', siteId: 'A', date: '2026-10-15' }),
      assignment({ workerId: 'w', siteId: 'A', date: '2026-10-16' }),
      assignment({ workerId: 'w', siteId: 'A', date: '2026-10-19' }),
      assignment({ workerId: 'w', siteId: 'B', date: '2026-10-20' }),
      assignment({ workerId: 'w', siteId: 'A', date: '2026-10-22' }),
    ]
    expect(runs(list).map((r) => [r.siteId, r.from, r.to, r.days])).toEqual([
      ['A', '2026-10-15', '2026-10-19', 3],
      ['B', '2026-10-20', '2026-10-20', 1],
      ['A', '2026-10-22', '2026-10-22', 1],
    ])
  })
})

describe('conflictIndex', () => {
  it('indexa conflitos por atribuição e mantém o mais grave primeiro', () => {
    const c = (id: string, severity: 'critico' | 'aviso', ids: string[]) => ({ id, severity, assignmentIds: ids }) as Conflict
    const idx = conflictIndex([c('x', 'aviso', ['a1', 'a2']), c('y', 'critico', ['a2'])])
    expect(idx.get('a1')!.map((x) => x.id)).toEqual(['x'])
    expect(idx.get('a2')!.map((x) => x.id)).toEqual(['y', 'x'])
  })
})
