import { ABSENCE_TYPE } from '@/domain/labels'
import type { ID, TimeEntry, WorkerCategory } from '@/domain/types'
import { dateShort } from '@/domain/weeks'
import type { StoreApi } from '../api'
import { actorName, log, notify, plural } from '../helpers'
import type { DemoActions, DemoState, WorkerOp, WorkerOpKind } from '../types'
import { applyWorkerOp, todayAssignment } from '../workerOps'

const OP_LABEL: Record<WorkerOpKind, string> = {
  clockIn: 'Entrada',
  startBreak: 'Início de pausa',
  endBreak: 'Fim de pausa',
  clockOut: 'Saída',
  requestAbsence: 'Pedido de ausência',
}

const LEADERS: WorkerCategory[] = ['Encarregado', 'Chefe de equipa']

export function operationActions(api: StoreApi): Pick<
  DemoActions,
  | 'clockIn' | 'startBreak' | 'endBreak' | 'clockOut' | 'createManualEntry' | 'reviewEntries' | 'returnEntries'
  | 'approveEntries' | 'rejectEntries' | 'correctEntry' | 'confirmPresence' | 'requestAbsence' | 'createAbsence'
  | 'decideAbsence' | 'cancelAbsence' | 'updateDocument' | 'addDocument' | 'verifyDocument' | 'recordDelivery'
  | 'recordReturn' | 'reportIssue' | 'resolveIssue' | 'markNotificationsRead' | 'markNotificationRead'
  | 'setRole' | 'setPersona' | 'setOnline' | 'syncOutbox' | 'setFlag' | 'setSettings' | 'resetDemo'
