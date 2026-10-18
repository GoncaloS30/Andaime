import { normalizeSearch } from '@/domain/diary'
import { nightsBetween } from '@/domain/stays'
import type { Hotel, ID, ISODate, Stay } from '@/domain/types'
import { dateShort } from '@/domain/weeks'
import { pushUndo, type StoreApi } from '../api'
import { log, notify, stamp, uid } from '../helpers'
import type { DemoActions } from '../types'

export interface HotelInput {
  siteId: ID
  name: string
  address: string
  contact: string
  notes: string
}

export interface StayInput {
  workerId: ID
  siteId: ID
  week: ISODate
  hotelId: ID | null
  checkIn: ISODate
  checkOut: ISODate
  notes: string
}

export function lodgingActions(api: StoreApi): Pick<DemoActions, 'createHotel' | 'updateHotel' | 'removeHotel' | 'markStay' | 'removeStay'> {
  const { set, get, clock, snapshot } = api

  /** Dois hotéis com o mesmo nome na mesma obra seriam indistinguíveis na lista das dormidas. */
  const checkName = (siteId: ID, name: string, except?: ID) => {
    if (!name.trim()) throw new Error('Indique o nome do hotel')
    const clash = Object.values(get().db.hotels).some((h) => h.siteId === siteId && h.id !== except && normalizeSearch(h.name) === normalizeSearch(name))
    if (clash) throw new Error('Já existe um hotel com este nome nesta obra')
  }

  return {
    createHotel(input) {
      checkName(input.siteId, input.name)
      const site = get().db.sites[input.siteId]
      if (!site) throw new Error('Obra não encontrada')
      const snap = snapshot('Novo hotel')
      const id = uid('ht')
      set((s) => {
        pushUndo(s, snap)
        const h: Hotel = { id, siteId: input.siteId, name: input.name.trim(), address: input.address.trim(), contact: input.contact.trim(), notes: input.notes.trim(), createdAt: stamp(s.session, clock()) }
        s.db.hotels[id] = h
        log(s, clock(), 'alojamento', `Acrescentou o hotel ${h.name} à obra ${site.code}.`, { siteId: site.id })
      })
      return id
    },

    updateHotel(id, patch) {
      const h = get().db.hotels[id]
      if (!h) throw new Error('Hotel não encontrado')
      if (patch.name !== undefined) checkName(h.siteId, patch.name, id)
      const snap = snapshot('Editar hotel')
      set((s) => {
        pushUndo(s, snap)
        const x = s.db.hotels[id]!
        for (const k of ['name', 'address', 'contact', 'notes'] as const) if (patch[k] !== undefined) x[k] = patch[k]!.trim()
        log(s, clock(), 'alojamento', `Editou o hotel ${x.name}.`, { siteId: x.siteId })
      })
    },

    /** Tirar um hotel da obra não apaga as estadias: ficam com o hotel por definir. */
    removeHotel(id) {
      const h = get().db.hotels[id]
      if (!h) return
      const snap = snapshot('Remover hotel')
      set((s) => {
        pushUndo(s, snap)
        delete s.db.hotels[id]
        let affected = 0
        for (const st of Object.values(s.db.stays)) if (st.hotelId === id) { st.hotelId = null; affected++ }
        log(s, clock(), 'alojamento', `Removeu o hotel ${h.name}${affected ? `; ${affected === 1 ? '1 estadia ficou' : `${affected} estadias ficaram`} por definir` : ''}.`, { siteId: h.siteId })
      })
    },

    /** Marca (ou atualiza) a estadia: uma por pessoa, semana e obra. */
    markStay(input) {
      if (input.checkOut <= input.checkIn) throw new Error('A saída tem de ser depois da entrada')
      const { db } = get()
      const worker = db.workers[input.workerId]
      const site = db.sites[input.siteId]
      if (!worker || !site) throw new Error('Trabalhador ou obra não encontrados')
      const existing = Object.values(db.stays).find((x) => x.workerId === input.workerId && x.week === input.week && x.siteId === input.siteId)
      const snap = snapshot(existing ? 'Alterar estadia' : 'Marcar estadia')
      const id = existing?.id ?? uid('st')
      set((s) => {
        pushUndo(s, snap)
        const stay: Stay = { id, ...input, notes: input.notes.trim(), createdAt: existing?.createdAt ?? stamp(s.session, clock()) }
        s.db.stays[id] = stay
        const hotel = input.hotelId ? s.db.hotels[input.hotelId] : undefined
        const n = nightsBetween(input.checkIn, input.checkOut)
        const nights = n === 1 ? '1 noite' : `${n} noites`
        const where = hotel ? hotel.name : 'hotel por definir'
        log(s, clock(), 'alojamento', `${existing ? 'Alterou' : 'Marcou'} a estadia de ${worker.name} em ${site.code}: ${where}, ${nights}.`, { workerId: worker.id, siteId: site.id })
        notify(s, clock(), 'trabalhador', worker.id, 'Alojamento da semana', `${site.name}: ${where}, de ${dateShort(input.checkIn)} a ${dateShort(input.checkOut)} (${nights}).`, '/app/semana')
      })
      return id
    },

    removeStay(id) {
      const st = get().db.stays[id]
      if (!st) return
      const snap = snapshot('Remover estadia')
      set((s) => {
        pushUndo(s, snap)
        delete s.db.stays[id]
        log(s, clock(), 'alojamento', `Removeu a estadia de ${s.db.workers[st.workerId]?.name ?? 'um trabalhador'}.`, { workerId: st.workerId, siteId: st.siteId })
      })
    },
  }
}
