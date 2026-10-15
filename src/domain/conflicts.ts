import { availability } from './availability'
import { requiredWorkerDocTypes, latestDoc, docProblemOn } from './documents'
import { formatHours, toMinutes } from './hours'
import { absenceOn, buildIndex, key, type DBIndex } from './indexes'
import { ABSENCE_TYPE, COUNTRY_NAME, LEADER_CATEGORIES } from './labels'
import { siteMetrics } from './siteMetrics'
import type { Assignment, DB, ID, ISODate, Settings, Site, Vehicle, Worker } from './types'
import { dateShort, dayShort } from './weeks'

export type ConflictType =
  | 'sobreposicao'
  | 'ausencia'
  | 'documento'
  | 'viatura_dupla'
  | 'viatura_indisponivel'
  | 'lotacao'
  | 'sem_encarregado'
  | 'limite'
  | 'inativo'

export type FixAction =
  | { kind: 'remove_assignment'; assignmentIds: ID[] }
  | { kind: 'reduce_hours'; assignmentId: ID; hours: number }
  | { kind: 'replace_worker'; assignmentIds: ID[]; workerId: ID }
  | { kind: 'swap_vehicle'; assignmentIds: ID[]; vehicleId: ID | null }
  | { kind: 'set_foreman'; assignmentId: ID }
  | { kind: 'assign_worker'; siteId: ID; date: ISODate; workerId: ID; isForeman: boolean }
  | { kind: 'raise_limit'; siteId: ID; limit: number }
  | { kind: 'open_document'; workerId: ID; typeId: ID }
  | { kind: 'open_site'; siteId: ID }

export interface Fix {
  id: string
  label: string
  detail?: string
  action: FixAction
}

export interface Conflict {
  id: string
  type: ConflictType
  severity: 'critico' | 'aviso'
  date: ISODate | null
  title: string
  explanation: string
  workerIds: ID[]
  siteIds: ID[]
  vehicleIds: ID[]
  assignmentIds: ID[]
  fixes: Fix[]
}

export const CONFLICT_LABEL: Record<ConflictType, string> = {
  sobreposicao: 'Sobreposição',
  ausencia: 'Ausência',
  documento: 'Documento',
  viatura_dupla: 'Viatura em duas obras',
  viatura_indisponivel: 'Viatura indisponível',
  lotacao: 'Lotação',
  sem_encarregado: 'Sem encarregado',
  limite: 'Limite de horas',
  inativo: 'Trabalhador inativo',
}

const siteRef = (s: Site | undefined) => (s ? `${s.code} ${s.name}` : 'obra removida')
const day = (d: ISODate) => `${dayShort(d)} ${dateShort(d)}`
const uniq = <T>(xs: T[]) => [...new Set(xs)]

function overlaps(a: Assignment, b: Assignment) {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end)
}

/** Trabalhadores livres em todos os dias indicados, ordenados por proximidade ao original. */
function replacementCandidates(idx: DBIndex, original: Worker, dates: ISODate[], extra?: (w: Worker) => boolean) {
  const sameCat = (w: Worker) => w.category === original.category
  return Object.values(idx.db.workers)
    .filter((w) => w.id !== original.id && w.status === 'ativo')
    .filter((w) => !LEADER_CATEGORIES.includes(w.category) || LEADER_CATEGORIES.includes(original.category))
    .filter((w) => dates.every((d) => availability(w, d, idx).state === 'livre'))
    .filter((w) => (extra ? extra(w) : true))
    .sort((a, b) => {
      const score = (w: Worker) =>
        (sameCat(w) ? 0 : 10) + (w.teamId && w.teamId === original.teamId ? 0 : 1) + (w.teamId ? 0 : -0.5)
      return score(a) - score(b) || a.name.localeCompare(b.name)
    })
}

function vehicleUsable(v: Vehicle, date: ISODate) {
  return v.status === 'operacional' && v.inspectionUntil >= date && v.insuranceUntil >= date
}

function vehicleProblem(v: Vehicle, date: ISODate): string | null {
  if (v.status === 'oficina') return 'está na oficina'
  if (v.status === 'inativa') return 'está inativa'
  if (v.inspectionUntil < date) return `tem a inspeção caducada desde ${dateShort(v.inspectionUntil)}`
  if (v.insuranceUntil < date) return `tem o seguro caducado desde ${dateShort(v.insuranceUntil)}`
  return null
}

