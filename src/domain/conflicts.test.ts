import { describe, expect, it } from 'vitest'
import { detectConflicts, type Conflict } from './conflicts'
import { DEFAULT_SETTINGS } from './types'
import { absence, assignment, db, doc, docType, site, vehicle, worker } from '@/test/builders'

const TODAY = '2026-10-12' // segunda
const RANGE = { from: '2026-10-12', to: '2026-10-18' }
const run = (data: Parameters<typeof detectConflicts>[0]) => detectConflicts(data, RANGE, TODAY, DEFAULT_SETTINGS)
const ofType = (cs: Conflict[], t: Conflict['type']) => cs.filter((c) => c.type === t)

const sA = () => site({ id: 'sA', code: 'OB-A', name: 'Alfa', hourLimit: null })
const sB = () => site({ id: 'sB', code: 'OB-B', name: 'Beta', hourLimit: null })
const boss = () => worker({ id: 'boss', name: 'Encarregado Um', category: 'Encarregado' })

describe('detectConflicts', () => {
  it('sobreposição: duas obras com horários sobrepostos no mesmo dia', () => {
    const w = worker({ id: 'w1', name: 'Ana Silva' })
    const a1 = assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-14' })
    const a2 = assignment({ workerId: 'w1', siteId: 'sB', date: '2026-10-14' })
    const cs = ofType(
      run(db({ workers: [w, boss()], sites: [sA(), sB()], assignments: [a1, a2, assignment({ workerId: 'boss', siteId: 'sA', date: '2026-10-14' }), assignment({ workerId: 'boss', siteId: 'sB', date: '2026-10-14', start: '07:00', end: '07:30', hours: 0.5 })] })),
      'sobreposicao',
    ).filter((c) => c.workerIds.includes('w1'))
    expect(cs).toHaveLength(1)
    const c = cs[0]!
    expect(c.severity).toBe('critico')
    expect(c.assignmentIds.sort()).toEqual([a1.id, a2.id].sort())
    expect(c.explanation).toContain('OB-A')
    expect(c.explanation).toContain('OB-B')
    expect(c.fixes.map((f) => f.action.kind)).toContain('remove_assignment')
  })

  it('dia repartido sem sobreposição e dentro da capacidade não é conflito', () => {
    const w = worker({ id: 'w1' })
    const data = db({
      workers: [w],
      sites: [sA(), sB()],
      assignments: [
        assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-14', start: '08:00', end: '12:00', hours: 4 }),
        assignment({ workerId: 'w1', siteId: 'sB', date: '2026-10-14', start: '13:00', end: '17:00', hours: 4 }),
      ],
    })
    expect(ofType(run(data), 'sobreposicao')).toHaveLength(0)
  })

  it('ausência: atribuído em dias de férias aprovadas, sugere substitutos livres da mesma categoria', () => {
    const w = worker({ id: 'w1', name: 'Rui Costa', category: 'Pedreiro' })
    const free = worker({ id: 'w2', name: 'Livre Pedreiro', category: 'Pedreiro' })
    const busy = worker({ id: 'w3', name: 'Ocupado', category: 'Pedreiro' })
    const data = db({
      workers: [w, free, busy],
      sites: [sA()],
      absences: [absence({ workerId: 'w1', start: '2026-10-13', end: '2026-10-14' })],
      assignments: [
        assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-13' }),
        assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-14' }),
        assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-15' }),
        assignment({ workerId: 'w3', siteId: 'sA', date: '2026-10-13' }),
      ],
    })
    const cs = ofType(run(data), 'ausencia')
    expect(cs).toHaveLength(1)
    expect(cs[0]!.assignmentIds).toHaveLength(2)
    const replace = cs[0]!.fixes.filter((f) => f.action.kind === 'replace_worker')
    expect(replace.map((f) => (f.action.kind === 'replace_worker' ? f.action.workerId : ''))).toEqual(['w2'])
  })

  it('documento: obra em França exige A1 válido na data', () => {
    const w = worker({ id: 'w1', name: 'Destacado' })
    const a1 = docType({ id: 'A1', countries: ['FR'] })
    const lyon = site({ id: 'sF', country: 'FR', code: 'OB-F', hourLimit: null })
    const data = db({
      workers: [w],
      sites: [lyon],
      docTypes: [a1],
      documents: [doc({ typeId: 'A1', ownerId: 'w1', expiresAt: '2026-10-13' })],
      assignments: [
        assignment({ workerId: 'w1', siteId: 'sF', date: '2026-10-13' }),
        assignment({ workerId: 'w1', siteId: 'sF', date: '2026-10-14' }),
      ],
    })
    const cs = ofType(run(data), 'documento')
    expect(cs).toHaveLength(1)
    expect(cs[0]!.assignmentIds).toHaveLength(1) // só o dia 14 está fora da validade
    expect(cs[0]!.fixes[0]!.action).toEqual({ kind: 'open_document', workerId: 'w1', typeId: 'A1' })
  })

  it('documento: em falta ou rejeitado também conta; em Portugal não exige A1', () => {
    const w = worker({ id: 'w1' })
    const a1 = docType({ id: 'A1', countries: ['FR'] })
    const pt = site({ id: 'sP', country: 'PT', hourLimit: null })
    const fr = site({ id: 'sF', country: 'FR', hourLimit: null })
    const missing = db({
      workers: [w], sites: [fr], docTypes: [a1],
      assignments: [assignment({ workerId: 'w1', siteId: 'sF', date: '2026-10-13' })],
    })
    expect(ofType(run(missing), 'documento')).toHaveLength(1)
    const inPT = db({
      workers: [w], sites: [pt], docTypes: [a1],
      assignments: [assignment({ workerId: 'w1', siteId: 'sP', date: '2026-10-13' })],
    })
    expect(ofType(run(inPT), 'documento')).toHaveLength(0)
  })

  it('viatura com dupla reserva sugere alternativa livre com lugares suficientes', () => {
    const v = vehicle({ id: 'v1', plate: 'AA-11-BB', seats: 9, teamId: 't1' })
    const small = vehicle({ id: 'v2', plate: 'CC-22-DD', seats: 1 })
    const ok = vehicle({ id: 'v3', plate: 'EE-33-FF', seats: 6 })
    const shop = vehicle({ id: 'v4', status: 'oficina', seats: 9 })
    const ws = [worker({ id: 'w1' }), worker({ id: 'w2' }), worker({ id: 'w3' })]
    const data = db({
      workers: ws, sites: [sA(), sB()], vehicles: [v, small, ok, shop],
      assignments: [
        assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-15', vehicleId: 'v1', teamId: 't1' }),
        assignment({ workerId: 'w2', siteId: 'sB', date: '2026-10-15', vehicleId: 'v1' }),
        assignment({ workerId: 'w3', siteId: 'sB', date: '2026-10-15', vehicleId: 'v1' }),
      ],
    })
    const cs = ofType(run(data), 'viatura_dupla')
    expect(cs).toHaveLength(1)
    const swaps = cs[0]!.fixes.filter((f) => f.action.kind === 'swap_vehicle')
    expect(swaps.map((f) => (f.action.kind === 'swap_vehicle' ? f.action.vehicleId : ''))).toEqual(['v3'])
  })

  it('viatura indisponível por inspeção expirada ou oficina', () => {
    const v = vehicle({ id: 'v1', inspectionUntil: '2026-10-10' })
    const alt = vehicle({ id: 'v2' })
    const data = db({
      workers: [worker({ id: 'w1' })], sites: [sA()], vehicles: [v, alt],
      assignments: [assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-13', vehicleId: 'v1' })],
    })
    const cs = ofType(run(data), 'viatura_indisponivel')
    expect(cs).toHaveLength(1)
    expect(cs[0]!.explanation).toContain('inspeção')
    expect(cs[0]!.fixes.some((f) => f.action.kind === 'swap_vehicle' && f.action.vehicleId === 'v2')).toBe(true)
  })

  it('lotação insuficiente quando há mais passageiros do que lugares', () => {
    const v = vehicle({ id: 'v1', seats: 2 })
    const big = vehicle({ id: 'v2', seats: 9 })
    const ws = [worker({ id: 'w1' }), worker({ id: 'w2' }), worker({ id: 'w3' })]
    const data = db({
      workers: ws, sites: [sA()], vehicles: [v, big],
      assignments: ws.map((w) => assignment({ workerId: w.id, siteId: 'sA', date: '2026-10-13', vehicleId: 'v1' })),
    })
    const cs = ofType(run(data), 'lotacao')
    expect(cs).toHaveLength(1)
    expect(cs[0]!.fixes.some((f) => f.action.kind === 'swap_vehicle' && f.action.vehicleId === 'v2')).toBe(true)
  })

  it('obra sem encarregado num dia com equipa sugere o encarregado da obra', () => {
    const b = boss()
    const s = site({ id: 'sA', code: 'OB-A', foremanId: 'boss', hourLimit: null })
    const data = db({
      workers: [b, worker({ id: 'w1' }), worker({ id: 'w2' })], sites: [s],
      assignments: [
        assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-13' }),
        assignment({ workerId: 'w2', siteId: 'sA', date: '2026-10-13' }),
      ],
    })
    const cs = ofType(run(data), 'sem_encarregado')
    expect(cs).toHaveLength(1)
    expect(cs[0]!.fixes[0]!.action).toEqual({ kind: 'assign_worker', siteId: 'sA', date: '2026-10-13', workerId: 'boss', isForeman: true })
  })

  it('projeção acima do limite gera conflito de obra com ajuste de limite', () => {
    const s = site({ id: 'sA', hourLimit: 100, baselineRealized: 98 })
    const data = db({
      workers: [worker({ id: 'w1' })], sites: [s],
      assignments: [assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-13', isForeman: true })],
    })
    const cs = ofType(run(data), 'limite')
    expect(cs).toHaveLength(1)
    expect(cs[0]!.fixes.find((f) => f.action.kind === 'raise_limit')?.action).toEqual({ kind: 'raise_limit', siteId: 'sA', limit: 200 })
  })

  it('trabalhador inativo atribuído', () => {
    const data = db({
      workers: [worker({ id: 'w1', status: 'inativo' })], sites: [sA()],
      assignments: [assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-13', isForeman: true })],
    })
    expect(ofType(run(data), 'inativo')).toHaveLength(1)
  })

  it('ignora dias anteriores a hoje e fora do intervalo', () => {
    const w = worker({ id: 'w1', status: 'inativo' })
    const data = db({
      workers: [w], sites: [sA()],
      assignments: [
        assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-11', isForeman: true }),
        assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-20', isForeman: true }),
      ],
    })
    expect(run(data)).toHaveLength(0)
  })

  it('ids são estáveis entre execuções', () => {
    const data = db({
      workers: [worker({ id: 'w1', status: 'inativo' })], sites: [sA()],
      assignments: [assignment({ workerId: 'w1', siteId: 'sA', date: '2026-10-13', isForeman: true })],
    })
    expect(run(data).map((c) => c.id)).toEqual(run(data).map((c) => c.id))
  })
})
