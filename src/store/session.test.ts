import { describe, expect, it } from 'vitest'
import { createDemoStore } from './store'
import { selectConflicts, selectWorkerView } from './selectors'
import { addDays, weekStart } from '@/domain/weeks'

const TODAY = '2026-10-15'
const NEXT = addDays(weekStart(TODAY), 7)
const make = () => createDemoStore({ today: TODAY, persist: false, syncDelayMs: 0, clock: () => '08:10' })

describe('offline simulado', () => {
  it('sem rede, as ações do trabalhador ficam pendentes e só alteram o DB ao sincronizar', async () => {
    const store = make()
    const st = () => store.getState()
    const wid = st().session.personas.trabalhador
    st().setRole('trabalhador')
    st().setOnline(false)
    st().clockIn('07:58')
    expect(st().session.outbox).toHaveLength(1)
    expect(Object.values(st().db.entries).some((e) => e.workerId === wid && e.date === TODAY)).toBe(false)
    // A vista do trabalhador mostra a operação pendente
    const view = selectWorkerView(st())
    expect(view.todayEntry?.clockIn).toBe('07:58')
    expect(view.pending).toBe(1)
    st().setOnline(true)
    await st().syncOutbox()
    expect(st().session.outbox).toHaveLength(0)
    const e = Object.values(st().db.entries).find((x) => x.workerId === wid && x.date === TODAY)!
    expect(e.clockIn).toBe('07:58') // hora real do registo, não a da sincronização
  })
})

describe('anular planeamento', () => {
  it('remove e repõe atribuições', () => {
    const store = make()
    const ids = Object.values(store.getState().db.assignments).filter((a) => a.date === NEXT).map((a) => a.id).slice(0, 3)
    store.getState().removeAssignments(ids)
    expect(ids.every((id) => !store.getState().db.assignments[id])).toBe(true)
    expect(store.getState().canUndo()).toBe(true)
    store.getState().undo()
    expect(ids.every((id) => !!store.getState().db.assignments[id])).toBe(true)
  })
})

describe('correções de conflitos', () => {
  it('aplicar a correção sugerida resolve o conflito', () => {
    const store = make()
    const c = selectConflicts(store.getState()).find((x) => x.type === 'viatura_indisponivel')!
    const fix = c.fixes.find((f) => f.action.kind === 'swap_vehicle')!
    const res = store.getState().applyFix(c.id, fix.id)
    expect(res.ok).toBe(true)
    expect(selectConflicts(store.getState()).some((x) => x.id === c.id)).toBe(false)
  })

  it('substituir trabalhador ausente', () => {
    const store = make()
    const c = selectConflicts(store.getState()).find((x) => x.type === 'ausencia')!
    const fix = c.fixes.find((f) => f.action.kind === 'replace_worker')!
    store.getState().applyFix(c.id, fix.id)
    expect(selectConflicts(store.getState()).some((x) => x.id === c.id)).toBe(false)
  })

  it('correções de navegação devolvem o destino', () => {
    const store = make()
    const c = selectConflicts(store.getState()).find((x) => x.type === 'documento')!
    const res = store.getState().applyFix(c.id, 'open')
    expect(res.navigate).toMatch(/^\/trabalhadores\//)
  })
})

describe('copiar semana anterior', () => {
  it('copia a semana atual para a seguinte sem duplicar o que já existe', () => {
    const store = make()
    const st = () => store.getState()
    const following = addDays(NEXT, 7)
    const plan = st().previewCopyWeek(NEXT, following, {})
    expect(plan.drafts.length).toBeGreaterThan(30)
    const res = st().applyCopyWeek(NEXT, following, {})
    expect(res.created).toBe(plan.drafts.length)
    expect(st().previewCopyWeek(NEXT, following, {}).drafts).toHaveLength(0)
  })
})

describe('demonstração', () => {
  it('repor demonstração volta à semente', () => {
    const store = make()
    const n = Object.keys(store.getState().db.assignments).length
    store.getState().removeAssignments(Object.keys(store.getState().db.assignments).slice(0, 10))
    store.getState().resetDemo()
    expect(Object.keys(store.getState().db.assignments)).toHaveLength(n)
    expect(store.getState().canUndo()).toBe(false)
  })

  it('o papel muda a persona ativa', () => {
    const store = make()
    store.getState().setRole('encarregado')
    expect(store.getState().session.role).toBe('encarregado')
    const other = Object.values(store.getState().db.teams).find((t) => t.foremanId !== store.getState().session.personas.encarregado)!
    store.getState().setPersona('encarregado', other.foremanId!)
    expect(store.getState().session.personas.encarregado).toBe(other.foremanId)
  })
})
