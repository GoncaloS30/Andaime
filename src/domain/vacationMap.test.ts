import { describe, expect, it } from 'vitest'
import { absence, db as makeDB, worker } from '@/test/builders'
import { workdaysInYear, yearMap, yearsWithAbsences } from './vacationMap'

describe('mapa de férias do ano', () => {
  it('conta só os dias úteis dentro do ano', () => {
    // 29/12/2025 (seg) a 2/1/2026 (sex): 2 dias úteis em 2026
    expect(workdaysInYear('2025-12-29', '2026-01-02', 2026)).toBe(2)
    expect(workdaysInYear('2025-12-29', '2026-01-02', 2025)).toBe(3)
    expect(workdaysInYear('2026-08-03', '2026-08-14', 2026)).toBe(10)
  })
  it('uma linha por trabalhador ativo, com os períodos que tocam o ano; sem férias, linha vazia', () => {
    const db = makeDB({
      workers: [worker({ id: 'w1', name: 'Ana' }), worker({ id: 'w2', name: 'Bruno' }), worker({ id: 'w3', name: 'Carla', status: 'inativo' })],
      absences: [
        absence({ id: 'a1', workerId: 'w1', start: '2026-08-03', end: '2026-08-14', status: 'aprovado' }),
        absence({ id: 'a2', workerId: 'w1', start: '2026-12-28', end: '2027-01-05', status: 'pedido' }),
        absence({ id: 'a3', workerId: 'w1', start: '2025-07-01', end: '2025-07-10', status: 'aprovado' }),
        absence({ id: 'a4', workerId: 'w1', start: '2026-03-02', end: '2026-03-02', status: 'rejeitado' }),
        absence({ id: 'b1', workerId: 'w2', type: 'baixa', start: '2026-02-10', end: '2026-02-12', status: 'aprovado' }),
      ],
    })
    const rows = yearMap(db, 2026)
    expect(rows.map((r) => r.worker.id)).toEqual(['w1', 'w2'])
    expect(rows[0]!.periods.map((p) => p.id)).toEqual(['a1', 'a2'])
    expect(rows[0]!.vacationDays).toBe(10) // só férias aprovadas
    expect(rows[0]!.pendingDays).toBe(4) // 28–31/12 em 2026
    expect(rows[1]!.vacationDays).toBe(0) // baixa não conta como férias
  })
  it('anos para o seletor: com ausências, o corrente e o seguinte', () => {
    const db = makeDB({ absences: [absence({ workerId: 'w1', start: '2024-05-01', end: '2024-05-03' })] })
    expect(yearsWithAbsences(db, '2026-10-15')).toEqual([2024, 2026, 2027])
  })
})
