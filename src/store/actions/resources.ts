import { produce } from 'immer'
import { detectConflicts } from '@/domain/conflicts'
import { formatHours } from '@/domain/hours'
import { SITE_STATUS, VEHICLE_STATUS } from '@/domain/labels'
import { newConflicts } from '@/domain/planning'
import type { Team, Worker } from '@/domain/types'
import { addDays, weekStart } from '@/domain/weeks'
import { seriesColor } from '@/domain/palette'
import { pushUndo, type StoreApi } from '../api'
import { log, notify } from '../helpers'
import { mCreateSite, mTeamVehicle } from '../mutations'
import type { DemoActions } from '../types'


export function resourceActions(api: StoreApi): Pick<
  DemoActions,
  | 'createSite' | 'updateSite' | 'createTeam' | 'updateTeam' | 'duplicateTeam' | 'createWorker' | 'updateWorker'
  | 'updateSizes' | 'previewTeamVehicle' | 'setTeamVehicle' | 'createVehicle' | 'updateVehicle'
> {
  const { set, get, clock, mctx, snapshot } = api
  const stampNow = () => `${get().session.today}T${clock()}:00`

  /** Garante que um trabalhador pertence a uma única equipa. */
  function moveMembers(s: { db: { teams: Record<string, Team>; workers: Record<string, Worker> } }, teamId: string, memberIds: string[]) {
    const team = s.db.teams[teamId]!
    const before = new Set(team.memberIds)
    for (const wid of memberIds) {
      const w = s.db.workers[wid]
      if (!w) continue
      if (w.teamId && w.teamId !== teamId) {
        const other = s.db.teams[w.teamId]
        if (other) {
          other.memberIds = other.memberIds.filter((m) => m !== wid)
          if (other.foremanId === wid) other.foremanId = null
          other.history.push({ at: stampNow(), text: `${w.name} saiu para ${team.name}.` })
        }
      }
      w.teamId = teamId
      w.usualVehicleId = team.vehicleId
      if (!before.has(wid)) team.history.push({ at: stampNow(), text: `${w.name} entrou na equipa.` })
    }
    for (const wid of team.memberIds) {
      if (!memberIds.includes(wid)) {
        const w = s.db.workers[wid]
        if (w) {
          w.teamId = null
          team.history.push({ at: stampNow(), text: `${w.name} saiu da equipa.` })
        }
      }
    }
    team.memberIds = [...memberIds]
    if (team.foremanId && !memberIds.includes(team.foremanId)) team.foremanId = null
  }

  return {
    createSite(input) {
      if (!input.name.trim()) throw new Error('Indique o nome da obra')
      const snap = snapshot('Criar obra')
      let id = ''
      set((s) => {
        pushUndo(s, snap)
        id = mCreateSite(s.db, input, mctx())
        const site = s.db.sites[id]!
        const team = input.teamId ? s.db.teams[input.teamId] : undefined
        log(s, clock(), 'obra', `Criou a obra ${site.code} ${site.name}${team ? ` com a equipa ${team.name}` : ''}.`, { siteId: id, teamId: team?.id })
        if (team) {
          team.history.push({ at: stampNow(), text: `Atribuída à obra ${site.code} ${site.name}.` })
          if (team.foremanId) notify(s, clock(), 'encarregado', team.foremanId, 'Nova obra', `${site.code} ${site.name} (${site.city}) a partir de ${site.startDate}.`, `/encarregado`)
        }
      })
      return id
    },

    updateSite(id, patch) {
      set((s) => {
        const site = s.db.sites[id]
        if (!site) return
        const changes: string[] = []
        if (patch.hourLimit !== undefined && patch.hourLimit !== site.hourLimit) {
          changes.push(`limite de horas de ${site.hourLimit === null ? 'sem limite' : formatHours(site.hourLimit)} para ${patch.hourLimit === null ? 'sem limite' : formatHours(patch.hourLimit)}`)
        }
        if (patch.status && patch.status !== site.status) changes.push(`estado para ${SITE_STATUS[patch.status].toLowerCase()}`)
        if (patch.foremanId !== undefined && patch.foremanId !== site.foremanId) changes.push(`encarregado para ${patch.foremanId ? s.db.workers[patch.foremanId]?.name : 'nenhum'}`)
        Object.assign(site, patch)
        log(s, clock(), 'obra', `Alterou ${site.code}${changes.length ? `: ${changes.join('; ')}` : ''}.`, { siteId: id })
      })
    },

    createTeam(input) {
      if (!input.name.trim()) throw new Error('Indique o nome da equipa')
      const snap = snapshot('Criar equipa')
      const id = mctx().uid('t')
      set((s) => {
        pushUndo(s, snap)
        s.db.teams[id] = {
          id,
          name: input.name.trim(),
          color: input.color || (input.siteId ? s.db.sites[input.siteId]?.color : undefined) || seriesColor(Object.keys(s.db.teams).length + 1),
          foremanId: null,
          memberIds: [],
          vehicleId: null,
          siteId: input.siteId,
          history: [{ at: stampNow(), text: 'Equipa criada.' }],
        }
        if (input.vehicleId) mTeamVehicle(s.db, id, input.vehicleId, s.session.today)
        moveMembers(s, id, input.memberIds)
        const team = s.db.teams[id]!
        if (input.foremanId && input.memberIds.includes(input.foremanId)) {
          team.foremanId = input.foremanId
          team.history.push({ at: stampNow(), text: `${s.db.workers[input.foremanId]?.name} definido como responsável.` })
        }
        log(s, clock(), 'equipa', `Criou a equipa ${team.name} com ${team.memberIds.length} elementos.`, { teamId: id })
      })
      return id
    },

    updateTeam(id, patch) {
      const snap = snapshot('Editar equipa')
      set((s) => {
        const team = s.db.teams[id]
        if (!team) return
        pushUndo(s, snap)
        if (patch.name && patch.name !== team.name) {
          team.history.push({ at: stampNow(), text: `Nome alterado de ${team.name} para ${patch.name}.` })
          team.name = patch.name
        }
        if (patch.color) team.color = patch.color
        if (patch.memberIds) moveMembers(s, id, patch.memberIds)
        if (patch.foremanId !== undefined && patch.foremanId !== team.foremanId) {
          if (patch.foremanId && !team.memberIds.includes(patch.foremanId)) moveMembers(s, id, [...team.memberIds, patch.foremanId])
          team.foremanId = patch.foremanId
          team.history.push({ at: stampNow(), text: patch.foremanId ? `${s.db.workers[patch.foremanId]?.name} definido como responsável.` : 'Equipa ficou sem responsável.' })
          // As atribuições futuras passam a marcar o novo responsável
          for (const a of Object.values(s.db.assignments)) {
            if (a.teamId === id && a.date >= s.session.today) a.isForeman = a.workerId === patch.foremanId
          }
          if (team.siteId) {
            const site = s.db.sites[team.siteId]
            if (site) site.foremanId = patch.foremanId
          }
        }
        if (patch.vehicleId !== undefined && patch.vehicleId !== team.vehicleId) {
          if (patch.vehicleId) mTeamVehicle(s.db, id, patch.vehicleId, s.session.today)
          else {
            const v = team.vehicleId ? s.db.vehicles[team.vehicleId] : undefined
            if (v) v.teamId = null
            team.vehicleId = null
          }
          team.history.push({ at: stampNow(), text: patch.vehicleId ? `Viatura ${s.db.vehicles[patch.vehicleId]?.plate} atribuída.` : 'Viatura retirada.' })
        }
        if (patch.siteId !== undefined && patch.siteId !== team.siteId) {
          team.siteId = patch.siteId
          team.history.push({ at: stampNow(), text: patch.siteId ? `Associada à obra ${s.db.sites[patch.siteId]?.code}.` : 'Sem obra associada.' })
        }
        log(s, clock(), 'equipa', `Atualizou a equipa ${team.name}.`, { teamId: id })
      })
    },

    duplicateTeam(id) {
      const src = get().db.teams[id]
      if (!src) throw new Error('Equipa não encontrada')
      const nid = mctx().uid('t')
      set((s) => {
        const n = Object.keys(s.db.teams).length
        s.db.teams[nid] = {
          id: nid,
          name: `${src.name} (cópia)`,
          color: seriesColor(n + 1),
          foremanId: null,
          memberIds: [],
          vehicleId: null,
          siteId: src.siteId,
          history: [{ at: stampNow(), text: `Criada a partir de ${src.name}. Escolha os elementos e a viatura.` }],
        }
        log(s, clock(), 'equipa', `Duplicou a equipa ${src.name}.`, { teamId: nid })
      })
      return nid
    },

    createWorker(input) {
      const id = mctx().uid('w')
      set((s) => {
        const numbers = Object.values(s.db.workers).map((w) => Number(w.number)).filter(Number.isFinite)
        const w: Worker = {
          ...input,
          id,
          number: input.number?.trim() || String(Math.max(7100, ...numbers) + 1),
          status: input.status ?? 'ativo',
        }
        s.db.workers[id] = w
        if (w.teamId) {
          const t = s.db.teams[w.teamId]
          if (t) {
            t.memberIds.push(id)
            t.history.push({ at: stampNow(), text: `${w.name} entrou na equipa.` })
          }
        }
        log(s, clock(), 'trabalhador', `Registou ${w.name} (${w.category}).`, { workerId: id })
      })
      return id
    },

    updateWorker(id, patch) {
      set((s) => {
        const w = s.db.workers[id]
        if (!w) return
        if (patch.teamId !== undefined && patch.teamId !== w.teamId) {
          const target = patch.teamId
          if (target) moveMembers(s, target, [...(s.db.teams[target]?.memberIds ?? []), id])
          else if (w.teamId) {
            const t = s.db.teams[w.teamId]!
            moveMembers(s, t.id, t.memberIds.filter((m) => m !== id))
          }
        }
        const statusChanged = patch.status && patch.status !== w.status
        const { teamId: _t, ...rest } = patch
        Object.assign(w, rest)
        log(s, clock(), 'trabalhador', statusChanged ? `Marcou ${w.name} como ${w.status}.` : `Atualizou a ficha de ${w.name}.`, { workerId: id })
      })
    },

    updateSizes(id, sizes) {
      set((s) => {
        const w = s.db.workers[id]
        if (!w) return
        w.sizes = { ...w.sizes, ...sizes }
        log(s, clock(), 'equipamento', `Atualizou os tamanhos de ${w.name}.`, { workerId: id })
      })
    },

    previewTeamVehicle(teamId, vehicleId, from) {
      const s = get()
      const range = { from, to: addDays(weekStart(from), 13) }
      const before = detectConflicts(s.db, range, s.session.today, s.session.settings)
      const after = detectConflicts(produce(s.db, (d) => mTeamVehicle(d, teamId, vehicleId, from)), range, s.session.today, s.session.settings)
      return newConflicts(before, after)
    },

    setTeamVehicle(teamId, vehicleId, from) {
      const snap = snapshot('Trocar viatura')
      set((s) => {
        pushUndo(s, snap)
        const team = s.db.teams[teamId]!
        const prev = team.vehicleId ? s.db.vehicles[team.vehicleId] : undefined
        mTeamVehicle(s.db, teamId, vehicleId, from)
        const v = s.db.vehicles[vehicleId]!
        team.history.push({ at: stampNow(), text: `Viatura ${v.plate} atribuída${prev ? ` (substitui ${prev.plate})` : ''}.` })
        log(s, clock(), 'viaturas', `Atribuiu ${v.plate} à equipa ${team.name} a partir de ${from}${prev ? `; ${prev.plate} fica livre` : ''}.`, { vehicleId, teamId })
        if (team.foremanId) notify(s, clock(), 'encarregado', team.foremanId, 'Viatura alterada', `A equipa ${team.name} passa a usar ${v.plate} (${v.make} ${v.model}).`, '/encarregado')
      })
    },

    createVehicle(input) {
      const id = mctx().uid('v')
      set((s) => {
        s.db.vehicles[id] = { ...input, id, teamId: null }
        log(s, clock(), 'viaturas', `Registou a viatura ${input.plate}.`, { vehicleId: id })
      })
      return id
    },

    updateVehicle(id, patch) {
      set((s) => {
        const v = s.db.vehicles[id]
        if (!v) return
        const msg = patch.status && patch.status !== v.status ? `${v.plate}: estado ${VEHICLE_STATUS[patch.status].toLowerCase()}.` : `Atualizou a viatura ${v.plate}.`
        Object.assign(v, patch)
        log(s, clock(), 'viaturas', msg, { vehicleId: id })
      })
    },
  }
}
