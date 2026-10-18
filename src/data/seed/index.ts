import { entryHours } from '@/domain/hours'
import { fromMinutes, toMinutes } from '@/domain/hours'
import {
  CLOTHING_SIZES,
  GLOVE_SIZES,
  TROUSER_SIZES,
  BOOT_SIZES,
} from '@/domain/labels'
import {
  DEFAULT_SETTINGS,
  type Absence,
  type ActivityEvent,
  type Assignment,
  type DB,
  type Delivery,
  type DocumentRec,
  type EntryStatus,
  type ID,
  type ISODate,
  type Notification,
  type Site,
  type Team,
  type TimeEntry,
  type Vehicle,
  type Worker,
  type WorkerCategory,
} from '@/domain/types'
import { addDays, isWeekend, isoWeek, weekStart } from '@/domain/weeks'
import {
  COMPANY,
  DOC_TYPES,
  EQUIPMENT,
  FIRST_NAMES,
  FOREIGN,
  HOME_CITIES,
  MANAGERS,
  SITES,
  SIZE_FIELD,
  SURNAMES,
  TEAMS,
  VEHICLES,
} from './catalog'
import { seedDiary } from './diary'
import { assignSeedPhotos } from './photos'

export interface Personas {
  gestor: ID
  encarregado: ID
  trabalhador: ID
}

export interface SeedResult {
  db: DB
  personas: Personas
}

