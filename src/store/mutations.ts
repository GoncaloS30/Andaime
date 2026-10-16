/**
 * Mutadores puros sobre um rascunho do DB (immer).
 * São usados pelas ações (dentro de `set`) e pelas pré-visualizações (`produce`),
 * para que o que se pré-visualiza seja exatamente o que se grava.
 */
import { timeRangeHours, toMinutes, fromMinutes } from '@/domain/hours'
import { workdaysBetween, type AssignmentDraft } from '@/domain/planning'
import type { FixAction } from '@/domain/conflicts'
import type { Assignment, DB, ID, ISODate, Settings, Site } from '@/domain/types'
import { addDays, isWeekend } from '@/domain/weeks'
import { seriesColor } from '@/domain/palette'
import type { AssignInput, ScheduleInput, SiteInput, TransferInput } from './types'

export interface MCtx {
  uid: (p: string) => ID
  today: ISODate
  settings: Settings
}

function isAbsentFull(db: DB, workerId: ID, date: ISODate) {
  return Object.values(db.absences).some(
    (a) => a.workerId === workerId && a.status === 'aprovado' && a.type !== 'parcial' && a.start <= date && a.end >= date,
  )
}

export function mAddAssignment(db: DB, a: AssignmentDraft, ctx: MCtx): ID {
  const id = ctx.uid('a')
  db.assignments[id] = { ...a, id }
  return id
}

export function mSchedule(db: DB, input: ScheduleInput, ctx: MCtx): { batchId: ID; ids: ID[] } {
  const batchId = ctx.uid('escala')
  const hours = timeRangeHours(input.start, input.end, ctx.settings.defaultBreak)
  const ids: ID[] = []
  for (const workerId of input.workerIds) {
    for (const date of input.dates) {
      ids.push(
        mAddAssignment(
          db,
          {
            workerId,
            siteId: input.siteId,
            date,
            hours,
            start: input.start,
            end: input.end,
            teamId: input.teamId,
            vehicleId: input.vehicleId,
            isForeman: input.foremanId === workerId,
            note: input.note,
            batchId,
          },
          ctx,
        ),
      )
    }
  }
  return { batchId, ids }
}

/** Viatura que a equipa do trabalhador usa nessa obra e dia (se houver). */
function inferredVehicle(db: DB, workerId: ID, siteId: ID, date: ISODate): ID | null {
  const w = db.workers[workerId]
  const team = w?.teamId ? db.teams[w.teamId] : undefined
  const mate = Object.values(db.assignments).find(
    (a) => a.siteId === siteId && a.date === date && a.vehicleId && (team ? a.teamId === team.id : true),
  )
  if (mate) return mate.vehicleId
  return team && team.siteId === siteId ? team.vehicleId : null
}

export function mAssign(db: DB, input: AssignInput, ctx: MCtx): ID {
  const start = input.start ?? '08:00'
  const end = input.end ?? '17:00'
  const w = db.workers[input.workerId]
  return mAddAssignment(
    db,
    {
      workerId: input.workerId,
      siteId: input.siteId,
      date: input.date,
      hours: input.hours ?? timeRangeHours(start, end, ctx.settings.defaultBreak),
      start,
      end,
      teamId: input.teamId !== undefined ? input.teamId : (w?.teamId ?? null),
      vehicleId: input.vehicleId !== undefined ? input.vehicleId : inferredVehicle(db, input.workerId, input.siteId, input.date),
      isForeman: false,
      note: input.note ?? '',
      batchId: null,
    },
    ctx,
  )
}

export function mMove(db: DB, id: ID, target: { workerId?: ID; date?: ISODate; siteId?: ID }, copy: boolean, ctx: MCtx): ID {
  const a = db.assignments[id]
  if (!a) throw new Error('Atribuição não encontrada')
  const next: Assignment = {
    ...a,
    workerId: target.workerId ?? a.workerId,
    date: target.date ?? a.date,
    siteId: target.siteId ?? a.siteId,
  }
  if (target.siteId && target.siteId !== a.siteId) {
    next.vehicleId = inferredVehicle(db, next.workerId, next.siteId, next.date)
    const site = db.sites[target.siteId]
    const team = Object.values(db.teams).find((t) => t.siteId === site?.id)
    if (team && db.workers[next.workerId]?.teamId !== team.id) next.teamId = team.id
  }
  if (target.workerId && target.workerId !== a.workerId) next.isForeman = false
  if (copy) {
    const nid = ctx.uid('a')
    db.assignments[nid] = { ...next, id: nid, batchId: null }
    return nid
  }
  db.assignments[id] = next
  return id
}

export function mRemove(db: DB, ids: ID[]) {
  for (const id of ids) delete db.assignments[id]
}

