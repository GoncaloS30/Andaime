import { describe, expect, it } from 'vitest'
import { createSeed } from './index'
import { detectConflicts } from '@/domain/conflicts'
import { siteMetrics } from '@/domain/siteMetrics'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { addDays, weekStart } from '@/domain/weeks'

const TODAY = '2026-10-15' // quinta-feira

describe('createSeed', () => {
  const { db, personas } = createSeed({ today: TODAY })

  it('é determinístico para a mesma data e semente', () => {
    expect(JSON.stringify(createSeed({ today: TODAY }).db)).toBe(JSON.stringify(db))
  })

  it('tem os volumes previstos', () => {
    const workers = Object.values(db.workers)
    expect(workers).toHaveLength(42)
    expect(workers.filter((w) => w.category === 'Encarregado')).toHaveLength(6)
    expect(Object.keys(db.teams)).toHaveLength(8)
    expect(Object.keys(db.vehicles)).toHaveLength(11)
    expect(Object.keys(db.sites)).toHaveLength(9)
    expect(new Set(Object.values(db.sites).map((s) => s.country))).toEqual(new Set(['PT', 'FR', 'BE', 'DE']))
  })

  it('cada equipa tem encarregado, viatura com lugares suficientes e obra', () => {
    for (const t of Object.values(db.teams)) {
      expect(t.foremanId).toBeTruthy()
      expect(t.memberIds).toContain(t.foremanId)
      expect(db.vehicles[t.vehicleId!]!.seats).toBeGreaterThanOrEqual(t.memberIds.length)
      expect(db.sites[t.siteId!]).toBeDefined()
    }
  })

  it('não usa nomes duplicados', () => {
    const names = Object.values(db.workers).map((w) => w.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('planta os conflitos de demonstração', () => {
    const ws = weekStart(TODAY)
    const conflicts = detectConflicts(db, { from: TODAY, to: addDays(ws, 13) }, TODAY, DEFAULT_SETTINGS)
    const types = new Set(conflicts.map((c) => c.type))
    for (const t of ['sobreposicao', 'ausencia', 'documento', 'viatura_dupla', 'viatura_indisponivel', 'lotacao', 'sem_encarregado', 'limite'] as const) {
      expect(types, t).toContain(t)
    }
    expect(conflicts.length).toBeGreaterThanOrEqual(8)
    expect(conflicts.length).toBeLessThanOrEqual(14)
    // Todos os conflitos (exceto limite) têm pelo menos uma correção executável
    for (const c of conflicts) expect(c.fixes.length, c.id).toBeGreaterThan(0)
  })

  it('a persona trabalhador está escalada hoje e ainda não registou entrada', () => {
    const w = db.workers[personas.trabalhador]!
    const today = Object.values(db.assignments).filter((a) => a.workerId === w.id && a.date === TODAY)
    expect(today).toHaveLength(1)
    expect(Object.values(db.entries).some((e) => e.workerId === w.id && e.date === TODAY)).toBe(false)
  })

  it('a persona encarregado lidera uma equipa com registos por rever', () => {
    const team = Object.values(db.teams).find((t) => t.foremanId === personas.encarregado)!
    const pending = Object.values(db.entries).filter((e) => team.memberIds.includes(e.workerId) && e.status === 'submetido')
    expect(pending.length).toBeGreaterThan(0)
  })

  it('há folhas por aprovar, documentos a expirar e pedidos de ausência pendentes', () => {
    expect(Object.values(db.entries).filter((e) => e.status === 'revisto').length).toBeGreaterThan(5)
    expect(Object.values(db.entries).filter((e) => e.status === 'rejeitado').length).toBeGreaterThan(0)
    expect(Object.values(db.absences).filter((a) => a.status === 'pedido').length).toBeGreaterThanOrEqual(2)
    const soon = Object.values(db.documents).filter((d) => d.expiresAt && d.expiresAt >= TODAY && d.expiresAt <= addDays(TODAY, 30))
    expect(soon.length).toBeGreaterThanOrEqual(3)
  })

  it('as obras mostram estados de horas variados, com uma a exceder', () => {
    const statuses = Object.values(db.sites)
      .filter((s) => s.status === 'em_curso')
      .map((s) => siteMetrics(s, Object.values(db.assignments), Object.values(db.entries), TODAY, DEFAULT_SETTINGS).status)
    expect(statuses).toContain('normal')
    expect(statuses).toContain('atencao')
    expect(statuses).toContain('excede')
  })

  it('funciona quando hoje é fim de semana', () => {
    const sat = createSeed({ today: '2026-10-17' })
    expect(Object.keys(sat.db.workers)).toHaveLength(42)
  })
})
