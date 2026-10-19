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

describe('Fluxo 15 — fotos', () => {
  it('alterar a foto de um trabalhador regista histórico e pode anular-se', () => {
    const store = make()
    const st = () => store.getState()
    const w = Object.values(st().db.workers)[0]!
    const before = w.photo
    st().setPhoto({ type: 'trabalhador', id: w.id }, { kind: 'carregada', id: 'ph-1', alt: `Retrato de ${w.name}`, w: 800, h: 800 })
    expect(st().db.workers[w.id]!.photo).toMatchObject({ kind: 'carregada', id: 'ph-1' })
    expect(st().db.activity[0]).toMatchObject({ kind: 'foto', refs: { workerId: w.id } })
    st().undo()
    expect(st().db.workers[w.id]!.photo).toEqual(before)
  })
  it('remover a foto de uma obra deixa a obra sem foto', () => {
    const store = make()
    store.getState().setPhoto({ type: 'obra', id: 's1' }, null)
    expect(store.getState().db.sites.s1!.photo).toBeUndefined()
  })
  it('recusa um registo que não existe', () => {
    const store = make()
    expect(() => store.getState().setPhoto({ type: 'viatura', id: 'nao-existe' }, null)).toThrow('Registo não encontrado')
  })
})

describe('Fluxo 11 — diário de obra', () => {
  it('o encarregado regista o dia com fotos; o gestor é notificado e pode anular', () => {
    const store = make()
    const st = () => store.getState()
    st().setRole('encarregado')
    const foreman = st().db.workers[st().session.personas.encarregado]!
    const site = Object.values(st().db.sites).find((s) => s.foremanId === foreman.id) ?? Object.values(st().db.sites)[0]!
    const before = Object.keys(st().db.diary).length
    const photos = [1, 2].map((i) => ({ kind: 'carregada' as const, id: `ph-${i}`, alt: `Foto ${i}`, w: 1600, h: 1200 }))
    const id = st().createDiaryEntry({ siteId: site.id, date: TODAY, title: 'Betonagem do piso 3', text: 'Correu bem.', photos })
    const e = st().db.diary[id]!
    expect(e).toMatchObject({ siteId: site.id, authorId: foreman.id, authorRole: 'encarregado', title: 'Betonagem do piso 3' })
    expect(e.photos).toHaveLength(2)
    expect(st().db.activity[0]).toMatchObject({ kind: 'diario', refs: { siteId: site.id } })
    expect(st().db.notifications.some((n) => n.role === 'gestor' && n.body.includes('Betonagem do piso 3'))).toBe(true)
    st().undo()
    expect(Object.keys(st().db.diary)).toHaveLength(before)
  })
  it('recusa título vazio e mais de 20 fotos', () => {
    const store = make()
    const st = () => store.getState()
    expect(() => st().createDiaryEntry({ siteId: 's1', date: TODAY, title: ' ', text: '', photos: [] })).toThrow('título')
    const many = Array.from({ length: 21 }, (_, i) => ({ kind: 'carregada' as const, id: `p${i}`, alt: '', w: 1, h: 1 }))
    expect(() => st().createDiaryEntry({ siteId: 's1', date: TODAY, title: 'X', text: '', photos: many })).toThrow('20 fotos')
  })
  it('editar e apagar', () => {
    const store = make()
    const st = () => store.getState()
    const id = st().createDiaryEntry({ siteId: 's1', date: TODAY, title: 'A', text: '', photos: [] })
    st().updateDiaryEntry(id, { title: 'B', text: 'Mais texto' })
    expect(st().db.diary[id]).toMatchObject({ title: 'B', text: 'Mais texto' })
    st().removeDiaryEntry(id)
    expect(st().db.diary[id]).toBeUndefined()
  })
  it('o seed tem diário nas obras em curso', () => {
    const store = make()
    const sites = new Set(Object.values(store.getState().db.diary).map((e) => e.siteId))
    expect(sites.size).toBeGreaterThan(3)
  })
})