/** Define o período contínuo de um trabalhador numa obra a partir de uma atribuição âncora. */
export function mSetRange(db: DB, anchorId: ID, from: ISODate, to: ISODate, ctx: MCtx) {
  const anchor = db.assignments[anchorId]
  if (!anchor || to < from) return
  const mine = Object.values(db.assignments)
    .filter((a) => a.workerId === anchor.workerId && a.siteId === anchor.siteId)
    .sort((a, b) => a.date.localeCompare(b.date))
  // run contínuo (dias úteis seguidos) que contém a âncora
  let runFrom = anchor.date
  let runTo = anchor.date
  const dates = new Set(mine.map((a) => a.date))
  for (let d = addDays(runFrom, -1); d >= addDays(anchor.date, -60); d = addDays(d, -1)) {
    if (dates.has(d)) runFrom = d
    else if (!isWeekend(d)) break
  }
  for (let d = addDays(runTo, 1); d <= addDays(anchor.date, 60); d = addDays(d, 1)) {
    if (dates.has(d)) runTo = d
    else if (!isWeekend(d)) break
  }
  const windowFrom = from < runFrom ? from : runFrom
  const windowTo = to > runTo ? to : runTo
  const template = { ...anchor }
  for (const a of mine) if (a.date >= windowFrom && a.date <= windowTo) delete db.assignments[a.id]
  for (const d of workdaysBetween(from, to, isWeekend(anchor.date))) {
    if (isAbsentFull(db, anchor.workerId, d)) continue
    const { id: _id, ...rest } = template
    mAddAssignment(db, { ...rest, date: d }, ctx)
  }
}

export function mTransfer(db: DB, input: TransferInput, ctx: MCtx): { removed: number; created: number; teamId: ID | null } {
  const w = db.workers[input.workerId]
  if (!w) throw new Error('Trabalhador não encontrado')
  const targetTeam = Object.values(db.teams).find((t) => t.siteId === input.siteId) ?? null
  let removed = 0
  for (const a of Object.values(db.assignments)) {
    if (a.workerId === w.id && a.date >= input.from && a.date <= input.to) {
      delete db.assignments[a.id]
      removed++
    }
  }
  let created = 0
  const start = input.start ?? '08:00'
  const end = input.end ?? '17:00'
  for (const date of workdaysBetween(input.from, input.to)) {
    if (isAbsentFull(db, w.id, date)) continue
    mAddAssignment(
      db,
      {
        workerId: w.id,
        siteId: input.siteId,
        date,
        hours: timeRangeHours(start, end, ctx.settings.defaultBreak),
        start,
        end,
        teamId: targetTeam?.id ?? null,
        vehicleId: targetTeam?.vehicleId ?? null,
        isForeman: false,
        note: '',
        batchId: null,
      },
      ctx,
    )
    created++
  }
  if (input.permanent && targetTeam && w.teamId !== targetTeam.id) {
    const old = w.teamId ? db.teams[w.teamId] : undefined
    if (old) {
      old.memberIds = old.memberIds.filter((m) => m !== w.id)
      if (old.foremanId === w.id) old.foremanId = null
    }
    targetTeam.memberIds.push(w.id)
    w.teamId = targetTeam.id
    w.usualVehicleId = targetTeam.vehicleId
  }
  return { removed, created, teamId: targetTeam?.id ?? null }
}

export function mTeamVehicle(db: DB, teamId: ID, vehicleId: ID, from: ISODate) {
  const team = db.teams[teamId]
  const v = db.vehicles[vehicleId]
  if (!team || !v) throw new Error('Equipa ou viatura não encontrada')
  const previous = team.vehicleId ? db.vehicles[team.vehicleId] : undefined
  if (previous && previous.id !== vehicleId) previous.teamId = null
  if (v.teamId && v.teamId !== teamId) {
    const other = db.teams[v.teamId]
    if (other) other.vehicleId = null
  }
  v.teamId = teamId
  team.vehicleId = vehicleId
  for (const a of Object.values(db.assignments)) {
    if (a.teamId === teamId && a.date >= from) a.vehicleId = vehicleId
  }
  for (const m of team.memberIds) {
    const w = db.workers[m]
    if (w) w.usualVehicleId = vehicleId
  }
}

export function mApplyDrafts(db: DB, drafts: AssignmentDraft[], ctx: MCtx): ID[] {
  const batchId = ctx.uid('escala')
  return drafts.map((d) => mAddAssignment(db, { ...d, batchId }, ctx))
}

export function nextSiteCode(db: DB, today: ISODate): string {
  const yy = today.slice(2, 4)
  const max = Object.values(db.sites)
    .map((s) => s.code.match(new RegExp(`^OB-${yy}-(\\d{3})$`))?.[1])
    .filter((x): x is string => !!x)
    .reduce((m, x) => Math.max(m, Number(x)), 0)
  return `OB-${yy}-${String(max + 1).padStart(3, '0')}`
}

