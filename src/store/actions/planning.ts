import { produce } from 'immer'
import { detectConflicts } from '@/domain/conflicts'
import { formatHours } from '@/domain/hours'
import { newConflicts, planCopyWeek } from '@/domain/planning'
import type { DB, ID, ISODate } from '@/domain/types'
import { addDays, dateShort, isoWeek, weekStart } from '@/domain/weeks'
import { pushUndo, type StoreApi } from '../api'
import { log, notify, plural } from '../helpers'
import {
  mApplyDrafts,
  mApplyFix,
  mAssign,
  mMove,
  mRemove,
  mSchedule,
  mSetRange,
  mTransfer,
} from '../mutations'
import { defaultRange, selectConflicts } from '../selectors'
import type { DemoActions, ScheduleInput, TransferInput } from '../types'

function rangeOf(dates: ISODate[], today: ISODate) {
  const sorted = [...dates].sort()
  const from = sorted[0] ?? today
  const to = sorted[sorted.length - 1] ?? today
  return { from: weekStart(from), to: addDays(weekStart(to), 6) }
}

export function planningActions(api: StoreApi): Pick<
  DemoActions,
  | 'previewSchedule' | 'createSchedule' | 'assign' | 'moveAssignment' | 'updateAssignment' | 'removeAssignments'
  | 'setRange' | 'bulkUpdate' | 'previewTransfer' | 'transferWorker' | 'previewCopyWeek' | 'applyCopyWeek'
  | 'applyFix' | 'undo' | 'canUndo' | 'setWeekNote'
