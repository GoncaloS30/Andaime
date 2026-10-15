import { describe, expect, it } from 'vitest'
import { createDemoStore } from './store'
import { selectConflicts, selectDashboard, selectSiteMetrics } from './selectors'
import { addDays, weekStart } from '@/domain/weeks'
import { availability, buildIndex } from '@/domain/availability'
import { buildWeeklyMap } from '@/domain/weeklyMap'

const TODAY = '2026-10-15'
const WS = weekStart(TODAY)
const NEXT = addDays(WS, 7)

function make() {
  return createDemoStore({ today: TODAY, persist: false, syncDelayMs: 0, clock: () => '08:02' })
}

describe('Fluxo 1 — criar obra', () => {
  it('cria a obra com cliente novo, equipa e viatura, e reflete-se no dashboard e no planeamento', () => {
    const store = make()
    const s = store.getState()
    const before = selectDashboard(s).sitesInProgress
    const team = s.db.teams.t4!
    const siteId = s.createSite({
      name: 'Armazém Maia Norte',
      newClient: { name: 'Maia Logística, Lda.', contactName: 'Rita Gomes', email: 'obras@maia.example', country: 'PT' },
      country: 'PT',
      city: 'Maia',
      address: 'Zona Industrial da Maia',
      lat: 41.23,
      lng: -8.62,
      hourLimit: 3000,
      startDate: TODAY,
      endDate: addDays(TODAY, 180),
      directorId: 'm1',
      description: 'Armazém',
      teamId: 't4',
      vehicleId: 'v9',
      planWeeks: 2,
      moveTeam: true,
    })
    const after = store.getState()
    const site = after.db.sites[siteId]!
    expect(site.status).toBe('em_curso')
    expect(site.code).toMatch(/^OB-26-\d{3}$/)
    expect(after.db.clients[site.clientId]!.name).toBe('Maia Logística, Lda.')
    expect(site.foremanId).toBe(team.foremanId)
    expect(selectDashboard(after).sitesInProgress).toBe(before + 1)
    expect(after.db.teams.t4!.siteId).toBe(siteId)
    expect(after.db.teams.t4!.vehicleId).toBe('v9')
    const planned = Object.values(after.db.assignments).filter((a) => a.siteId === siteId)
    expect(planned.length).toBeGreaterThan(0)
    expect(planned.every((a) => a.vehicleId === 'v9' && a.teamId === 't4')).toBe(true)
    // a equipa saiu da obra anterior nesse período
    expect(Object.values(after.db.assignments).some((a) => a.siteId === 's4' && a.date >= TODAY && a.teamId === 't4')).toBe(false)
    expect(selectSiteMetrics(after, siteId).plannedFuture).toBeGreaterThan(0)
    expect(after.db.activity[0]!.refs.siteId).toBe(siteId)
  })
})

describe('Fluxo 2 — criar escala', () => {
  it('pré-visualiza conflitos e cria as atribuições', () => {
    const store = make()
    const s = store.getState()
    // O pedreiro de reserva está livre de segunda a quarta e tem os documentos em dia
    const reserve = Object.values(s.db.workers).find((w) => !w.teamId && w.category === 'Pedreiro')!
    const input = {
      teamId: 't4',
      siteId: 's4',
      workerIds: [reserve.id],
      dates: [NEXT, addDays(NEXT, 1), addDays(NEXT, 2)],
      start: '07:30',
      end: '16:30',
      vehicleId: null,
      foremanId: null,
      note: 'Reforço de cofragem',
    }
    expect(s.previewSchedule(input)).toEqual([])
    const plannedBefore = selectSiteMetrics(s, 's4').plannedFuture
    const res = s.createSchedule(input)
    expect(res.created).toBe(3)
    const after = store.getState()
    expect(selectSiteMetrics(after, 's4').plannedFuture).toBe(plannedBefore + 24)
    expect(Object.values(after.db.assignments).filter((a) => a.batchId === res.batchId)).toHaveLength(3)
  })

  it('a pré-visualização apanha documentos expirados', () => {
    const s = make().getState()
    const servente = Object.values(s.db.workers).find((w) => !w.teamId && w.category === 'Servente')!
    const conflicts = s.previewSchedule({
      teamId: null, siteId: 's4', workerIds: [servente.id], dates: [NEXT], start: '08:00', end: '17:00', vehicleId: null, foremanId: null, note: '',
    })
    expect(conflicts.map((c) => c.type)).toEqual(['documento'])
  })

  it('deteta conflitos antes de guardar', () => {
    const s = make().getState()
    const busy = s.db.teams.t1!.memberIds[3]!
    const conflicts = s.previewSchedule({
      teamId: null, siteId: 's4', workerIds: [busy], dates: [NEXT], start: '08:00', end: '17:00', vehicleId: null, foremanId: null, note: '',
    })
    expect(conflicts.map((c) => c.type)).toContain('sobreposicao')
  })
})