> {
  const { set, get, clock, mctx } = api

  /** Efeitos laterais (histórico e notificações) de uma operação do trabalhador já aplicada. */
  function afterWorkerOp(s: DemoState, op: WorkerOp) {
    const w = s.db.workers[op.workerId]
    if (!w) return
    const actor = { name: w.name, role: 'trabalhador' as const }
    const site = todayAssignment(s.db, w.id, op.date)
    const where = site ? s.db.sites[site.siteId]?.code : ''
    switch (op.kind) {
      case 'clockIn':
        log(s, op.time, 'horas', `Registou entrada às ${op.time}${where ? ` em ${where}` : ''}.`, { workerId: w.id, siteId: site?.siteId }, actor)
        break
      case 'clockOut': {
        log(s, op.time, 'horas', `Registou saída às ${op.time}. Registo enviado para revisão.`, { workerId: w.id, siteId: site?.siteId }, actor)
        const team = w.teamId ? s.db.teams[w.teamId] : undefined
        if (team?.foremanId) notify(s, op.time, 'encarregado', team.foremanId, 'Novo registo por rever', `${w.name}: ${dateShort(op.date)}.`, '/encarregado/horas')
        break
      }
      case 'requestAbsence':
        if (op.absence) {
          log(s, op.time, 'ausencias', `Pediu ${ABSENCE_TYPE[op.absence.type].toLowerCase()} de ${dateShort(op.absence.start)} a ${dateShort(op.absence.end)}.`, { workerId: w.id }, actor)
          notify(s, op.time, 'gestor', null, 'Novo pedido de ausência', `${w.name}: ${ABSENCE_TYPE[op.absence.type]} de ${dateShort(op.absence.start)} a ${dateShort(op.absence.end)}.`, '/ausencias?estado=pedido')
        }
        break
      default:
        break
    }
  }

  function dispatchWorker(kind: WorkerOpKind, time?: string, extra: Partial<WorkerOp> = {}) {
    const s0 = get()
    const op: WorkerOp = {
      id: mctx().uid('op'),
      kind,
      workerId: s0.session.personas.trabalhador,
      date: s0.session.today,
      time: time ?? clock(),
      label: OP_LABEL[kind],
      ...extra,
    }
    if (!s0.session.online) {
      set((s) => {
        s.session.outbox.push(op)
      })
      return op
    }
    if (kind === 'clockIn' && !todayAssignment(s0.db, op.workerId, op.date)) throw new Error('Sem trabalho atribuído hoje')
    set((s) => {
      applyWorkerOp(s.db, op, mctx())
      afterWorkerOp(s, op)
    })
    return op
  }

  const setStatus = (ids: ID[], from: TimeEntry['status'][], fn: (e: TimeEntry, s: DemoState) => void) =>
    set((s) => {
      for (const id of ids) {
        const e = s.db.entries[id]
        if (e && from.includes(e.status)) fn(e, s)
      }
    })

  const workerNames = (s: DemoState, ids: ID[]) => {
    const names = [...new Set(ids.map((id) => s.db.workers[s.db.entries[id]?.workerId ?? '']?.name).filter(Boolean))]
    return names.length <= 2 ? names.join(' e ') : `${names.length} trabalhadores`
  }

  return {
    clockIn: (time) => void dispatchWorker('clockIn', time),
    startBreak: (time) => void dispatchWorker('startBreak', time),
    endBreak: (time) => void dispatchWorker('endBreak', time),
    clockOut: (time) => void dispatchWorker('clockOut', time),

    createManualEntry(input) {
      const id = mctx().uid('e')
      set((s) => {
        const byGestor = s.session.role === 'gestor'
        s.db.entries[id] = {
          id,
          workerId: input.workerId,
          siteId: input.siteId,
          date: input.date,
          clockIn: input.clockIn,
          clockOut: input.clockOut,
          breakMinutes: input.breakMinutes,
          breakStartedAt: null,
          source: byGestor ? 'manual' : 'encarregado',
          status: byGestor ? 'aprovado' : 'revisto',
          corrections: [],
          rejectionReason: null,
          reviewedBy: actorName(s.db, s.session),
          approvedBy: byGestor ? actorName(s.db, s.session) : null,
          note: input.note,
        }
        const w = s.db.workers[input.workerId]
        log(s, clock(), 'horas', `Registou horas de ${w?.name} em ${dateShort(input.date)} (${input.clockIn}–${input.clockOut}).`, { workerId: input.workerId, siteId: input.siteId })
        if (!byGestor) notify(s, clock(), 'gestor', null, 'Registo manual por aprovar', `${w?.name}: ${dateShort(input.date)}, registado pelo encarregado.`, '/horas?estado=revisto')
      })
      return id
    },

    reviewEntries(ids) {
      let n = 0
      setStatus(ids, ['submetido'], (e, s) => {
        e.status = 'revisto'
        e.reviewedBy = actorName(s.db, s.session)
        n++
      })
      if (n === 0) return
      set((s) => {
        log(s, clock(), 'horas', `Reviu ${plural(n, 'registo', 'registos')} de ${workerNames(s, ids)}.`, ids.length === 1 ? { workerId: s.db.entries[ids[0]!]?.workerId } : {})
        notify(s, clock(), 'gestor', null, 'Registos por aprovar', `${actorName(s.db, s.session)} reviu ${plural(n, 'registo', 'registos')}.`, '/horas?estado=revisto')
      })
    },

    returnEntries(ids, reason) {
      if (!reason.trim()) throw new Error('Indique o motivo da devolução')
      setStatus(ids, ['submetido', 'revisto'], (e) => {
        e.status = 'rejeitado'
        e.rejectionReason = reason.trim()
      })
      set((s) => {
        log(s, clock(), 'horas', `Devolveu ${plural(ids.length, 'registo', 'registos')} de ${workerNames(s, ids)}: ${reason.trim()}`)
        for (const id of ids) {
          const wid = s.db.entries[id]?.workerId
          if (wid === s.session.personas.trabalhador) notify(s, clock(), 'trabalhador', wid, 'Registo devolvido', reason.trim(), '/app/semana')
        }
      })
    },

    approveEntries(ids) {
      let n = 0
      setStatus(ids, ['submetido', 'revisto'], (e, s) => {
        e.status = 'aprovado'
        e.approvedBy = actorName(s.db, s.session)
        if (!e.reviewedBy) e.reviewedBy = actorName(s.db, s.session)
        n++
      })
      if (n === 0) return
      set((s) => {
        log(s, clock(), 'horas', `Aprovou ${plural(n, 'registo', 'registos')} de ${workerNames(s, ids)}.`, ids.length === 1 ? { workerId: s.db.entries[ids[0]!]?.workerId, siteId: s.db.entries[ids[0]!]?.siteId } : {})
        for (const id of ids) {
          const e = s.db.entries[id]
          if (e?.workerId === s.session.personas.trabalhador) notify(s, clock(), 'trabalhador', e.workerId, 'Horas aprovadas', `${dateShort(e.date)} aprovado.`, '/app/semana')
        }
      })
    },

    rejectEntries(ids, reason) {
      if (!reason.trim()) throw new Error('Indique o motivo da rejeição')
      setStatus(ids, ['submetido', 'revisto', 'aprovado'], (e) => {
        e.status = 'rejeitado'
        e.rejectionReason = reason.trim()
        e.approvedBy = null
      })
      set((s) => {
        log(s, clock(), 'horas', `Rejeitou ${plural(ids.length, 'registo', 'registos')} de ${workerNames(s, ids)}: ${reason.trim()}`)
        for (const id of ids) {
          const e = s.db.entries[id]
          if (!e) continue
          const team = s.db.workers[e.workerId]?.teamId ? s.db.teams[s.db.workers[e.workerId]!.teamId!] : undefined
          if (team?.foremanId) notify(s, clock(), 'encarregado', team.foremanId, 'Registo rejeitado', `${s.db.workers[e.workerId]?.name}, ${dateShort(e.date)}: ${reason.trim()}`, '/encarregado/horas')
          if (e.workerId === s.session.personas.trabalhador) notify(s, clock(), 'trabalhador', e.workerId, 'Registo rejeitado', reason.trim(), '/app/semana')
        }
      })
    },

    correctEntry(id, patch, reason) {
      if (!reason.trim()) throw new Error('Indique o motivo da correção')
      set((s) => {
        const e = s.db.entries[id]
        if (!e) return
        const fmt = (x: Pick<TimeEntry, 'clockIn' | 'clockOut' | 'breakMinutes' | 'siteId'>) =>
          `${x.clockIn}–${x.clockOut ?? '—'}, pausa ${x.breakMinutes} min, ${s.db.sites[x.siteId]?.code ?? ''}`
        const before = fmt(e)
        Object.assign(e, patch)
        e.corrections.push({ at: `${s.session.today}T${clock()}:00`, by: actorName(s.db, s.session), reason: reason.trim(), before, after: fmt(e) })
        const role = s.session.role
        e.status = role === 'trabalhador' ? 'submetido' : role === 'encarregado' ? 'revisto' : e.status === 'rejeitado' ? 'revisto' : e.status
        e.rejectionReason = null
        if (role !== 'trabalhador') e.reviewedBy = actorName(s.db, s.session)
        log(s, clock(), 'horas', `Corrigiu o registo de ${s.db.workers[e.workerId]?.name} de ${dateShort(e.date)}: ${reason.trim()}`, { workerId: e.workerId, siteId: e.siteId })
      })
    },

    confirmPresence(workerId, date, present) {
      set((s) => {
        const w = s.db.workers[workerId]
        const a = todayAssignment(s.db, workerId, date)
        if (!w || !a) return
        const existing = Object.values(s.db.entries).find((e) => e.workerId === workerId && e.date === date)
        if (present) {
          if (!existing) {
            const id = mctx().uid('e')
            s.db.entries[id] = {
              id, workerId, siteId: a.siteId, date, clockIn: a.start, clockOut: null, breakMinutes: 0, breakStartedAt: null,
              source: 'encarregado', status: 'aberto', corrections: [], rejectionReason: null, reviewedBy: null, approvedBy: null,
              note: 'Presença confirmada pelo encarregado',
            }
          }
          log(s, clock(), 'presencas', `Confirmou a presença de ${w.name} em ${s.db.sites[a.siteId]?.code}.`, { workerId, siteId: a.siteId })
        } else {
          const id = mctx().uid('ab')
          s.db.absences[id] = {
            id, workerId, type: 'falta_injustificada', start: date, end: date, hours: null, status: 'pedido',
            reason: `Falta reportada por ${actorName(s.db, s.session)}`, requestedAt: `${date}T${clock()}:00`,
            decidedBy: null, decidedAt: null, decisionNote: '',
          }
          log(s, clock(), 'presencas', `Reportou a falta de ${w.name} em ${s.db.sites[a.siteId]?.code}.`, { workerId, siteId: a.siteId })
          notify(s, clock(), 'gestor', null, 'Falta reportada', `${w.name} não compareceu em ${s.db.sites[a.siteId]?.code}.`, '/ausencias?estado=pedido')
        }
      })
    },

    requestAbsence(input, workerId) {
      const absenceId = mctx().uid('ab')
      const s0 = get()
      if (workerId && workerId !== s0.session.personas.trabalhador) {
        // pedido registado pelo gestor em nome de alguém
        set((s) => {
          s.db.absences[absenceId] = {
            id: absenceId, workerId, type: input.type, start: input.start, end: input.end, hours: input.hours ?? null,
            status: 'pedido', reason: input.reason, requestedAt: `${s.session.today}T${clock()}:00`, decidedBy: null, decidedAt: null, decisionNote: '',
          }
          log(s, clock(), 'ausencias', `Registou um pedido de ${ABSENCE_TYPE[input.type].toLowerCase()} para ${s.db.workers[workerId]?.name}.`, { workerId })
        })
        return absenceId
      }
      if (input.end < input.start) throw new Error('A data de fim é anterior à de início')
      dispatchWorker('requestAbsence', undefined, { absence: input, absenceId, label: `Pedido de ${ABSENCE_TYPE[input.type].toLowerCase()}` })
      return absenceId
    },

    createAbsence(input) {
      const id = mctx().uid('ab')
      set((s) => {
        s.db.absences[id] = {
          id, workerId: input.workerId, type: input.type, start: input.start, end: input.end, hours: input.hours ?? null,
          status: 'aprovado', reason: input.reason, requestedAt: `${s.session.today}T${clock()}:00`,
          decidedBy: actorName(s.db, s.session), decidedAt: `${s.session.today}T${clock()}:00`, decisionNote: 'Registada pelo gestor',
        }
        log(s, clock(), 'ausencias', `Registou ${ABSENCE_TYPE[input.type].toLowerCase()} de ${s.db.workers[input.workerId]?.name} (${dateShort(input.start)}–${dateShort(input.end)}).`, { workerId: input.workerId })
      })
      return id
    },

    decideAbsence(id, decision, note) {
      if (decision === 'rejeitado' && !note.trim()) throw new Error('Explique a recusa ao trabalhador')
      set((s) => {
        const a = s.db.absences[id]
        if (!a || a.status !== 'pedido') return
        a.status = decision
        a.decidedBy = actorName(s.db, s.session)
        a.decidedAt = `${s.session.today}T${clock()}:00`
        a.decisionNote = note.trim()
        const w = s.db.workers[a.workerId]
        const what = `${ABSENCE_TYPE[a.type]} de ${dateShort(a.start)} a ${dateShort(a.end)}`
        log(s, clock(), 'ausencias', `${decision === 'aprovado' ? 'Aprovou' : 'Recusou'} ${what.toLowerCase()} de ${w?.name}.`, { workerId: a.workerId })
        notify(s, clock(), 'trabalhador', a.workerId, decision === 'aprovado' ? 'Pedido aprovado' : 'Pedido recusado', decision === 'aprovado' ? what : `${what}. ${note.trim()}`, '/app/ausencias')
        const team = w?.teamId ? s.db.teams[w.teamId] : undefined
        if (decision === 'aprovado' && team?.foremanId) notify(s, clock(), 'encarregado', team.foremanId, 'Ausência na equipa', `${w?.name}: ${what}.`, '/encarregado')
      })
    },

    cancelAbsence(id) {
      set((s) => {
        const a = s.db.absences[id]
        if (!a) return
        delete s.db.absences[id]
        log(s, clock(), 'ausencias', `Cancelou ${ABSENCE_TYPE[a.type].toLowerCase()} de ${s.db.workers[a.workerId]?.name}.`, { workerId: a.workerId })
      })
    },

    updateDocument(id, patch) {
      set((s) => {
        const d = s.db.documents[id]
        if (!d) return
        const t = s.db.docTypes[d.typeId]
        const version = (d.versions.at(-1)?.version ?? 0) + 1
        d.expiresAt = patch.expiresAt
        if (patch.number) d.number = patch.number
        if (patch.fileName) d.fileName = patch.fileName
        d.issuedAt = s.session.today
        d.verification = s.session.role === 'gestor' ? 'verificado' : 'por_verificar'
        d.versions.push({ version, at: `${s.session.today}T${clock()}:00`, by: actorName(s.db, s.session), expiresAt: patch.expiresAt, note: patch.note?.trim() || 'Nova versão' })
        const owner = d.ownerType === 'trabalhador' ? s.db.workers[d.ownerId]?.name : d.ownerType === 'obra' ? s.db.sites[d.ownerId]?.code : 'empresa'
        log(s, clock(), 'documentos', `Atualizou ${t?.short} de ${owner} (versão ${version}).`, d.ownerType === 'trabalhador' ? { workerId: d.ownerId, documentId: id } : d.ownerType === 'obra' ? { siteId: d.ownerId, documentId: id } : { documentId: id })
      })
    },

    addDocument(input) {
      const id = mctx().uid('d')
      set((s) => {
        const t = s.db.docTypes[input.typeId]
        s.db.documents[id] = {
          id, ...input, fileName: input.fileName ?? `${t?.short ?? 'documento'}.pdf`,
          verification: s.session.role === 'gestor' ? 'verificado' : 'por_verificar',
          versions: [{ version: 1, at: `${s.session.today}T${clock()}:00`, by: actorName(s.db, s.session), expiresAt: input.expiresAt, note: 'Registo inicial' }],
        }
        const owner = input.ownerType === 'trabalhador' ? s.db.workers[input.ownerId]?.name : s.db.sites[input.ownerId]?.code
        log(s, clock(), 'documentos', `Registou ${t?.short} de ${owner ?? 'empresa'}.`, input.ownerType === 'trabalhador' ? { workerId: input.ownerId, documentId: id } : { siteId: input.ownerId, documentId: id })
      })
      return id
    },

    verifyDocument(id, verification) {
      set((s) => {
        const d = s.db.documents[id]
        if (!d) return
        d.verification = verification
        const t = s.db.docTypes[d.typeId]
        log(s, clock(), 'documentos', `${verification === 'verificado' ? 'Validou' : 'Rejeitou'} ${t?.short} de ${s.db.workers[d.ownerId]?.name ?? s.db.sites[d.ownerId]?.code ?? 'empresa'}.`, d.ownerType === 'trabalhador' ? { workerId: d.ownerId, documentId: id } : { documentId: id })
      })
    },

    recordDelivery(input) {
      const item = get().db.equipment[input.itemId]
      if (!item) throw new Error('Artigo não encontrado')
      if (item.stock < input.qty) throw new Error(`Só há ${item.stock} em stock`)
      const id = mctx().uid('dl')
      set((s) => {
        s.db.equipment[input.itemId]!.stock -= input.qty
        s.db.deliveries[id] = { id, ...input, status: 'entregue', returnedAt: null, by: actorName(s.db, s.session) }
        log(s, clock(), 'equipamento', `Entregou ${input.qty > 1 ? `${input.qty}× ` : ''}${item.name}${input.size ? ` (${input.size})` : ''} a ${s.db.workers[input.workerId]?.name}.`, { workerId: input.workerId })
      })
      return id
    },

    recordReturn(deliveryId, status, note) {
      set((s) => {
        const d = s.db.deliveries[deliveryId]
        if (!d) return
        d.status = status
        d.returnedAt = s.session.today
        if (note.trim()) d.note = note.trim()
        const item = s.db.equipment[d.itemId]
        if (status === 'devolvido' && item) item.stock += d.qty
        const verb = { devolvido: 'Registou a devolução de', danificado: 'Registou como danificado:', perdido: 'Registou como perdido:' }[status]
        log(s, clock(), 'equipamento', `${verb} ${item?.name} de ${s.db.workers[d.workerId]?.name}.`, { workerId: d.workerId })
      })
    },

    reportIssue(input) {
      if (!input.text.trim()) throw new Error('Descreva o problema')
      const id = mctx().uid('oc')
      set((s) => {
        s.db.issues[id] = { id, ...input, text: input.text.trim(), reportedBy: actorName(s.db, s.session), at: `${s.session.today}T${clock()}:00`, status: 'aberto' }
        const site = s.db.sites[input.siteId]
        log(s, clock(), 'ocorrencia', `Reportou um problema em ${site?.code}: ${input.text.trim()}`, { siteId: input.siteId })
        notify(s, clock(), 'gestor', null, `Problema em ${site?.code}`, input.text.trim(), `/obras/${input.siteId}?tab=historico`)
      })
      return id
    },

    resolveIssue(id) {
      set((s) => {
        const i = s.db.issues[id]
        if (!i) return
        i.status = 'resolvido'
        log(s, clock(), 'ocorrencia', `Marcou como resolvido: ${i.text}`, { siteId: i.siteId })
      })
    },

    markNotificationsRead() {
      set((s) => {
        const persona = s.session.personas[s.session.role]
        for (const n of s.db.notifications) if (n.role === s.session.role && (n.personaId === null || n.personaId === persona)) n.read = true
      })
    },

    markNotificationRead(id) {
      set((s) => {
        const n = s.db.notifications.find((x) => x.id === id)
        if (n) n.read = true
      })
    },

    // ── sessão ──
    setRole(role) {
      set((s) => {
        s.session.role = role
      })
    },

    setPersona(role, id) {
      set((s) => {
        if (role === 'encarregado' && !LEADERS.includes(s.db.workers[id]?.category ?? 'Servente')) return
        s.session.personas[role] = id
      })
    },

    setOnline(online) {
      set((s) => {
        s.session.online = online
      })
    },

    async syncOutbox() {
      if (get().session.syncing || get().session.outbox.length === 0) return
      set((s) => {
        s.session.syncing = true
      })
      while (get().session.outbox.length > 0) {
        if (api.syncDelayMs > 0) await new Promise((r) => setTimeout(r, api.syncDelayMs))
        set((s) => {
          const op = s.session.outbox[0]
          if (!op) return
          try {
            applyWorkerOp(s.db, op, mctx())
            afterWorkerOp(s, op)
          } catch {
            log(s, clock(), 'sincronizacao', `Não foi possível sincronizar: ${op.label.toLowerCase()} (${op.time}).`, { workerId: op.workerId })
          }
          s.session.outbox.shift()
        })
      }
      set((s) => {
        s.session.syncing = false
        log(s, clock(), 'sincronizacao', 'Operações pendentes sincronizadas.', { workerId: s.session.personas.trabalhador }, { name: s.db.workers[s.session.personas.trabalhador]?.name ?? 'Trabalhador', role: 'trabalhador' })
      })
    },

    setFlag(flag, value) {
      set((s) => {
        s.session.flags[flag] = value
      })
    },

    setSettings(patch) {
      set((s) => {
        s.session.settings = { ...s.session.settings, ...patch }
      })
    },

    resetDemo() {
      const fresh = api.freshState()
      set((s) => {
        const role = s.session.role
        s.db = fresh.db
        s.session = { ...fresh.session, role }
        s.undoStack = []
      })
    },
  }
}
