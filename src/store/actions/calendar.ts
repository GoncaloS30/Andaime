import { syncVacationsPlan } from '@/domain/agenda'
import type { CalendarEvent, HHMM, ISODate } from '@/domain/types'
import { addDays } from '@/domain/weeks'
import { pushUndo, type StoreApi } from '../api'
import { log, stamp, uid } from '../helpers'
import type { DemoActions } from '../types'

export interface EventInput {
  title: string
  date: ISODate
  endDate: ISODate
  time: HHMM | null
  location: string
}

/** Eventos de exemplo que "vêm" do Google quando se liga a conta (simulado, relativos a hoje). */
function sampleGoogleEvents(today: ISODate): CalendarEvent[] {
  const ev = (n: number, title: string, offset: number, time: HHMM | null, location: string): CalendarEvent => ({
    id: `g-amostra-${n}`, title, date: addDays(today, offset), endDate: addDays(today, offset), time, location, source: 'google',
  })
  return [
    ev(1, 'Reunião com o cliente — Résidence Les Terrasses', 3, '09:30', 'Lyon'),
    ev(2, 'Auditoria de segurança (empresa externa)', 8, '14:00', 'Escritório de Braga'),
    ev(3, 'Formação de trabalhos em altura', 13, '08:30', 'Centro de formação'),
  ]
}

export function calendarActions(api: StoreApi): Pick<DemoActions, 'createEvent' | 'removeEvent' | 'connectGoogle' | 'syncVacationsToGoogle'> {
  const { set, get, clock, snapshot } = api
  return {
    createEvent(input) {
      if (!input.title.trim()) throw new Error('Indique o título do evento')
      if (input.endDate < input.date) throw new Error('O fim tem de ser no mesmo dia ou depois do início')
      const snap = snapshot('Novo evento')
      const id = uid('ev')
      set((s) => {
        pushUndo(s, snap)
        s.db.events[id] = { id, ...input, title: input.title.trim(), location: input.location.trim(), source: 'andaime' }
        log(s, clock(), 'agenda', `Marcou na agenda: ${input.title.trim()}.`)
      })
      return id
    },

    removeEvent(id) {
      const e = get().db.events[id]
      if (!e) return
      const snap = snapshot('Apagar evento')
      set((s) => {
        pushUndo(s, snap)
        delete s.db.events[id]
        log(s, clock(), 'agenda', `Apagou da agenda: ${e.title}.`)
      })
    },

    /** Ligar mostra os eventos de exemplo da conta; desligar tira tudo o que veio do Google. Nunca pede credenciais. */
    connectGoogle(connected) {
      set((s) => {
        const g = s.db.integrations.google
        if (connected) {
          for (const e of sampleGoogleEvents(s.session.today)) s.db.events[e.id] = e
        } else {
          for (const e of Object.values(s.db.events)) if (e.source === 'google') delete s.db.events[e.id]
          g.syncedKeys = []
          g.lastSync = null
        }
        g.connected = connected
        log(s, clock(), 'integracoes', connected ? 'Ligou o Google Calendar (simulado).' : 'Desligou o Google Calendar (simulado).')
      })
    },

    /** Leva as férias aprovadas para o Google. Repetir dá o mesmo resultado: o que já foi não se duplica. */
    syncVacationsToGoogle() {
      if (!get().db.integrations.google.connected) throw new Error('Ligue primeiro a conta Google')
      const plan = syncVacationsPlan(get().db)
      set((s) => {
        for (const e of plan.create) s.db.events[e.id] = e
        const g = s.db.integrations.google
        g.syncedKeys = [...g.syncedKeys, ...plan.create.map((e) => e.syncKey!)]
        g.lastSync = stamp(s.session, clock())
        log(s, clock(), 'integracoes', `Sincronizou as férias com o Google: ${plan.create.length} novas, ${plan.existing} já lá estavam.`)
      })
      return { created: plan.create.length, existing: plan.existing }
    },
  }
}