describe('Fluxo 3 — transferir trabalhador', () => {
  it('transferência temporária muda o planeamento e regista histórico', () => {
    const store = make()
    const wid = store.getState().db.teams.t1!.memberIds[3]!
    const res = store.getState().transferWorker({ workerId: wid, siteId: 's3', from: NEXT, to: addDays(NEXT, 4), permanent: false })
    expect(res.created).toBe(5)
    const after = store.getState()
    const next = Object.values(after.db.assignments).filter((a) => a.workerId === wid && a.date >= NEXT && a.date <= addDays(NEXT, 6))
    expect(next.every((a) => a.siteId === 's3' && a.teamId === 't3' && a.vehicleId === 'v3')).toBe(true)
    expect(after.db.teams.t1!.memberIds).toContain(wid)
    expect(after.db.activity[0]!.refs.workerId).toBe(wid)
  })

  it('transferência permanente muda a composição das equipas', () => {
    const store = make()
    const wid = store.getState().db.teams.t1!.memberIds[3]!
    store.getState().transferWorker({ workerId: wid, siteId: 's3', from: NEXT, to: addDays(NEXT, 4), permanent: true })
    const after = store.getState()
    expect(after.db.teams.t1!.memberIds).not.toContain(wid)
    expect(after.db.teams.t3!.memberIds).toContain(wid)
    expect(after.db.workers[wid]!.teamId).toBe('t3')
    expect(after.db.teams.t3!.history.at(-1)!.text).toContain(after.db.workers[wid]!.name)
  })
})

describe('Fluxo 4 — viaturas', () => {
  it('atribuir viatura ocupada gera conflito; a alternativa resolve e atualiza equipa e planeamento', () => {
    const store = make()
    const s = store.getState()
    const preview = s.previewTeamVehicle('t4', 'v2', TODAY)
    expect(preview.map((c) => c.type)).toContain('viatura_dupla')
    expect(selectConflicts(s).some((c) => c.type === 'viatura_indisponivel')).toBe(true)
    s.setTeamVehicle('t4', 'v9', TODAY)
    const after = store.getState()
    expect(after.db.teams.t4!.vehicleId).toBe('v9')
    expect(after.db.vehicles.v9!.teamId).toBe('t4')
    expect(after.db.vehicles.v4!.teamId).toBeNull()
    expect(Object.values(after.db.assignments).filter((a) => a.teamId === 't4' && a.date >= TODAY).every((a) => a.vehicleId === 'v9')).toBe(true)
    expect(selectConflicts(after).some((c) => c.type === 'viatura_indisponivel')).toBe(false)
  })
})

describe('Fluxo 5 — registar horas', () => {
  it('ponto do trabalhador → revisão do encarregado → aprovação do gestor → obra atualizada', () => {
    const store = make()
    const st = () => store.getState()
    const wid = st().session.personas.trabalhador
    st().setRole('trabalhador')
    st().clockIn('08:02')
    st().startBreak('12:00')
    st().endBreak('13:00')
    st().clockOut('17:05')
    const entry = Object.values(st().db.entries).find((e) => e.workerId === wid && e.date === TODAY)!
    expect(entry).toMatchObject({ status: 'submetido', breakMinutes: 60, clockIn: '08:02', clockOut: '17:05' })
    expect(st().db.notifications.some((n) => n.role === 'encarregado' && n.title.includes('rever'))).toBe(true)

    const approvedBefore = selectSiteMetrics(st(), 's1').approved
    st().setRole('encarregado')
    st().reviewEntries([entry.id])
    expect(st().db.entries[entry.id]!.status).toBe('revisto')
    st().setRole('gestor')
    st().approveEntries([entry.id])
    expect(st().db.entries[entry.id]!.status).toBe('aprovado')
    expect(selectSiteMetrics(st(), 's1').approved).toBeCloseTo(approvedBefore + 8.05, 1)
  })

  it('rejeição exige motivo e notifica', () => {
    const store = make()
    const id = Object.values(store.getState().db.entries).find((e) => e.status === 'revisto')!.id
    expect(() => store.getState().rejectEntries([id], '  ')).toThrow()
    store.getState().rejectEntries([id], 'Horas extra sem justificação')
    expect(store.getState().db.entries[id]!).toMatchObject({ status: 'rejeitado', rejectionReason: 'Horas extra sem justificação' })
  })

  it('correção guarda motivo e valores anteriores', () => {
    const store = make()
    store.getState().setRole('encarregado')
    const e = Object.values(store.getState().db.entries).find((x) => x.status === 'submetido')!
    store.getState().correctEntry(e.id, { clockOut: '18:00' }, 'Saída confirmada em obra')
    const after = store.getState().db.entries[e.id]!
    expect(after.clockOut).toBe('18:00')
    expect(after.corrections.at(-1)).toMatchObject({ reason: 'Saída confirmada em obra', after: expect.stringContaining('18:00') })
    expect(after.status).toBe('revisto')
  })
})

