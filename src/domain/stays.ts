import { CITY_COORDS } from './cities'
import { absenceOn, buildIndex } from './indexes'
import type { DB, Hotel, ID, ISODate, Site, Stay, Worker } from './types'
import { addDays, weekDays } from './weeks'

/**
 * Dormidas: nesta semana, quem não vai dormir a casa? A resposta começa na escala (quem está em que obra
 * e em que dias) e acaba numa escolha de quem manda. A app propõe; não decide por ninguém.
 */

const DAY_MS = 86_400_000

/** Entrar segunda e sair sexta são quatro noites: conta-se de uma data à outra, não os dias tocados. */
export function nightsBetween(checkIn: ISODate, checkOut: ISODate): number {
  return Math.max(0, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / DAY_MS))
}

/** Entra na noite do primeiro dia de trabalho e sai na manhã do último; quem só lá vai um dia leva uma noite. */
export function proposedDates(first: ISODate, last: ISODate): { checkIn: ISODate; checkOut: ISODate } {
  return { checkIn: first, checkOut: last === first ? addDays(first, 1) : last }
}

/** Distância em linha reta (haversine), em km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Limite para sugerir "longe de casa". É só uma sugestão: quem marca é que decide. */
export const FAR_KM = 100

export type Away = 'longe' | 'perto' | 'desconhecido'

function awayFromHome(worker: Worker, site: Site): Away {
  if (site.country !== 'PT') return 'longe'
  const home = CITY_COORDS[worker.homeCity]
  if (!home) return 'desconhecido'
  return distanceKm(home, site) > FAR_KM ? 'longe' : 'perto'
}

export interface StayRow {
  workerId: ID
  siteId: ID
  /** Dias da semana em que a pessoa está mesmo na obra (sem ausências aprovadas). */
  days: ISODate[]
  proposed: { checkIn: ISODate; checkOut: ISODate }
  stay: Stay | undefined
  hotels: Hotel[]
  away: Away
}

const key = (workerId: ID, siteId: ID) => `${workerId}|${siteId}`

/** O quadro da semana: uma linha por pessoa e obra escalada, com a estadia marcada (se houver) e os hotéis da obra. */
export function stayBoard(db: DB, week: ISODate): StayRow[] {
  const idx = buildIndex(db)
  const days = new Set(weekDays(week))
  const groups = new Map<string, { workerId: ID; siteId: ID; days: Set<ISODate> }>()
  for (const a of Object.values(db.assignments)) {
    if (!days.has(a.date) || absenceOn(idx, a.workerId, a.date)) continue
    const k = key(a.workerId, a.siteId)
    const g = groups.get(k) ?? { workerId: a.workerId, siteId: a.siteId, days: new Set() }
    g.days.add(a.date)
    groups.set(k, g)
  }
  const stays = Object.values(db.stays).filter((s) => s.week === week)
  const hotelsBySite = new Map<ID, Hotel[]>()
  for (const h of Object.values(db.hotels)) hotelsBySite.set(h.siteId, [...(hotelsBySite.get(h.siteId) ?? []), h])
  const rows: StayRow[] = []
  for (const g of groups.values()) {
    const worker = db.workers[g.workerId]
    const site = db.sites[g.siteId]
    if (!worker || !site) continue
    const list = [...g.days].sort()
    rows.push({
      workerId: g.workerId,
      siteId: g.siteId,
      days: list,
      proposed: proposedDates(list[0]!, list[list.length - 1]!),
      stay: stays.find((s) => s.workerId === g.workerId && s.siteId === g.siteId),
      hotels: (hotelsBySite.get(g.siteId) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'pt')),
      away: awayFromHome(worker, site),
    })
  }
  const rank: Record<Away, number> = { longe: 0, desconhecido: 1, perto: 2 }
  return rows.sort(
    (a, b) =>
      rank[a.away] - rank[b.away] ||
      (db.sites[a.siteId]?.code ?? '').localeCompare(db.sites[b.siteId]?.code ?? '') ||
      (db.workers[a.workerId]?.name ?? '').localeCompare(db.workers[b.workerId]?.name ?? '', 'pt'),
  )
}

export interface StaySummary {
  /** Pessoas da escala com estadia marcada. */
  away: number
  nights: number
  /** Estadias com o hotel por definir. */
  undecided: number
  /** Estadias sem escala por trás (a linha foi apagada ou a pessoa mudou de obra). Não se apagam sozinhas. */
  orphans: Stay[]
}

export function staySummary(db: DB, week: ISODate, board: StayRow[] = stayBoard(db, week)): StaySummary {
  const stays = Object.values(db.stays).filter((s) => s.week === week)
  const matched = new Set(board.map((r) => r.stay?.id).filter(Boolean))
  return {
    away: board.filter((r) => r.stay).length,
    nights: stays.reduce((n, s) => n + nightsBetween(s.checkIn, s.checkOut), 0),
    undecided: stays.filter((s) => !s.hotelId).length,
    orphans: stays.filter((s) => !matched.has(s.id)).sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
  }
}
