import { toMinutes } from '@/domain/hours'
import type { DB, ID } from '@/domain/types'
import type { MCtx } from './mutations'
import type { WorkerOp } from './types'

/** Assignment de hoje do trabalhador (a primeira, por hora de início). */
export function todayAssignment(db: DB, workerId: ID, date: string) {
  return Object.values(db.assignments)
    .filter((a) => a.workerId === workerId && a.date === date)
    .sort((a, b) => a.start.localeCompare(b.start))[0]
}

export function openEntry(db: DB, workerId: ID, date: string) {
  return Object.values(db.entries).find((e) => e.workerId === workerId && e.date === date && e.status === 'aberto')
}

/**
 * Aplica uma operação da app do trabalhador ao DB.
 * Usada diretamente (online) e ao sincronizar a caixa de saída (offline).
 */
export function applyWorkerOp(db: DB, op: WorkerOp, ctx: MCtx): void {
  switch (op.kind) {
    case 'clockIn': {
      if (openEntry(db, op.workerId, op.date)) return
      const a = todayAssignment(db, op.workerId, op.date)
      if (!a) throw new Error('Sem trabalho atribuído hoje')
      const id = ctx.uid('e')
      db.entries[id] = {
        id,
        workerId: op.workerId,
        siteId: a.siteId,
        date: op.date,
        clockIn: op.time,
        clockOut: null,
        breakMinutes: 0,
        breakStartedAt: null,
        source: 'ponto',
        status: 'aberto',
        corrections: [],
        rejectionReason: null,
        reviewedBy: null,
        approvedBy: null,
        note: '',
      }
      return
    }
    case 'startBreak': {
      const e = openEntry(db, op.workerId, op.date)
      if (e && !e.breakStartedAt) e.breakStartedAt = op.time
      return
    }
    case 'endBreak': {
      const e = openEntry(db, op.workerId, op.date)
      if (e?.breakStartedAt) {
        e.breakMinutes += Math.max(0, toMinutes(op.time) - toMinutes(e.breakStartedAt))
        e.breakStartedAt = null
      }
      return
    }
    case 'clockOut': {
      const e = openEntry(db, op.workerId, op.date)
      if (!e) return
      if (e.breakStartedAt) {
        e.breakMinutes += Math.max(0, toMinutes(op.time) - toMinutes(e.breakStartedAt))
        e.breakStartedAt = null
      }
      e.clockOut = op.time
      e.status = 'submetido'
      return
    }
    case 'requestAbsence': {
      if (!op.absence) return
      const id = op.absenceId ?? ctx.uid('ab')
      db.absences[id] = {
        id,
        workerId: op.workerId,
        type: op.absence.type,
        start: op.absence.start,
        end: op.absence.end,
        hours: op.absence.hours ?? null,
        status: 'pedido',
        reason: op.absence.reason,
        requestedAt: `${op.date}T${op.time}:00`,
        decidedBy: null,
        decidedAt: null,
        decisionNote: '',
      }
      return
    }
  }
}