function alternativeVehicles(idx: DBIndex, dates: ISODate[], seatsNeeded: number, exclude: ID) {
  return Object.values(idx.db.vehicles)
    .filter((v) => v.id !== exclude && v.seats >= seatsNeeded)
    .filter((v) => dates.every((d) => vehicleUsable(v, d) && !(idx.byVehicleDate.get(key(v.id, d))?.length)))
    .sort((a, b) => a.seats - b.seats || a.plate.localeCompare(b.plate))
    .slice(0, 3)
}

export interface Range {
  from: ISODate
  to: ISODate
}

/**
 * Deteta conflitos de planeamento no intervalo (ignora dias antes de hoje).
 * Cada conflito explica o problema em linguagem simples e traz correções executáveis.
 */
export function detectConflicts(db: DB, range: Range, today: ISODate, settings: Settings): Conflict[] {
  const idx = buildIndex(db)
  const from = range.from > today ? range.from : today
  const to = range.to
  const out: Conflict[] = []
  const inRange = (a: Assignment) => a.date >= from && a.date <= to
  const assignments = Object.values(db.assignments).filter(inRange)

  // ── Por trabalhador e dia: sobreposição, ausência, inativo ──
  const byWorkerDate = new Map<string, Assignment[]>()
  for (const a of assignments) {
    const k = key(a.workerId, a.date)
    byWorkerDate.set(k, [...(byWorkerDate.get(k) ?? []), a])
  }

  const absenceGroups = new Map<string, Assignment[]>()
  for (const list of byWorkerDate.values()) {
    const first = list[0]!
    const w = db.workers[first.workerId]
    if (!w) continue

    if (w.status === 'inativo') {
      out.push({
        id: `inativo:${w.id}:${first.date}`,
        type: 'inativo',
        severity: 'critico',
        date: first.date,
        title: `${w.name} tem a ficha inativa e trabalho atribuído`,
        explanation: `A ficha de ${w.name} está inativa, mas mantém-se no planeamento de ${siteRef(db.sites[first.siteId])} em ${day(first.date)}.`,
        workerIds: [w.id],
        siteIds: uniq(list.map((a) => a.siteId)),
        vehicleIds: [],
        assignmentIds: list.map((a) => a.id),
        fixes: [{ id: 'remove', label: 'Remover atribuição', action: { kind: 'remove_assignment', assignmentIds: list.map((a) => a.id) } }],
      })
      continue
    }

    const absence = absenceOn(idx, w.id, first.date)
    if (absence) {
      const total = list.reduce((s, a) => s + a.hours, 0)
      const capacity = absence.type === 'parcial' ? w.dailyHours - (absence.hours ?? 0) : 0
      if (total > capacity) {
        const k = `${w.id}:${absence.id}`
        absenceGroups.set(k, [...(absenceGroups.get(k) ?? []), ...list])
      }
    }

    if (list.length > 1) {
      const total = list.reduce((s, a) => s + a.hours, 0)
      const overlapping = list.some((a, i) => list.slice(i + 1).some((b) => overlaps(a, b)))
      if (overlapping || total > w.dailyHours) {
        const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start))
        const parts = sorted.map((a) => `${siteRef(db.sites[a.siteId])} (${a.start}–${a.end})`).join(' e em ')
        const fixes: Fix[] = sorted.map((a) => ({
          id: `remove:${a.id}`,
          label: `Retirar de ${db.sites[a.siteId]?.code ?? 'obra'} neste dia`,
          action: { kind: 'remove_assignment', assignmentIds: [a.id] },
        }))
        const last = sorted[sorted.length - 1]!
        const others = total - last.hours
        const fit = w.dailyHours - others
        if (!overlapping && fit > 0) {
          fixes.unshift({
            id: `reduce:${last.id}`,
            label: `Reduzir ${db.sites[last.siteId]?.code ?? 'obra'} para ${formatHours(fit)}`,
            action: { kind: 'reduce_hours', assignmentId: last.id, hours: fit },
          })
        }
        out.push({
          id: `sobreposicao:${w.id}:${first.date}`,
          type: 'sobreposicao',
          severity: overlapping ? 'critico' : 'aviso',
          date: first.date,
          title: overlapping
            ? `${w.name} está em duas obras ao mesmo tempo`
            : `${w.name} tem ${formatHours(total)} planeadas`,
          explanation: `Em ${day(first.date)} está em ${parts}. ${
            overlapping ? 'Os horários sobrepõem-se.' : `A capacidade diária é ${formatHours(w.dailyHours)}.`
          }`,
          workerIds: [w.id],
          siteIds: uniq(list.map((a) => a.siteId)),
          vehicleIds: [],
          assignmentIds: list.map((a) => a.id),
          fixes,
        })
      }
    }
  }

  for (const [k, list] of absenceGroups) {
    const [workerId, absenceId] = k.split(':') as [ID, ID]
    const w = db.workers[workerId]!
    const ab = db.absences[absenceId]!
    const dates = uniq(list.map((a) => a.date)).sort()
    const candidates = replacementCandidates(idx, w, dates).slice(0, 3)
    const ids = list.map((a) => a.id)
    out.push({
      id: `ausencia:${workerId}:${absenceId}`,
      type: 'ausencia',
      severity: 'critico',
      date: dates[0]!,
      title: `${w.name} tem ${ABSENCE_TYPE[ab.type].toLowerCase()} e trabalho atribuído`,
      explanation: `Ausência aprovada (${ABSENCE_TYPE[ab.type].toLowerCase()}) de ${dateShort(ab.start)} a ${dateShort(ab.end)}, mas mantém-se no planeamento em ${dates.length === 1 ? day(dates[0]!) : `${dates.length} dias`} (${siteRef(db.sites[list[0]!.siteId])}).`,
      workerIds: [w.id],
      siteIds: uniq(list.map((a) => a.siteId)),
      vehicleIds: [],
      assignmentIds: ids,
      fixes: [
        ...candidates.map((c) => ({
          id: `replace:${c.id}`,
          label: `Substituir por ${c.name}`,
          detail: `${c.category} · livre ${dates.length === 1 ? 'nesse dia' : 'em todos os dias'}`,
          action: { kind: 'replace_worker' as const, assignmentIds: ids, workerId: c.id },
        })),
        { id: 'remove', label: 'Retirar do planeamento', action: { kind: 'remove_assignment', assignmentIds: ids } },
      ],
    })
  }

  // ── Documentos exigidos pelo país da obra ──
  const docGroups = new Map<string, Assignment[]>()
  for (const a of assignments) {
    const s = db.sites[a.siteId]
    const w = db.workers[a.workerId]
    if (!s || !w || w.status === 'inativo') continue
    for (const t of requiredWorkerDocTypes(db, s.country)) {
      if (docProblemOn(latestDoc(db, w.id, t.id), a.date)) {
        const k = `${w.id}:${s.id}:${t.id}`
        docGroups.set(k, [...(docGroups.get(k) ?? []), a])
      }
    }
  }
  for (const [k, list] of docGroups) {
    const [workerId, siteId, typeId] = k.split(':') as [ID, ID, ID]
    const w = db.workers[workerId]!
    const s = db.sites[siteId]!
    const t = db.docTypes[typeId]!
    const d = latestDoc(db, workerId, typeId)
    const dates = uniq(list.map((a) => a.date)).sort()
    const problem = docProblemOn(d, dates[0]!)!
    const ids = list.map((a) => a.id)
    const candidates = replacementCandidates(idx, w, dates, (c) => !docProblemOn(latestDoc(db, c.id, typeId), dates[dates.length - 1]!)).slice(0, 2)
    out.push({
      id: `documento:${workerId}:${siteId}:${typeId}`,
      type: 'documento',
      severity: 'critico',
      date: dates[0]!,
      title: `${w.name} sem ${t.short} válido para ${COUNTRY_NAME[s.country]}`,
      explanation: `${siteRef(s)} (${s.city}) exige ${t.name}. ${problem}. Afeta ${dates.length === 1 ? day(dates[0]!) : `${dates.length} dias`}.`,
      workerIds: [w.id],
      siteIds: [s.id],
      vehicleIds: [],
      assignmentIds: ids,
      fixes: [
        { id: 'open', label: `Atualizar ${t.short}`, action: { kind: 'open_document', workerId, typeId } },
        ...candidates.map((c) => ({
          id: `replace:${c.id}`,
          label: `Substituir por ${c.name}`,
          detail: `${c.category} · ${t.short} válido`,
          action: { kind: 'replace_worker' as const, assignmentIds: ids, workerId: c.id },
        })),
      ],
    })
  }

  // ── Viaturas: dupla reserva, indisponível, lotação ──
  const byVehicleDate = new Map<string, Assignment[]>()
  for (const a of assignments) {
    if (!a.vehicleId) continue
    const k = key(a.vehicleId, a.date)
    byVehicleDate.set(k, [...(byVehicleDate.get(k) ?? []), a])
  }
  const unavailable = new Map<ID, Assignment[]>()
  for (const list of byVehicleDate.values()) {
    const first = list[0]!
    const v = db.vehicles[first.vehicleId!]
    if (!v) continue
    const date = first.date

    if (vehicleProblem(v, date)) unavailable.set(v.id, [...(unavailable.get(v.id) ?? []), ...list])

    const sites = uniq(list.map((a) => a.siteId))
    if (sites.length > 1) {
      const groups = sites.map((sid) => list.filter((a) => a.siteId === sid))
      const owner =
        groups.find((g) => v.teamId && g.some((a) => a.teamId === v.teamId)) ??
        [...groups].sort((a, b) => b.length - a.length)[0]!
      const fixes: Fix[] = []
      for (const g of groups) {
        if (g === owner) continue
        const sid = g[0]!.siteId
        for (const alt of alternativeVehicles(idx, [date], g.length, v.id)) {
          fixes.push({
            id: `swap:${sid}:${alt.id}`,
            label: `Usar ${alt.plate} em ${db.sites[sid]?.code}`,
            detail: `${alt.make} ${alt.model} · ${alt.seats} lugares · livre`,
            action: { kind: 'swap_vehicle', assignmentIds: g.map((a) => a.id), vehicleId: alt.id },
          })
        }
      }
      out.push({
        id: `viatura_dupla:${v.id}:${date}`,
        type: 'viatura_dupla',
        severity: 'critico',
        date,
        title: `${v.plate} reservada para ${sites.length} obras`,
        explanation: `Em ${day(date)} a viatura está atribuída a ${sites.map((sid) => siteRef(db.sites[sid])).join(' e a ')}.`,
        workerIds: uniq(list.map((a) => a.workerId)),
        siteIds: sites,
        vehicleIds: [v.id],
        assignmentIds: list.map((a) => a.id),
        fixes,
      })
    }

    const riders = uniq(list.map((a) => a.workerId))
    if (riders.length > v.seats) {
      out.push({
        id: `lotacao:${v.id}:${date}`,
        type: 'lotacao',
        severity: 'aviso',
        date,
        title: `${v.plate} com ${riders.length} pessoas para ${v.seats} lugares`,
        explanation: `Em ${day(date)} há ${riders.length} trabalhadores a deslocar-se na ${v.make} ${v.model}, que tem ${v.seats} lugares.`,
        workerIds: riders,
        siteIds: sites,
        vehicleIds: [v.id],
        assignmentIds: list.map((a) => a.id),
        fixes: alternativeVehicles(idx, [date], riders.length, v.id).map((alt) => ({
          id: `swap:${alt.id}`,
          label: `Trocar para ${alt.plate}`,
          detail: `${alt.make} ${alt.model} · ${alt.seats} lugares`,
          action: { kind: 'swap_vehicle' as const, assignmentIds: list.map((a) => a.id), vehicleId: alt.id },
        })),
      })
    }
  }
  for (const [vid, list] of unavailable) {
    const v = db.vehicles[vid]!
    const dates = uniq(list.map((a) => a.date)).sort()
    const seats = Math.max(...dates.map((d) => uniq(list.filter((a) => a.date === d).map((a) => a.workerId)).length))
    out.push({
      id: `viatura_indisponivel:${vid}`,
      type: 'viatura_indisponivel',
      severity: 'critico',
      date: dates[0]!,
      title: `${v.plate} não pode circular`,
      explanation: `A viatura ${vehicleProblem(v, dates[0]!)} e está escalada em ${dates.length === 1 ? day(dates[0]!) : `${dates.length} dias`}.`,
      workerIds: uniq(list.map((a) => a.workerId)),
      siteIds: uniq(list.map((a) => a.siteId)),
      vehicleIds: [vid],
      assignmentIds: list.map((a) => a.id),
      fixes: alternativeVehicles(idx, dates, seats, vid).map((alt) => ({
        id: `swap:${alt.id}`,
        label: `Trocar para ${alt.plate}`,
        detail: `${alt.make} ${alt.model} · ${alt.seats} lugares · livre`,
        action: { kind: 'swap_vehicle' as const, assignmentIds: list.map((a) => a.id), vehicleId: alt.id },
      })),
    })
  }

  // ── Obras: sem encarregado num dia com equipa ──
  const bySiteDate = new Map<string, Assignment[]>()
  for (const a of assignments) {
    const k = key(a.siteId, a.date)
    bySiteDate.set(k, [...(bySiteDate.get(k) ?? []), a])
  }
  for (const list of bySiteDate.values()) {
    const workers = uniq(list.map((a) => a.workerId))
    if (workers.length < 2) continue
    const led = list.some((a) => a.isForeman || LEADER_CATEGORIES.includes(db.workers[a.workerId]?.category ?? 'Servente'))
    if (led) continue
    const s = db.sites[list[0]!.siteId]
    if (!s) continue
    const date = list[0]!.date
    const fixes: Fix[] = []
    const leaders = Object.values(db.workers)
      .filter((w) => w.status === 'ativo' && LEADER_CATEGORIES.includes(w.category))
      .filter((w) => availability(w, date, idx).state === 'livre')
      .sort((a, b) => (a.id === s.foremanId ? -1 : b.id === s.foremanId ? 1 : a.category.localeCompare(b.category)))
      .slice(0, 2)
    for (const l of leaders) {
      fixes.push({
        id: `assign:${l.id}`,
        label: `Atribuir ${l.name}`,
        detail: l.id === s.foremanId ? 'Encarregado da obra · livre' : `${l.category} · livre`,
        action: { kind: 'assign_worker', siteId: s.id, date, workerId: l.id, isForeman: true },
      })
    }
    const senior = [...list].sort((a, b) => a.workerId.localeCompare(b.workerId))[0]!
    fixes.push({
      id: `foreman:${senior.id}`,
      label: `Nomear ${db.workers[senior.workerId]?.name} responsável no dia`,
      action: { kind: 'set_foreman', assignmentId: senior.id },
    })
    out.push({
      id: `sem_encarregado:${s.id}:${date}`,
      type: 'sem_encarregado',
      severity: 'aviso',
      date,
      title: `${s.code} sem responsável em ${day(date)}`,
      explanation: `${workers.length} trabalhadores escalados em ${siteRef(s)} e nenhum é encarregado ou chefe de equipa.`,
      workerIds: workers,
      siteIds: [s.id],
      vehicleIds: [],
      assignmentIds: list.map((a) => a.id),
      fixes,
    })
  }

  // ── Obras: projeção acima do limite ──
  const allAssignments = Object.values(db.assignments)
  const allEntries = Object.values(db.entries)
  for (const s of Object.values(db.sites)) {
    if (s.status !== 'em_curso') continue
    const m = siteMetrics(s, allAssignments, allEntries, today, settings)
    if (m.status !== 'excede') continue
    const newLimit = Math.ceil(m.projection / 100) * 100 + (m.projection % 100 === 0 ? 100 : 0)
    out.push({
      id: `limite:${s.id}`,
      type: 'limite',
      severity: 'critico',
      date: null,
      title: `${s.code} vai ultrapassar o limite de horas`,
      explanation: `${siteRef(s)}: ${formatHours(m.realized)} realizadas + ${formatHours(m.plannedFuture)} planeadas = ${formatHours(m.projection)}, acima do limite de ${formatHours(m.limit ?? 0)} (${formatHours(m.overBy)} a mais).`,
      workerIds: [],
      siteIds: [s.id],
      vehicleIds: [],
      assignmentIds: [],
      fixes: [
        { id: 'open', label: 'Rever planeamento da obra', action: { kind: 'open_site', siteId: s.id } },
        { id: 'raise', label: `Ajustar limite para ${formatHours(newLimit)}`, detail: 'Fica registado no histórico da obra', action: { kind: 'raise_limit', siteId: s.id, limit: newLimit } },
      ],
    })
  }

  const sev = { critico: 0, aviso: 1 }
  return out.sort(
    (a, b) => sev[a.severity] - sev[b.severity] || (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id),
  )
}