/** PRNG determinístico (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
  }
}

const MEMBER_CATEGORIES: WorkerCategory[] = [
  'Pedreiro', 'Carpinteiro de cofragem', 'Armador de ferro', 'Servente', 'Eletricista',
  'Pedreiro', 'Canalizador', 'Manobrador', 'Serralheiro', 'Servente', 'Carpinteiro de cofragem',
]

const WEEK_NOTES = [
  'Betonagem da laje do piso 3',
  'Montagem de cofragem nos pilares do bloco B',
  'Assentamento de alvenarias no piso 2',
  'Acabamentos nas instalações sanitárias',
  'Impermeabilização da cobertura',
  'Descofragem e limpeza de frente de obra',
]

export function createSeed({ today, seed = 20261015 }: { today: ISODate; seed?: number }): SeedResult {
  const r = rng(seed)
  const ws = weekStart(today)
  const nextWs = addDays(ws, 7)
  const counters: Record<string, number> = {}
  const id = (p: string) => `${p}-${String((counters[p] = (counters[p] ?? 0) + 1)).padStart(4, '0')}`
  const at = (d: ISODate, t = '09:00') => `${d}T${t}:00`

  // ── Gestores e clientes ──
  const managers = Object.fromEntries(MANAGERS.map((m) => [m.id, { ...m }]))
  const clients: DB['clients'] = {}
  SITES.forEach((s, i) => {
    const cid = `c${i + 1}`
    clients[cid] = {
      id: cid,
      name: s.client.name,
      nif: `${s.client.country === 'PT' ? '5' : 'FR'}${String(10000000 + i * 7919).slice(0, 8)}`,
      contactName: s.client.contact,
      email: `obras@cliente-${i + 1}.example`,
      country: s.client.country,
    }
  })

  // ── Trabalhadores ──
  const usedNames = new Set<string>()
  let foreignIdx = 0
  const makeName = (posted: boolean): { name: string; nationality: string } => {
    if (posted && foreignIdx < FOREIGN.length && r.chance(0.3)) {
      const f = FOREIGN[foreignIdx++]!
      usedNames.add(f.name)
      return f
    }
    for (;;) {
      const n = `${r.pick(FIRST_NAMES)} ${r.pick(SURNAMES)} ${r.pick(SURNAMES)}`
      const parts = n.split(' ')
      if (parts[1] === parts[2]) continue
      const short = `${parts[0]} ${parts[2]}`
      if (usedNames.has(short)) continue
      usedNames.add(short)
      return { name: short, nationality: 'Portuguesa' }
    }
  }

  const workers: Record<ID, Worker> = {}
  let number = 7100
  const newWorker = (category: WorkerCategory, teamId: ID | null, vehicleId: ID | null, posted: boolean): Worker => {
    const { name, nationality } = makeName(posted)
    const [first, last] = [name.split(' ')[0]!, name.split(' ').slice(-1)[0]!]
    const w: Worker = {
      id: id('w'),
      number: String((number += r.int(3, 17))),
      name,
      category,
      phone: `+351 910 000 ${String(r.int(100, 999))}`,
      email: `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@ribeira-alta.example',
      nationality,
      homeCity: r.pick(HOME_CITIES),
      hireDate: `${r.int(2012, 2025)}-${String(r.int(1, 12)).padStart(2, '0')}-${String(r.int(1, 28)).padStart(2, '0')}`,
      status: 'ativo',
      teamId,
      usualVehicleId: vehicleId,
      dailyHours: 8,
      hourlyCost: r.int(11, 17),
      sizes: {
        tshirt: r.pick(CLOTHING_SIZES.slice(1, 6)),
        sweat: r.pick(CLOTHING_SIZES.slice(1, 6)),
        parka: r.pick(CLOTHING_SIZES.slice(2, 6)),
        calcas: r.pick(TROUSER_SIZES.slice(1, 8)),
        botas: r.pick(BOOT_SIZES.slice(3, 11)),
        luvas: r.pick(GLOVE_SIZES.slice(1, 5)),
      },
    }
    workers[w.id] = w
    return w
  }

  const teams: Record<ID, Team> = {}
  const teamMembers: Record<ID, Worker[]> = {}
  let catIdx = 0
  for (const spec of TEAMS) {
    const leader = newWorker(spec.leader, spec.id, spec.vehicle, spec.posted)
    const members = [leader]
    for (let i = 1; i < spec.size; i++) {
      const cat: WorkerCategory =
        i === 1 && (spec.id === 't1' || spec.id === 't3') ? 'Chefe de equipa' : MEMBER_CATEGORIES[catIdx++ % MEMBER_CATEGORIES.length]!
      members.push(newWorker(cat, spec.id, spec.vehicle, spec.posted))
    }
    teamMembers[spec.id] = members
    teams[spec.id] = {
      id: spec.id,
      name: spec.name,
      color: spec.color,
      foremanId: leader.id,
      memberIds: members.map((m) => m.id),
      vehicleId: spec.vehicle,
      siteId: spec.site,
      history: [
        { at: at(addDays(ws, -60)), text: `Equipa constituída com ${members.length} elementos.` },
        { at: at(addDays(ws, -60), '09:05'), text: `${leader.name} definido como responsável.` },
      ],
    }
  }
  // Dois trabalhadores sem equipa: disponíveis para reforços
  const reserve1 = newWorker('Pedreiro', null, null, true)
  const reserve2 = newWorker('Servente', null, null, false)

  const tm = (t: string, i: number) => teamMembers[t]![i]!
  const personas: Personas = { gestor: 'm1', encarregado: tm('t1', 0).id, trabalhador: tm('t1', 2).id }

  // ── Viaturas ──
  const vehicles: Record<ID, Vehicle> = {}
  for (const v of VEHICLES) {
    const team = TEAMS.find((t) => t.vehicle === v.id)
    vehicles[v.id] = {
      id: v.id,
      plate: v.plate,
      make: v.make,
      model: v.model,
      seats: v.seats,
      status: v.status ?? 'operacional',
      km: v.km,
      insuranceUntil: addDays(today, r.int(60, 300)),
      inspectionUntil: addDays(today, r.int(45, 330)),
      maintenanceDue: addDays(today, r.int(20, 160)),
      teamId: team?.id ?? null,
      notes: v.notes ?? '',
    }
  }
  vehicles.v4!.inspectionUntil = addDays(today, -1) // inspeção caducada ontem
  vehicles.v7!.insuranceUntil = addDays(today, 16) // seguro a expirar
  vehicles.v2!.maintenanceDue = addDays(today, 9)

  // ── Obras ──
  const sites: Record<ID, Site> = {}
  SITES.forEach((s, i) => {
    const team = TEAMS.find((t) => t.site === s.id)
    const start = addDays(today, s.startOffsetDays)
    sites[s.id] = {
      id: s.id,
      code: s.code,
      name: s.name,
      clientId: `c${i + 1}`,
      country: s.country,
      city: s.city,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      timezone: s.timezone,
      status: s.planned ? 'planeada' : 'em_curso',
      startDate: start,
      endDate: addDays(start, s.durationDays),
      hourLimit: s.limit,
      baselineRealized: 0,
      baselineApproved: 0,
      directorId: s.director,
      foremanId: team ? teams[team.id]!.foremanId : null,
      color: s.color,
      description: s.description,
      erpOrder: String(41000200 + i * 37),
    }
  })

  // ── Ausências ──
  const absences: Record<ID, Absence> = {}
  const addAbsence = (p: Omit<Absence, 'id' | 'requestedAt' | 'decidedBy' | 'decidedAt' | 'decisionNote' | 'hours'> & { hours?: number; requestedOffset?: number }) => {
    const a: Absence = {
      id: id('ab'),
      hours: p.hours ?? null,
      requestedAt: at(addDays(today, p.requestedOffset ?? -20), '10:12'),
      decidedBy: p.status === 'pedido' ? null : 'Marta Albuquerque',
      decidedAt: p.status === 'pedido' ? null : at(addDays(today, (p.requestedOffset ?? -20) + 1), '11:40'),
      decisionNote: p.status === 'rejeitado' ? 'Período de pico na obra. Propor outra data.' : '',
      workerId: p.workerId,
      type: p.type,
      start: p.start,
      end: p.end,
      status: p.status,
      reason: p.reason,
    }
    absences[a.id] = a
    return a
  }
  const nextMon = nextWs
  // Plantado: férias aprovadas mas ainda escalado
  addAbsence({ workerId: tm('t3', 2).id, type: 'ferias', start: nextMon, end: addDays(nextMon, 2), status: 'aprovado', reason: 'Férias marcadas no plano anual' })
  // Plantado: formação do chefe de equipa de Paris na sexta seguinte
  addAbsence({ workerId: tm('t6', 0).id, type: 'formacao', start: addDays(nextMon, 4), end: addDays(nextMon, 4), status: 'aprovado', reason: 'Formação de coordenação de segurança' })
  // Baixa médica em curso (sem atribuições nesses dias)
  addAbsence({ workerId: tm('t2', 3).id, type: 'baixa', start: addDays(today, -3), end: addDays(today, 4), status: 'aprovado', reason: 'Baixa médica', requestedOffset: -3 })
  // Ausência parcial hoje (consulta)
  addAbsence({ workerId: tm('t4', 2).id, type: 'parcial', start: today, end: today, hours: 3, status: 'aprovado', reason: 'Consulta médica de manhã', requestedOffset: -6 })
  // Falta injustificada na semana passada
  addAbsence({ workerId: tm('t4', 3).id, type: 'falta_injustificada', start: addDays(ws, -6), end: addDays(ws, -6), status: 'aprovado', reason: 'Não compareceu nem avisou', requestedOffset: -6 })
  // Férias passadas dentro da janela
  addAbsence({ workerId: tm('t7', 2).id, type: 'ferias', start: addDays(ws, -14), end: addDays(ws, -10), status: 'aprovado', reason: 'Férias', requestedOffset: -40 })
  addAbsence({ workerId: tm('t1', 3).id, type: 'ferias', start: addDays(ws, -60), end: addDays(ws, -50), status: 'aprovado', reason: 'Férias de verão', requestedOffset: -90 })
  // Pedidos pendentes
  addAbsence({ workerId: tm('t5', 4).id, type: 'falta_justificada', start: addDays(nextMon, 3), end: addDays(nextMon, 3), status: 'pedido', reason: 'Renovação do cartão de residência', requestedOffset: -1 })
  addAbsence({ workerId: tm('t1', 4).id, type: 'ferias', start: addDays(nextMon, 21), end: addDays(nextMon, 25), status: 'pedido', reason: 'Casamento de familiar', requestedOffset: -2 })
  // Pedido recusado
  addAbsence({ workerId: tm('t7', 1).id, type: 'ferias', start: addDays(ws, -21), end: addDays(ws, -17), status: 'rejeitado', reason: 'Férias', requestedOffset: -35 })

  const absentOn = (wid: ID, d: ISODate) =>
    Object.values(absences).some(
      (a) => a.workerId === wid && a.status === 'aprovado' && a.type !== 'parcial' && a.start <= d && a.end >= d,
    )
  const plantedVacation = tm('t3', 2).id

  // ── Atribuições: 4 semanas passadas, a atual e a seguinte ──
  const assignments: Record<ID, Assignment> = {}
  const addAssignment = (p: Omit<Assignment, 'id' | 'note' | 'batchId' | 'isForeman'> & Partial<Pick<Assignment, 'note' | 'batchId' | 'isForeman'>>) => {
    const a: Assignment = { id: id('a'), note: '', batchId: null, isForeman: false, ...p }
    assignments[a.id] = a
    return a
  }
  const firstWeek = addDays(ws, -28)
  for (let wk = firstWeek; wk <= nextWs; wk = addDays(wk, 7)) {
    for (const spec of TEAMS) {
      const team = teams[spec.id]!
      const note = WEEK_NOTES[(isoWeek(wk) + TEAMS.indexOf(spec)) % WEEK_NOTES.length]!
      for (let i = 0; i < 5; i++) {
        const d = addDays(wk, i)
        for (const m of teamMembers[spec.id]!) {
          if (absentOn(m.id, d) && m.id !== plantedVacation) continue
          const partialToday = d === today && m.id === tm('t4', 2).id
          addAssignment({
            workerId: m.id,
            siteId: spec.site,
            date: d,
            hours: partialToday ? 5 : 8,
            start: partialToday ? '12:00' : '08:00',
            end: '17:00',
            teamId: spec.id,
            vehicleId: spec.vehicle,
            isForeman: m.id === team.foremanId,
            note: i === 0 && m.id === team.foremanId ? note : '',
            batchId: `escala-${spec.id}-${wk}`,
          })
        }
      }
    }
  }
  // Sábado de recuperação em Munique na próxima semana
  for (const m of teamMembers.t8!) {
    addAssignment({
      workerId: m.id, siteId: 's8', date: addDays(nextMon, 5), hours: 6, start: '08:00', end: '14:00',
      teamId: 't8', vehicleId: 'v8', isForeman: m.id === teams.t8!.foremanId, note: 'Recuperação de atraso — fachada norte', batchId: `escala-t8-${nextWs}-sab`,
    })
  }
  // Plantado: sobreposição — elemento da Cofragem Norte também escalado no Douro na terça seguinte
  addAssignment({ workerId: tm('t2', 1).id, siteId: 's3', date: addDays(nextMon, 1), hours: 8, start: '08:00', end: '17:00', teamId: null, vehicleId: null, note: 'Reforço pedido pelo encarregado do Douro' })
  // Plantado: dupla reserva — dois elementos do Douro levam a Trafic da Cofragem Norte na quinta seguinte
  for (const a of Object.values(assignments)) {
    if (a.teamId === 't3' && a.date === addDays(nextMon, 3) && (a.workerId === tm('t3', 0).id || a.workerId === tm('t3', 1).id)) {
      a.vehicleId = 'v2'
    }
  }
  // Plantado: lotação — reforço na Atlântida na quinta seguinte, na mesma viatura
  addAssignment({ workerId: reserve1.id, siteId: 's1', date: addDays(nextMon, 3), hours: 8, start: '08:00', end: '17:00', teamId: 't1', vehicleId: 'v1', note: 'Reforço para betonagem' })

  // ── Registos de horas ──
  const entries: Record<ID, TimeEntry> = {}
  const lastWs = addDays(ws, -7)
  const rejectTargets = new Set([tm('t3', 3).id, tm('t5', 1).id])
  const rejected = new Set<ID>()
  let correctionDone = false
  // Um registo por trabalhador e dia (índice em vez de procurar em todos os registos: evita O(n²)).
  const entryKeys = new Set<string>()
  const leaderName = (wid: ID) => {
    const t = teams[workers[wid]!.teamId ?? '']
    return t ? workers[t.foremanId!]!.name : 'Encarregado'
  }
  for (const a of Object.values(assignments).sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id))) {
    if (a.date > today || (a.date === today && isWeekend(today))) continue
    if (a.workerId === personas.trabalhador && a.date === today) continue
    if (absentOn(a.workerId, a.date)) continue
    if (a.teamId === null && a.siteId === 's3') continue // sobreposição futura
    if (entryKeys.has(`${a.workerId}|${a.date}`)) continue

    const inMin = toMinutes(a.start) + r.int(-12, 10)
    let status: EntryStatus
    let clockOut: string | null
    let source: TimeEntry['source'] = r.chance(0.1) ? 'encarregado' : r.chance(0.05) ? 'manual' : 'ponto'
    if (a.date === today) {
      if (r.chance(0.12)) continue // ainda não chegou
      status = 'aberto'
      clockOut = null
      source = 'ponto'
    } else {
      const overtime = r.chance(0.16) ? r.pick([60, 90, 120]) : 0
      clockOut = fromMinutes(toMinutes(a.end) + r.int(-5, 12) + overtime)
      if (a.date < lastWs) status = 'aprovado'
      else if (a.date < ws) status = r.chance(0.72) ? 'revisto' : 'aprovado'
      else status = r.chance(0.85) ? 'submetido' : 'revisto'
    }
    const e: TimeEntry = {
      id: id('e'),
      workerId: a.workerId,
      siteId: a.siteId,
      date: a.date,
      clockIn: fromMinutes(inMin),
      clockOut,
      breakMinutes: a.hours > 6 ? 60 : 0,
      breakStartedAt: null,
      source,
      status,
      corrections: [],
      rejectionReason: null,
      reviewedBy: status === 'revisto' || status === 'aprovado' ? leaderName(a.workerId) : null,
      approvedBy: status === 'aprovado' ? 'Marta Albuquerque' : null,
      note: '',
    }
    if (a.date >= lastWs && a.date < ws && rejectTargets.has(a.workerId) && !rejected.has(a.workerId) && clockOut) {
      rejected.add(a.workerId)
      e.status = 'rejeitado'
      e.clockOut = fromMinutes(toMinutes(a.end) + 150)
      e.approvedBy = null
      e.rejectionReason = 'Saída registada às ' + e.clockOut + ' sem justificação para as horas extra. Corrigir ou justificar.'
    }
    if (!correctionDone && a.date >= lastWs && a.date < ws && e.status === 'revisto') {
      correctionDone = true
      e.corrections.push({
        at: at(addDays(a.date, 1), '08:40'),
        by: leaderName(a.workerId),
        reason: 'Esqueceu-se de registar a saída; confirmado em obra.',
        before: 'Saída: sem registo',
        after: `Saída: ${e.clockOut}`,
      })
      e.source = 'encarregado'
    }
    entries[e.id] = e
    entryKeys.add(`${e.workerId}|${e.date}`)
  }

  // ── Histórico anterior para atingir o consumo alvo de cada obra ──
  for (const spec of SITES) {
    const s = sites[spec.id]!
    if (spec.planned) continue
    let realized = 0
    let approved = 0
    for (const e of Object.values(entries)) {
      if (e.siteId !== s.id || e.status === 'aberto' || e.status === 'rejeitado') continue
      const h = entryHours(e, DEFAULT_SETTINGS).worked
      realized += h
      if (e.status === 'aprovado') approved += h
    }
    s.baselineRealized = Math.max(0, Math.round(spec.target * spec.limit - realized))
    s.baselineApproved = s.baselineRealized
    void approved
  }

  // ── Documentos ──
  const docTypes = Object.fromEntries(DOC_TYPES.map((t) => [t.id, { ...t, mandatory: t.mandatory ?? true }]))
  const documents: Record<ID, DocumentRec> = {}
  const docNumber: Record<string, () => string> = {
    'dt-med': () => `MT-${r.int(100000, 999999)}`,
    'dt-sst': () => `SST-${r.int(1000, 9999)}/${r.int(2023, 2026)}`,
    'dt-a1': () => `PT/A1/${r.int(2025, 2026)}/${r.int(100000, 999999)}`,
    'dt-btp': () => `BTP ${r.int(10, 99)} ${r.int(100, 999)} ${r.int(100, 999)}`,
    'dt-limosa': () => `L-${r.int(1000000, 9999999)}`,
    'dt-meldung': () => `ZOLL-${r.int(100000, 999999)}`,
    'dt-cc': () => `${r.int(10000000, 19999999)} ${r.int(0, 9)} ZZ${r.int(1, 9)}`,
    'dt-pss': () => `PSS-${r.int(100, 999)}`,
    'dt-sipsi': () => `SIPSI-${r.int(1000000, 9999999)}`,
    'dt-alvara': () => `ALV-${r.int(10000, 99999)}-PUB`,
    'dt-seguro': () => `AP ${r.int(1000000, 9999999)}`,
  }
  const addDoc = (typeId: string, ownerType: DocumentRec['ownerType'], ownerId: ID, expiresAt: ISODate | null, extra: Partial<DocumentRec> = {}) => {
    const t = docTypes[typeId]!
    const issuedAt = expiresAt && t.validityMonths ? addDays(expiresAt, -Math.round(t.validityMonths * 30.4)) : addDays(today, -r.int(60, 400))
    const d: DocumentRec = {
      id: id('d'),
      typeId,
      ownerType,
      ownerId,
      number: docNumber[typeId]!(),
      issuedAt: issuedAt > today ? addDays(today, -30) : issuedAt,
      expiresAt,
      verification: 'verificado',
      fileName: `${t.short.replace(/\s+/g, '_')}_${ownerId}.pdf`,
      versions: [],
      ...extra,
    }
    d.versions = [{ version: 1, at: at(d.issuedAt, '14:20'), by: 'Marta Albuquerque', expiresAt, note: 'Registo inicial' }]
    documents[d.id] = d
    return d
  }
  const far = () => addDays(today, r.int(45, 340))
  const allWorkers = Object.values(workers)
  const expiringSoon = new Set([tm('t1', 5).id, tm('t3', 4).id, tm('t4', 1).id])
  for (const w of allWorkers) {
    addDoc('dt-med', 'trabalhador', w.id, w.id === reserve2.id ? addDays(today, -9) : expiringSoon.has(w.id) ? addDays(today, r.int(18, 28)) : far())
    addDoc('dt-sst', 'trabalhador', w.id, far())
    addDoc('dt-cc', 'trabalhador', w.id, addDays(today, r.int(200, 2400)))
  }
  for (const spec of TEAMS.filter((t) => t.posted)) {
    for (const m of teamMembers[spec.id]!) {
      const country = sites[spec.site]!.country
      const isA1Planted = m.id === tm('t5', 3).id
      addDoc('dt-a1', 'trabalhador', m.id, isA1Planted ? addDays(nextWs, -1) : m.id === tm('t7', 3).id ? addDays(today, 24) : far(), m.id === tm('t7', 2).id ? { verification: 'por_verificar' } : {})
      if (country === 'FR') addDoc('dt-btp', 'trabalhador', m.id, far())
      if (country === 'BE') addDoc('dt-limosa', 'trabalhador', m.id, far())
      if (country === 'DE' && m.id !== tm('t8', 2).id) addDoc('dt-meldung', 'trabalhador', m.id, far())
    }
  }
  // Reserva destacável (substituto para França)
  addDoc('dt-a1', 'trabalhador', reserve1.id, far())
  addDoc('dt-btp', 'trabalhador', reserve1.id, far())
  for (const s of Object.values(sites)) {
    if (s.status === 'planeada') continue
    addDoc('dt-pss', 'obra', s.id, null)
    if (s.country === 'FR') addDoc('dt-sipsi', 'obra', s.id, s.id === 's6' ? addDays(today, 22) : far())
  }
  addDoc('dt-alvara', 'empresa', 'empresa', addDays(today, 120))
  addDoc('dt-seguro', 'empresa', 'empresa', addDays(today, 75))

  // ── Equipamento e entregas ──
  const equipment = Object.fromEntries(EQUIPMENT.map((e) => [e.id, { id: e.id, name: e.name, kind: e.kind, sizeKind: e.sizeKind, stock: e.stock, serial: e.serial ?? '' }]))
  const deliveries: Record<ID, Delivery> = {}
  const deliver = (w: Worker, itemId: ID, date: ISODate, p: Partial<Delivery> = {}) => {
    const item = equipment[itemId]!
    const size = item.sizeKind ? (w.sizes[SIZE_FIELD[item.sizeKind]] ?? '') : ''
    const d: Delivery = { id: id('dl'), workerId: w.id, itemId, size, qty: itemId === 'eq-tshirt' ? 2 : 1, date, status: 'entregue', returnedAt: null, by: 'Armazém central', note: '', ...p }
    deliveries[d.id] = d
    return d
  }
  for (const w of allWorkers) {
    const kitDate = w.hireDate < '2025-01-01' ? addDays(today, -r.int(150, 420)) : w.hireDate
    for (const e of EQUIPMENT.filter((x) => x.kit)) deliver(w, e.id, kitDate)
    if (r.chance(0.5)) deliver(w, 'eq-parka', addDays(today, -r.int(20, 60)))
  }
  for (const spec of TEAMS) {
    const leader = teamMembers[spec.id]![0]!
    deliver(leader, 'eq-berbequim', addDays(today, -r.int(60, 300)), { note: `N.º série AP-18V-0${r.int(10, 99)}` })
  }
  deliver(tm('t1', 0), 'eq-laser', addDays(today, -40), { note: 'N.º série NL-R2-004' })
  deliver(tm('t2', 2), 'eq-rebarbadora', addDays(today, -90), { status: 'danificado', note: 'Disco de proteção partido' })
  deliver(tm('t3', 3), 'eq-arnes', addDays(today, -120), { status: 'devolvido', returnedAt: addDays(today, -30) })
  deliver(tm('t5', 2), 'eq-oculos', addDays(today, -70), { status: 'perdido', note: 'Perdidos em obra' })
  deliver(tm('t6', 3), 'eq-arnes', addDays(today, -25))

  // ── Ocorrências, notas, atividade e notificações ──
  const issues: DB['issues'] = {}
  const i1 = id('oc')
  issues[i1] = { id: i1, siteId: 's2', reportedBy: tm('t2', 0).name, at: at(addDays(today, -1), '16:05'), category: 'material', text: 'A cofragem metálica para os pilares do bloco B ainda não chegou. Sem ela paramos na sexta.', status: 'aberto' }
  const i2 = id('oc')
  issues[i2] = { id: i2, siteId: 's3', reportedBy: tm('t3', 0).name, at: at(addDays(today, -3), '11:30'), category: 'seguranca', text: 'Guarda-corpos do piso 4 retirados por outra empresa. Reposto ao fim da manhã.', status: 'resolvido' }

  const weekNotes: DB['weekNotes'] = {
    [ws]: { weekStart: ws, text: 'Inspeção de segurança na Atlântida na quarta-feira às 10:00. Confirmar EPI completos em todas as equipas.' },
  }

  const activity: ActivityEvent[] = []
  const log = (dateTime: string, actor: string, role: ActivityEvent['role'], kind: string, text: string, refs: ActivityEvent['refs'] = {}) =>
    activity.push({ id: id('ev'), at: dateTime, actor, role, kind, text, refs })
  log(at(addDays(ws, -3), '17:42'), 'Marta Albuquerque', 'gestor', 'horas', `Aprovou os registos de horas da semana ${isoWeek(addDays(ws, -14))}.`)
  log(at(addDays(ws, -3), '18:05'), 'Henrique Saldanha', 'gestor', 'planeamento', `Publicou a escala da semana ${isoWeek(ws)}.`)
  log(at(addDays(ws, -1), '19:20'), tm('t3', 0).name, 'encarregado', 'horas', 'Reviu os registos da equipa Acabamentos Douro.', { teamId: 't3' })
  log(at(addDays(today, -6), '10:15'), 'Marta Albuquerque', 'gestor', 'viaturas', 'RV-96-GU entrou na oficina (embraiagem).', { vehicleId: 'v11' })
  log(at(addDays(today, -3), '11:30'), tm('t3', 0).name, 'encarregado', 'ocorrencia', 'Reportou e resolveu: guarda-corpos do piso 4.', { siteId: 's3' })
  log(at(addDays(today, -3), '15:02'), 'Sistema', 'sistema', 'ausencias', `Baixa médica registada para ${tm('t2', 3).name}.`, { workerId: tm('t2', 3).id })
  log(at(addDays(today, -2), '09:48'), 'Henrique Saldanha', 'gestor', 'planeamento', `Planeou a semana ${isoWeek(nextWs)} para 8 equipas.`)
  log(at(addDays(today, -2), '10:31'), tm('t1', 4).name, 'trabalhador', 'ausencias', 'Pediu férias para novembro.', { workerId: tm('t1', 4).id })
  log(at(addDays(today, -1), '16:05'), tm('t2', 0).name, 'encarregado', 'ocorrencia', 'Reportou atraso na entrega de cofragem metálica.', { siteId: 's2' })
  log(at(addDays(today, -1), '17:20'), 'Marta Albuquerque', 'gestor', 'documentos', `Validou o A1 de ${tm('t7', 0).name}.`, { workerId: tm('t7', 0).id })
  log(at(addDays(today, -1), '18:44'), tm('t5', 4).name, 'trabalhador', 'ausencias', 'Pediu uma falta justificada.', { workerId: tm('t5', 4).id })
  log(at(today, '07:58'), 'Sistema', 'sistema', 'horas', 'Primeiras entradas do dia registadas por ponto.')
  activity.sort((a, b) => b.at.localeCompare(a.at))

  const notifications: Notification[] = []
  const notify = (role: Notification['role'], personaId: ID | null, title: string, body: string, link: string | null, offsetDays: number, time: string, read = false) =>
    notifications.push({ id: id('nt'), at: at(addDays(today, offsetDays), time), role, personaId, title, body, link, read })
  notify('gestor', null, 'Registos por aprovar', 'Os encarregados reviram as horas da semana passada.', '/horas?estado=revisto', 0, '07:30')
  notify('gestor', null, 'Dois pedidos de ausência', 'Há pedidos à espera de decisão.', '/ausencias?estado=pedido', -1, '18:45')
  notify('gestor', null, 'Inspeção caducada', 'FR-19-AK (equipa Algarve) tem a inspeção caducada.', '/viaturas/v4', 0, '07:00')
  notify('gestor', null, 'Documentos a expirar', 'Há documentos que expiram nos próximos 30 dias.', '/documentos?estado=a_expirar', -2, '08:00', true)
  notify('encarregado', personas.encarregado, 'Registos por rever', 'A tua equipa tem registos de horas por rever.', '/encarregado/horas', 0, '07:35')
  notify('encarregado', personas.encarregado, 'Escala publicada', `A escala da semana ${isoWeek(nextWs)} está disponível.`, '/encarregado', -2, '09:50', true)
  notify('trabalhador', personas.trabalhador, 'Escala da próxima semana', `Semana ${isoWeek(nextWs)}: Edifício Atlântida, 08:00–17:00.`, '/app/semana', -2, '09:50')
  notify('trabalhador', personas.trabalhador, 'Lembrete', 'Não te esqueças de registar a entrada quando chegares à obra.', '/app', 0, '07:00')

  const db: DB = {
    company: { ...COMPANY },
    managers,
    clients,
    sites,
    workers,
    teams,
    vehicles,
    assignments,
    entries,
    absences,
    docTypes,
    documents,
    equipment,
    deliveries,
    issues,
    weekNotes,
    diary: {},
    activity,
    notifications,
  }
  assignSeedPhotos(db)
  db.diary = seedDiary(db, today)
  return { db, personas }
}