describe('Fluxo 10 — dormidas e hotéis', () => {
  it('marca o hotel para quem está escalado longe; o trabalhador é notificado; tirar o hotel deixa a estadia por definir', () => {
    const store = make()
    const st = () => store.getState()
    const hotelId = st().createHotel({ siteId: 's8', name: 'Hotel Isartor', address: 'Isartorplatz 3, München', contact: '+49 89 000 000', notes: '' })
    expect(() => st().createHotel({ siteId: 's8', name: 'hotel isartor', address: '', contact: '', notes: '' })).toThrow('Já existe')
    const wid = Object.values(st().db.assignments).find((a) => a.siteId === 's8' && a.date >= WS)!.workerId
    const id = st().markStay({ workerId: wid, siteId: 's8', week: WS, hotelId, checkIn: WS, checkOut: addDays(WS, 4), notes: '' })
    expect(st().db.stays[id]).toMatchObject({ hotelId, workerId: wid })
    expect(st().db.notifications.some((n) => n.role === 'trabalhador' && n.personaId === wid && n.body.includes('Hotel Isartor'))).toBe(true)
    // Marcar de novo a mesma pessoa, semana e obra atualiza em vez de duplicar
    const again = st().markStay({ workerId: wid, siteId: 's8', week: WS, hotelId, checkIn: addDays(WS, 1), checkOut: addDays(WS, 4), notes: 'Chega na terça' })
    expect(again).toBe(id)
    expect(Object.values(st().db.stays).filter((s) => s.workerId === wid && s.week === WS && s.siteId === 's8')).toHaveLength(1)
    st().removeHotel(hotelId)
    expect(st().db.stays[id]!.hotelId).toBeNull()
    expect(() => st().markStay({ workerId: wid, siteId: 's8', week: WS, hotelId: null, checkIn: WS, checkOut: WS, notes: '' })).toThrow('saída')
  })
  it('o seed tem hotéis nas obras longe e estadias nesta semana, uma por definir', () => {
    const store = make()
    const { db } = store.getState()
    expect(Object.values(db.hotels).length).toBeGreaterThanOrEqual(5)
    const week = Object.values(db.stays).filter((s) => s.week === WS)
    expect(week.length).toBeGreaterThan(3)
    expect(week.some((s) => s.hotelId === null)).toBe(true)
  })
})

describe('Fluxo 12 — férias no mapa do ano, na agenda e no Google (simulado)', () => {
  it('férias aprovadas aparecem no mapa do ano e na agenda; sincronizar duas vezes não duplica', async () => {
    const { yearMap } = await import('@/domain/vacationMap')
    const { agendaItems } = await import('@/domain/agenda')
    const store = make()
    const st = () => store.getState()
    const wid = st().session.personas.trabalhador
    const id = st().createAbsence({ workerId: wid, type: 'ferias', start: '2026-11-02', end: '2026-11-06', hours: null, reason: 'Férias de outono' })
    st().decideAbsence(id, 'aprovado', '')
    const row = yearMap(st().db, 2026).find((r) => r.worker.id === wid)!
    expect(row.periods.some((p) => p.id === id)).toBe(true)
    expect(row.vacationDays).toBeGreaterThanOrEqual(5)
    const items = agendaItems(st().db, '2026-11-01', '2026-11-30', { ausencias: true, obras: false, validades: false, eventos: false, google: false })
    expect(items.some((i) => i.id === `aus-${id}`)).toBe(true)

    expect(() => st().syncVacationsToGoogle()).toThrow('Ligue')
    st().connectGoogle(true)
    const first = st().syncVacationsToGoogle()
    expect(first.created).toBeGreaterThan(0)
    const second = st().syncVacationsToGoogle()
    expect(second).toMatchObject({ created: 0, existing: first.created + first.existing })
    expect(Object.values(st().db.events).filter((e) => e.syncKey === `ferias:${id}`)).toHaveLength(1)
    st().connectGoogle(false)
    expect(Object.values(st().db.events).some((e) => e.source === 'google')).toBe(false)
  })
  it('eventos próprios: criar e apagar', () => {
    const store = make()
    const st = () => store.getState()
    const id = st().createEvent({ title: 'Visita da fiscalização', date: '2026-10-22', endDate: '2026-10-22', time: '10:30', location: 'OB-24-031' })
    expect(st().db.events[id]).toMatchObject({ source: 'andaime', time: '10:30' })
    expect(() => st().createEvent({ title: ' ', date: '2026-10-22', endDate: '2026-10-22', time: null, location: '' })).toThrow('título')
    st().removeEvent(id)
    expect(st().db.events[id]).toBeUndefined()
  })
  it('licença e outra ausência são tipos válidos', () => {
    const store = make()
    const id = store.getState().createAbsence({ workerId: store.getState().session.personas.trabalhador, type: 'licenca', start: '2026-11-10', end: '2026-11-10', hours: null, reason: 'Casamento' })
    expect(store.getState().db.absences[id]!.type).toBe('licenca')
  })
})