> {
  const { set, get, clock, mctx, snapshot } = api

  /** Conflitos que uma alteração hipotética criaria. */
  function preview(range: { from: ISODate; to: ISODate }, mutate: (d: DB) => void) {
    const s = get()
    const { today, settings } = s.session
    const before = detectConflicts(s.db, range, today, settings)
    const after = detectConflicts(produce(s.db, mutate), range, today, settings)
    return newConflicts(before, after)
  }

  const workerName = (id: ID) => get().db.workers[id]?.name ?? 'Trabalhador'
  const siteCode = (id: ID) => get().db.sites[id]?.code ?? 'obra'

  return {
    previewSchedule(input: ScheduleInput) {
      return preview(rangeOf(input.dates, get().session.today), (d) => {
        mSchedule(d, input, mctx())
      })
    },

    createSchedule(input) {
      if (input.workerIds.length === 0 || input.dates.length === 0) throw new Error('Escolha trabalhadores e dias')
      const snap = snapshot('Nova escala')
      let res = { batchId: '', created: 0 }
      set((s) => {
        pushUndo(s, snap)
        const out = mSchedule(s.db, input, mctx())
        res = { batchId: out.batchId, created: out.ids.length }
        const site = s.db.sites[input.siteId]
        const week = isoWeek(input.dates[0]!)
        log(s, clock(), 'planeamento', `Criou escala em ${site?.code} para ${plural(input.workerIds.length, 'trabalhador', 'trabalhadores')} (semana ${week}).`, { siteId: input.siteId, teamId: input.teamId ?? undefined })
        const team = input.teamId ? s.db.teams[input.teamId] : undefined
        if (team?.foremanId) notify(s, clock(), 'encarregado', team.foremanId, 'Escala atualizada', `${site?.code} ${site?.name}: semana ${week}.`, '/encarregado')
        for (const wid of input.workerIds) {
          if (wid === s.session.personas.trabalhador) notify(s, clock(), 'trabalhador', wid, 'Nova escala', `${site?.name}, ${input.start}–${input.end}.`, '/app/semana')
        }
      })
      return res
    },

    assign(input) {
      const snap = snapshot('Atribuir')
      let id = ''
      set((s) => {
        pushUndo(s, snap)
        id = mAssign(s.db, input, mctx())
        log(s, clock(), 'planeamento', `Atribuiu ${workerName(input.workerId)} a ${siteCode(input.siteId)} em ${dateShort(input.date)}.`, { workerId: input.workerId, siteId: input.siteId })
      })
      return id
    },

    moveAssignment(id, target, copy = false) {
      const a = get().db.assignments[id]
      if (!a) throw new Error('Atribuição não encontrada')
      const snap = snapshot(copy ? 'Copiar' : 'Mover')
      let out = id
      set((s) => {
        pushUndo(s, snap)
        out = mMove(s.db, id, target, copy, mctx())
        const n = s.db.assignments[out]!
        log(s, clock(), 'planeamento', `${copy ? 'Copiou' : 'Moveu'} ${workerName(n.workerId)} para ${siteCode(n.siteId)} em ${dateShort(n.date)}.`, { workerId: n.workerId, siteId: n.siteId })
      })
      return out
    },

    updateAssignment(id, patch) {
      const snap = snapshot('Editar atribuição')
      set((s) => {
        const a = s.db.assignments[id]
        if (!a) return
        pushUndo(s, snap)
        Object.assign(a, patch)
        log(s, clock(), 'planeamento', `Atualizou a atribuição de ${workerName(a.workerId)} em ${dateShort(a.date)}.`, { workerId: a.workerId, siteId: a.siteId })
      })
    },

    removeAssignments(ids) {
      if (ids.length === 0) return
      const snap = snapshot(ids.length === 1 ? 'Remover atribuição' : `Remover ${ids.length} atribuições`)
      set((s) => {
        const first = s.db.assignments[ids[0]!]
        pushUndo(s, snap)
        mRemove(s.db, ids)
        log(s, clock(), 'planeamento', ids.length === 1 && first ? `Retirou ${workerName(first.workerId)} de ${siteCode(first.siteId)} em ${dateShort(first.date)}.` : `Retirou ${ids.length} atribuições do planeamento.`, first ? { workerId: ids.length === 1 ? first.workerId : undefined, siteId: first.siteId } : {})
      })
    },

    setRange(anchorId, from, to) {
      const a = get().db.assignments[anchorId]
      if (!a) return
      const snap = snapshot('Alterar período')
      set((s) => {
        pushUndo(s, snap)
        mSetRange(s.db, anchorId, from, to, mctx())
        log(s, clock(), 'planeamento', `Alterou o período de ${workerName(a.workerId)} em ${siteCode(a.siteId)} para ${dateShort(from)}–${dateShort(to)}.`, { workerId: a.workerId, siteId: a.siteId })
      })
    },

    bulkUpdate(ids, patch) {
      if (ids.length === 0) return
      const snap = snapshot(`Alterar ${ids.length} atribuições`)
      set((s) => {
        pushUndo(s, snap)
        for (const id of ids) {
          const a = s.db.assignments[id]
          if (a) Object.assign(a, patch)
        }
        const what = patch.siteId ? `obra ${siteCode(patch.siteId)}` : patch.vehicleId !== undefined ? `viatura ${patch.vehicleId ? s.db.vehicles[patch.vehicleId]?.plate : 'nenhuma'}` : 'horário'
        log(s, clock(), 'planeamento', `Alterou ${ids.length} atribuições em lote (${what}).`, patch.siteId ? { siteId: patch.siteId } : {})
      })
    },

    previewTransfer(input: TransferInput) {
      return preview({ from: weekStart(input.from), to: addDays(weekStart(input.to), 6) }, (d) => {
        mTransfer(d, input, mctx())
      })
    },

    transferWorker(input) {
      const snap = snapshot('Transferir trabalhador')
      let res = { removed: 0, created: 0 }
      set((s) => {
        pushUndo(s, snap)
        const before = s.db.workers[input.workerId]?.teamId
        const out = mTransfer(s.db, input, mctx())
        res = { removed: out.removed, created: out.created }
        const w = s.db.workers[input.workerId]!
        const site = s.db.sites[input.siteId]!
        log(s, clock(), 'transferencia', `Transferiu ${w.name} para ${site.code} ${site.name} de ${dateShort(input.from)} a ${dateShort(input.to)}${input.permanent ? ' (mudança de equipa)' : ''}.`, { workerId: w.id, siteId: site.id, teamId: out.teamId ?? undefined })
        if (input.permanent && out.teamId && before !== out.teamId) {
          const team = s.db.teams[out.teamId]!
          team.history.push({ at: `${s.session.today}T${clock()}:00`, text: `${w.name} entrou na equipa (transferência).` })
          const old = before ? s.db.teams[before] : undefined
          old?.history.push({ at: `${s.session.today}T${clock()}:00`, text: `${w.name} saiu da equipa para ${team.name}.` })
        }
        const team = out.teamId ? s.db.teams[out.teamId] : undefined
        if (team?.foremanId) notify(s, clock(), 'encarregado', team.foremanId, 'Reforço na equipa', `${w.name} junta-se a ${site.code} a partir de ${dateShort(input.from)}.`, '/encarregado')
        if (w.id === s.session.personas.trabalhador) notify(s, clock(), 'trabalhador', w.id, 'Mudança de obra', `A partir de ${dateShort(input.from)}: ${site.name}.`, '/app/semana')
      })
      return res
    },

    previewCopyWeek(fromWs, toWs, opts) {
      return planCopyWeek(get().db, fromWs, toWs, opts)
    },

    applyCopyWeek(fromWs, toWs, opts) {
      const plan = planCopyWeek(get().db, fromWs, toWs, opts)
      if (plan.drafts.length === 0) return { created: 0 }
      const snap = snapshot('Copiar semana')
      set((s) => {
        pushUndo(s, snap)
        mApplyDrafts(s.db, plan.drafts, mctx())
        log(s, clock(), 'planeamento', `Copiou a semana ${isoWeek(fromWs)} para a semana ${isoWeek(toWs)} (${plan.drafts.length} atribuições${opts.teamIds ? `, ${plural(opts.teamIds.length, 'equipa', 'equipas')}` : ''}).`)
      })
      return { created: plan.drafts.length }
    },

    applyFix(conflictId, fixId) {
      const s0 = get()
      const pool = [
        ...selectConflicts(s0),
        ...selectConflicts(s0, { from: s0.session.today, to: addDays(s0.session.today, 90) }),
      ]
      const conflict = pool.find((c) => c.id === conflictId)
      const fix = conflict?.fixes.find((f) => f.id === fixId)
      if (!conflict || !fix) return { ok: false, message: 'Este conflito já foi resolvido.' }
      if (fix.action.kind === 'open_document' || fix.action.kind === 'open_site') {
        const r = mApplyFix(s0.db, fix.action, mctx())
        return { ok: true, message: '', navigate: r.navigate }
      }
      const snap = snapshot(fix.label)
      let message = ''
      set((s) => {
        pushUndo(s, snap)
        message = mApplyFix(s.db, fix.action, mctx()).message
        const refs = { workerId: conflict.workerIds.length === 1 ? conflict.workerIds[0] : undefined, siteId: conflict.siteIds[0], vehicleId: conflict.vehicleIds[0] }
        log(s, clock(), 'conflito', `Resolveu "${conflict.title}": ${fix.label.toLowerCase()}.`, refs)
        if (fix.action.kind === 'raise_limit') {
          log(s, clock(), 'obra', `Limite de horas de ${s.db.sites[fix.action.siteId]?.code} ajustado para ${formatHours(fix.action.limit)}.`, { siteId: fix.action.siteId })
        }
      })
      return { ok: true, message }
    },

    undo() {
      const s0 = get()
      const snap = s0.undoStack[s0.undoStack.length - 1]
      if (!snap) return null
      set((s) => {
        s.undoStack.pop()
        s.db.assignments = snap.assignments
        s.db.teams = snap.teams
        s.db.vehicles = snap.vehicles
        s.db.workers = snap.workers
        s.db.sites = snap.sites
        log(s, clock(), 'planeamento', `Anulou: ${snap.label.toLowerCase()}.`)
      })
      return snap.label
    },

    canUndo() {
      return get().undoStack.length > 0
    },

    setWeekNote(ws, text) {
      set((s) => {
        s.db.weekNotes[ws] = { weekStart: ws, text }
        log(s, clock(), 'mapas', `Atualizou as notas da semana ${isoWeek(ws)}.`)
      })
    },
  }
}

export { defaultRange }
