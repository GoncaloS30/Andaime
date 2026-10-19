/**
 * Pré-requisitos idempotentes do guião (padrão "jump" do Mesa):
 * cada função garante um estado e pode ser chamada várias vezes sem duplicar nada.
 */
import { PHOTOS } from '@/data/seed/photoManifest'
import type { PhotoRef } from '@/domain/photos'
import { stayBoard } from '@/domain/stays'
import type { ID, Role } from '@/domain/types'
import { addDays, weekStart } from '@/domain/weeks'
import { selectConflicts } from '@/store/selectors'
import { demoStore } from '@/store/store'

const S = () => demoStore.getState()
export const DEMO_SITE_NAME = 'Armazém Maia Norte'
const ABSENCE_REASON = 'Pedido feito durante a apresentação'
const STAY_NOTE = 'Marcado durante a apresentação'
const DIARY_TITLE = 'Descofragem da laje do piso 3'
let docTargetCache: { seededAt: string; value: { workerId: ID; docId: ID } } | null = null

export const scenario = {
  today: () => S().session.today,
  nextMonday: () => addDays(weekStart(S().session.today), 7),
  persona: () => S().session.personas.trabalhador,

  role(role: Role) {
    if (S().session.role !== role) S().setRole(role)
  },

  online() {
    if (!S().session.online) S().setOnline(true)
  },

  todayEntry() {
    const wid = scenario.persona()
    return Object.values(S().db.entries).find((e) => e.workerId === wid && e.date === S().session.today)
  },

  clockIn() {
    scenario.online()
    if (S().session.outbox.length) void S().syncOutbox()
    if (!scenario.todayEntry()) S().clockIn('07:58')
  },

  /** Fim de dia simulado às 17:05 (para as horas terem significado a qualquer hora da apresentação). */
  clockOut() {
    scenario.clockIn()
    const e = scenario.todayEntry()
    if (e?.status === 'aberto') {
      if (e.breakMinutes === 0 && !e.breakStartedAt) {
        S().startBreak('12:00')
        S().endBreak('13:00')
      }
      S().clockOut('17:05')
    }
  },

  reviewed() {
    scenario.clockOut()
    const e = scenario.todayEntry()
    if (e?.status === 'submetido') {
      scenario.role('encarregado')
      S().reviewEntries([e.id])
    }
  },

  approved() {
    scenario.reviewed()
    const e = scenario.todayEntry()
    if (e?.status === 'revisto') {
      scenario.role('gestor')
      S().approveEntries([e.id])
    }
  },

  absenceRequest(): ID {
    const wid = scenario.persona()
    const existing = Object.values(S().db.absences).find((a) => a.workerId === wid && a.reason === ABSENCE_REASON)
    if (existing) return existing.id
    scenario.online()
    const mon = scenario.nextMonday()
    return S().requestAbsence({ type: 'ferias', start: mon, end: addDays(mon, 1), reason: ABSENCE_REASON })
  },

  absenceApproved(): ID {
    const id = scenario.absenceRequest()
    if (S().db.absences[id]?.status === 'pedido') {
      scenario.role('gestor')
      S().decideAbsence(id, 'aprovado', '')
    }
    return id
  },

  site(): ID {
    const found = Object.values(S().db.sites).find((s) => s.name === DEMO_SITE_NAME)
    if (found) return found.id
    const today = S().session.today
    return S().createSite({
      name: DEMO_SITE_NAME,
      newClient: { name: 'Maia Logística, Lda.', contactName: 'Rita Gomes', email: 'obras@maia-logistica.example', country: 'PT' },
      country: 'PT',
      city: 'Maia',
      address: 'Zona Industrial da Maia, lote 41, 4470-000 Maia',
      lat: 41.2357,
      lng: -8.62,
      hourLimit: 3500,
      startDate: today,
      endDate: addDays(today, 240),
      directorId: 'm1',
      description: 'Armazém logístico com 6 000 m². Criado durante a apresentação.',
      teamId: 't4',
      vehicleId: 'v10',
      planWeeks: 2,
      moveTeam: true,
    })
  },

  reserveBricklayer(): ID | undefined {
    return Object.values(S().db.workers).find((w) => !w.teamId && w.category === 'Pedreiro')?.id
  },

  schedule() {
    const wid = scenario.reserveBricklayer()
    if (!wid) return
    const mon = scenario.nextMonday()
    const done = Object.values(S().db.assignments).some((a) => a.workerId === wid && a.siteId === 's2' && a.date === mon)
    if (done) return
    S().createSchedule({ teamId: 't2', siteId: 's2', workerIds: [wid], dates: [mon, addDays(mon, 1), addDays(mon, 2)], start: '07:30', end: '16:30', vehicleId: null, foremanId: null, note: 'Reforço de cofragem — pilares do bloco B' })
  },

  transferWorker(): ID {
    return S().db.teams.t1?.memberIds[3] ?? Object.keys(S().db.workers)[0]!
  },

  transfer() {
    const wid = scenario.transferWorker()
    const mon = scenario.nextMonday()
    const done = Object.values(S().db.assignments).some((a) => a.workerId === wid && a.siteId === 's3' && a.date === mon)
    if (!done) S().transferWorker({ workerId: wid, siteId: 's3', from: mon, to: addDays(mon, 4), permanent: false })
  },

  /** Quem dorme fora esta semana: a persona da app, se estiver longe de casa (para se ver no telemóvel); senão, o primeiro. */
  stayTarget() {
    const rows = stayBoard(S().db, weekStart(S().session.today)).filter((r) => r.away === 'longe')
    return rows.find((r) => r.workerId === scenario.persona()) ?? rows[0]
  },

  /** Estadia marcada para essa pessoa, num hotel da obra (cria um se a obra ainda não tiver). */
  stay() {
    const row = scenario.stayTarget()
    if (!row || row.stay?.hotelId) return row
    scenario.role('gestor')
    const hotelId =
      row.hotels[0]?.id ??
      S().createHotel({ siteId: row.siteId, name: 'Hotel Tejo Nascente', address: 'Av. do Mar Vermelho 4, Lisboa', contact: '+351 210 000 314', notes: 'Pequeno-almoço às 6h30 para as equipas.' })
    S().markStay({ workerId: row.workerId, siteId: row.siteId, week: weekStart(S().session.today), hotelId, checkIn: row.proposed.checkIn, checkOut: row.proposed.checkOut, notes: STAY_NOTE })
    return row
  },

  /** Obra do encarregado da apresentação (onde escreve o diário). */
  foremanSite(): ID {
    const fid = S().session.personas.encarregado
    return Object.values(S().db.sites).find((x) => x.foremanId === fid && x.status === 'em_curso')?.id ?? 's1'
  },

  /** O registo de hoje no diário, escrito pelo encarregado com duas fotos. */
  diaryEntry(): ID {
    const siteId = scenario.foremanSite()
    const today = S().session.today
    const found = Object.values(S().db.diary).find((d) => d.siteId === siteId && d.date === today && d.title === DIARY_TITLE)
    if (found) return found.id
    const photos: PhotoRef[] = ['d04', 'd05']
      .map((id) => PHOTOS.diario.find((p) => p.id === id))
      .filter((p) => p !== undefined)
      .map((p, k) => ({ kind: 'banco', src: p.src, credit: p.credit, alt: `${DIARY_TITLE} — foto ${k + 1}`, w: p.w, h: p.h }))
    scenario.role('encarregado')
    return S().createDiaryEntry({ siteId, date: today, title: DIARY_TITLE, text: 'Laje descofrada sem fissuras visíveis. Escoramento mantém-se mais 7 dias.\nCofragem limpa e arrumada para o piso 4.', photos })
  },

  vehicleSwap() {
    const team = S().db.teams.t4
    if (team && team.vehicleId === 'v4') S().setTeamVehicle('t4', 'v10', S().session.today)
  },

  delivery() {
    const wid = scenario.persona()
    const today = S().session.today
    const done = Object.values(S().db.deliveries).some((d) => d.workerId === wid && d.itemId === 'eq-parka' && d.date === today)
    if (!done) S().recordDelivery({ workerId: wid, itemId: 'eq-parka', size: S().db.workers[wid]?.sizes.parka ?? 'L', qty: 1, date: today, note: 'Entregue durante a apresentação' })
  },

  /** O A1 que mais cedo deixa de servir (o conflito de documento plantado). */
  documentTarget(): { workerId: ID; docId: ID } | null {
    if (docTargetCache && docTargetCache.seededAt === S().session.seededAt && S().db.documents[docTargetCache.value.docId]) return docTargetCache.value
    const c = selectConflicts(S()).find((x) => x.type === 'documento' && x.id.endsWith(':dt-a1'))
    const workerId = c?.workerIds[0]
    const doc = Object.values(S().db.documents)
      .filter((d) => d.typeId === 'dt-a1' && (!workerId || d.ownerId === workerId))
      .sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'))[0]
    if (!doc) return null
    docTargetCache = { seededAt: S().session.seededAt, value: { workerId: doc.ownerId, docId: doc.id } }
    return docTargetCache.value
  },

  documentRenewed() {
    const t = scenario.documentTarget()
    if (!t) return
    const d = S().db.documents[t.docId]
    if (d && (d.expiresAt ?? '') < addDays(S().session.today, 365)) {
      scenario.role('gestor')
      S().updateDocument(t.docId, { expiresAt: addDays(S().session.today, 730), number: 'PT/A1/2026/481207', note: 'Renovado junto da Segurança Social' })
    }
  },
}