describe('Fluxo 14 — grelha de horas da semana', () => {
  it('pôr 10 h numa célula ajusta o registo, calcula 2 h extra, guarda a correção e sobe as Realizadas da obra', async () => {
    const { entryHours } = await import('@/domain/hours')
    const store = make()
    const st = () => store.getState()
    const e = Object.values(st().db.entries).find((x) => x.date < TODAY && x.status === 'submetido' && x.clockOut)!
    const before = selectSiteMetrics(st(), e.siteId).realized
    const hBefore = entryHours(e, st().session.settings).worked
    st().setDayHours({ workerId: e.workerId, date: e.date, siteId: e.siteId, hours: 10, reason: 'Ficou até mais tarde na betonagem' })
    const after = st().db.entries[e.id]!
    expect(entryHours(after, st().session.settings)).toMatchObject({ worked: 10, extra: 2 })
    expect(after.corrections.at(-1)!.reason).toBe('Ficou até mais tarde na betonagem')
    expect(selectSiteMetrics(st(), e.siteId).realized).toBeCloseTo(before + (10 - hBefore), 1)
    expect(() => st().setDayHours({ workerId: e.workerId, date: e.date, siteId: e.siteId, hours: 9, reason: ' ' })).toThrow('motivo')
  })
  it('numa célula vazia cria o registo; registos aprovados não se mexem', () => {
    const store = make()
    const st = () => store.getState()
    const wid = st().session.personas.trabalhador
    const day = addDays(WS, -3) // sexta da semana anterior? qualquer dia sem registo
    for (const x of Object.values(st().db.entries)) if (x.workerId === wid && x.date === day) delete st().db.entries[x.id]
    st().setDayHours({ workerId: wid, date: day, siteId: 's1', hours: 6, reason: 'Esqueceu-se de picar o ponto' })
    const created = Object.values(st().db.entries).find((x) => x.workerId === wid && x.date === day)!
    expect(created).toMatchObject({ source: 'encarregado', siteId: 's1' })
    const approved = Object.values(st().db.entries).find((x) => x.status === 'aprovado')!
    expect(() => st().setDayHours({ workerId: approved.workerId, date: approved.date, siteId: approved.siteId, hours: 9, reason: 'x' })).toThrow('aprovado')
  })
})

describe('Fluxo 13 — livro de horas do RH (OneDrive simulado)', () => {
  it('atualizar o livro do mês regista a data; repetir não muda o conteúdo', async () => {
    const { hrBookSheets } = await import('@/domain/hrBook')
    const store = make()
    const st = () => store.getState()
    expect(() => st().syncHrBook('2026-10')).toThrow('Ligue')
    st().connectOneDrive(true)
    const r1 = st().syncHrBook('2026-10')
    expect(r1.sheets).toBeGreaterThan(5)
    expect(st().db.integrations.onedrive.books['2026-10']).toBeTruthy()
    const before = JSON.stringify(hrBookSheets(st().db, st().session.settings, '2026-10'))
    const r2 = st().syncHrBook('2026-10')
    expect(r2).toMatchObject({ sheets: r1.sheets, rows: r1.rows })
    expect(JSON.stringify(hrBookSheets(st().db, st().session.settings, '2026-10'))).toBe(before)
  })
})

describe('Bloco 6 — catálogo de EPI e cópia da demonstração', () => {
  it('acrescenta um artigo novo e reaproveita um que já existe com outro nome escrito', () => {
    const store = make()
    const r = store.getState().addEquipmentItem({ name: 'Joelheiras de gel', kind: 'epi', sizeKind: null, stock: 4 })
    expect(r.existed).toBe(false)
    expect(store.getState().db.equipment[r.id]?.stock).toBe(4)
    const again = store.getState().addEquipmentItem({ name: '  JOELHEIRAS de gél', kind: 'epi', sizeKind: null, stock: 9 })
    expect(again).toEqual({ id: r.id, existed: true })
    expect(Object.values(store.getState().db.equipment).filter((i) => i.name === 'Joelheiras de gel')).toHaveLength(1)
  })

  it('recusa um artigo sem nome', () => {
    expect(() => make().getState().addEquipmentItem({ name: '  ', kind: 'epi', sizeKind: null, stock: 1 })).toThrow('Indique o nome do artigo')
  })

  it('importa uma cópia: substitui os dados, mantém o papel e limpa o anular', () => {
    const a = make()
    a.getState().addEquipmentItem({ name: 'Joelheiras de gel', kind: 'epi', sizeKind: null, stock: 4 })
    const copy = { db: a.getState().db, session: a.getState().session }
    const b = make()
    b.getState().setRole('encarregado')
    b.getState().createEvent({ title: 'X', date: TODAY, endDate: TODAY, time: null, location: '' })
    b.getState().importDemo(copy)
    expect(Object.values(b.getState().db.equipment).some((i) => i.name === 'Joelheiras de gel')).toBe(true)
    expect(b.getState().session.role).toBe('encarregado')
    expect(b.getState().undoStack).toHaveLength(0)
  })
})