export function mCreateSite(db: DB, input: SiteInput, ctx: MCtx): ID {
  const id = ctx.uid('s')
  let clientId = input.clientId
  if (!clientId && input.newClient) {
    clientId = ctx.uid('c')
    db.clients[clientId] = { id: clientId, nif: input.newClient.nif ?? '', ...input.newClient }
  }
  if (!clientId) throw new Error('Indique o cliente')
  const team = input.teamId ? db.teams[input.teamId] : undefined
  const site: Site = {
    id,
    code: nextSiteCode(db, ctx.today),
    name: input.name.trim(),
    clientId,
    country: input.country,
    city: input.city,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    timezone: { PT: 'Europe/Lisbon', FR: 'Europe/Paris', BE: 'Europe/Brussels', DE: 'Europe/Berlin' }[input.country],
    status: input.startDate > ctx.today ? 'planeada' : 'em_curso',
    startDate: input.startDate,
    endDate: input.endDate,
    hourLimit: input.hourLimit,
    baselineRealized: 0,
    baselineApproved: 0,
    directorId: input.directorId,
    foremanId: team?.foremanId ?? null,
    color: seriesColor(Object.keys(db.sites).length),
    description: input.description,
    erpOrder: String(41000900 + Object.keys(db.sites).length),
  }
  db.sites[id] = site

  if (team) {
    if (input.vehicleId) mTeamVehicle(db, team.id, input.vehicleId, ctx.today)
    team.siteId = id
    const from = input.startDate > ctx.today ? input.startDate : ctx.today
    const to = addDays(from, (input.planWeeks ?? 2) * 7 - 1)
    const days = workdaysBetween(from, to)
    if (input.moveTeam) {
      for (const a of Object.values(db.assignments)) {
        if (team.memberIds.includes(a.workerId) && a.date >= from && a.date <= to) delete db.assignments[a.id]
      }
    }
    for (const m of team.memberIds) {
      for (const d of days) {
        if (isAbsentFull(db, m, d)) continue
        mAddAssignment(
          db,
          {
            workerId: m, siteId: id, date: d, hours: timeRangeHours('08:00', '17:00', ctx.settings.defaultBreak),
            start: '08:00', end: '17:00', teamId: team.id, vehicleId: team.vehicleId, isForeman: m === team.foremanId,
            note: '', batchId: null,
          },
          ctx,
        )
      }
    }
  }
  return id
}

/** Executa a ação de uma correção sugerida. Devolve o destino quando a correção é navegação. */
export function mApplyFix(db: DB, action: FixAction, ctx: MCtx): { navigate?: string; message: string } {
  switch (action.kind) {
    case 'remove_assignment':
      mRemove(db, action.assignmentIds)
      return { message: 'Atribuição retirada do planeamento.' }
    case 'reduce_hours': {
      const a = db.assignments[action.assignmentId]
      if (a) {
        a.hours = action.hours
        a.end = fromMinutes(toMinutes(a.start) + action.hours * 60 + (action.hours * 60 > 360 ? ctx.settings.defaultBreak : 0))
      }
      return { message: 'Horas ajustadas.' }
    }
    case 'replace_worker':
      for (const id of action.assignmentIds) {
        const a = db.assignments[id]
        if (a) {
          a.workerId = action.workerId
          a.isForeman = false
        }
      }
      return { message: `Substituído por ${db.workers[action.workerId]?.name ?? 'outro trabalhador'}.` }
    case 'swap_vehicle':
      for (const id of action.assignmentIds) {
        const a = db.assignments[id]
        if (a) a.vehicleId = action.vehicleId
      }
      return { message: action.vehicleId ? `Viatura trocada para ${db.vehicles[action.vehicleId]?.plate}.` : 'Viatura retirada.' }
    case 'set_foreman': {
      const a = db.assignments[action.assignmentId]
      if (a) a.isForeman = true
      return { message: 'Responsável do dia definido.' }
    }
    case 'assign_worker': {
      const ref = Object.values(db.assignments).find((a) => a.siteId === action.siteId && a.date === action.date)
      mAddAssignment(
        db,
        {
          workerId: action.workerId, siteId: action.siteId, date: action.date,
          hours: ref?.hours ?? 8, start: ref?.start ?? '08:00', end: ref?.end ?? '17:00',
          teamId: ref?.teamId ?? null, vehicleId: null, isForeman: action.isForeman, note: '', batchId: null,
        },
        ctx,
      )
      return { message: `${db.workers[action.workerId]?.name} atribuído à obra nesse dia.` }
    }
    case 'raise_limit': {
      const s = db.sites[action.siteId]
      if (s) s.hourLimit = action.limit
      return { message: 'Limite de horas ajustado.' }
    }
    case 'open_document':
      return { navigate: `/trabalhadores/${action.workerId}?tab=documentos&doc=${action.typeId}`, message: '' }
    case 'open_site':
      return { navigate: `/obras/${action.siteId}?tab=planeamento`, message: '' }
  }
}