describe('Fluxo 6 — pedido de ausência', () => {
  it('pedido do trabalhador, aprovação do gestor, disponibilidade e conflito no planeamento', () => {
    const store = make()
    const st = () => store.getState()
    const wid = st().session.personas.trabalhador
    st().setRole('trabalhador')
    const absId = st().requestAbsence({ type: 'ferias', start: NEXT, end: addDays(NEXT, 1), reason: 'Assuntos pessoais' })
    expect(st().db.absences[absId]!.status).toBe('pedido')
    expect(selectConflicts(st()).some((c) => c.type === 'ausencia' && c.workerIds.includes(wid))).toBe(false)
    st().setRole('gestor')
    st().decideAbsence(absId, 'aprovado', '')
    const w = st().db.workers[wid]!
    expect(availability(w, NEXT, buildIndex(st().db)).state).toBe('ausente')
    expect(selectConflicts(st()).some((c) => c.type === 'ausencia' && c.workerIds.includes(wid))).toBe(true)
    expect(st().db.notifications.some((n) => n.role === 'trabalhador' && n.personaId === wid && n.title.includes('aprovad'))).toBe(true)
  })
})

describe('Fluxo 7 — equipamento', () => {
  it('regista a entrega, baixa o stock e atualiza o histórico', () => {
    const store = make()
    const wid = store.getState().session.personas.trabalhador
    const stock = store.getState().db.equipment['eq-parka']!.stock
    store.getState().recordDelivery({ workerId: wid, itemId: 'eq-parka', size: 'L', qty: 1, date: TODAY, note: '' })
    const s = store.getState()
    expect(s.db.equipment['eq-parka']!.stock).toBe(stock - 1)
    expect(Object.values(s.db.deliveries).some((d) => d.workerId === wid && d.itemId === 'eq-parka' && d.date === TODAY)).toBe(true)
    expect(s.db.activity[0]!).toMatchObject({ kind: 'equipamento', refs: { workerId: wid } })
  })

  it('devolução repõe stock', () => {
    const store = make()
    const d = Object.values(store.getState().db.deliveries).find((x) => x.itemId === 'eq-arnes' && x.status === 'entregue')!
    const stock = store.getState().db.equipment['eq-arnes']!.stock
    store.getState().recordReturn(d.id, 'devolvido', '')
    expect(store.getState().db.equipment['eq-arnes']!.stock).toBe(stock + 1)
    expect(store.getState().db.deliveries[d.id]!.status).toBe('devolvido')
  })
})

describe('Fluxo 8 — mapas semanais', () => {
  it('o mapa reflete a escala acabada de criar', () => {
    const store = make()
    const reserve = Object.values(store.getState().db.workers).find((w) => !w.teamId && w.category === 'Servente')!
    store.getState().createSchedule({
      teamId: 't1', siteId: 's1', workerIds: [reserve.id], dates: [NEXT], start: '08:00', end: '17:00', vehicleId: null, foremanId: null, note: '',
    })
    const map = buildWeeklyMap(store.getState().db, NEXT, { siteId: 's1' })
    expect(map.groups.flatMap((g) => g.workers.map((w) => w.workerId))).toContain(reserve.id)
  })
})

describe('Fluxo 9 — documentos', () => {
  it('atualizar o documento cria versão, resolve o conflito e o alerta', () => {
    const store = make()
    const s = store.getState()
    const conflict = selectConflicts(s).find((c) => c.type === 'documento' && c.title.includes('A1'))!
    const wid = conflict.workerIds[0]!
    const doc = Object.values(s.db.documents).find((d) => d.ownerId === wid && d.typeId === 'dt-a1')!
    const expiringBefore = selectDashboard(s).docsAttention
    s.updateDocument(doc.id, { expiresAt: addDays(TODAY, 700), number: 'PT/A1/2026/999999', note: 'Renovado' })
    const after = store.getState()
    expect(after.db.documents[doc.id]!.versions).toHaveLength(2)
    expect(selectConflicts(after).some((c) => c.id === conflict.id)).toBe(false)
    expect(selectDashboard(after).docsAttention).toBe(expiringBefore - 1)
  })
})
