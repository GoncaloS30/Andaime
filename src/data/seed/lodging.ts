import { stayBoard } from '@/domain/stays'
import type { DB, Hotel, ISODate, Stay } from '@/domain/types'
import { addDays, weekStart } from '@/domain/weeks'
import { PHOTOS } from './photoManifest'

/** Hotéis fictícios das obras longe de casa. As fotos vêm do manifesto (categoria "hoteis"), se houver. */
const HOTELS: { id: string; siteId: string; name: string; address: string; contact: string; notes: string }[] = [
  { id: 'ht1', siteId: 's4', name: 'Residencial Serra Algarvia', address: 'Rua do Cadoiço 12, Loulé', contact: '+351 289 000 112', notes: 'Pequeno-almoço incluído. Estacionamento para carrinhas.' },
  { id: 'ht2', siteId: 's5', name: 'Hôtel Les Deux Rives', address: '7 rue de la Charité, Lyon', contact: '+33 4 00 00 00 21', notes: 'Quartos duplos. 10 min a pé da obra.' },
  { id: 'ht3', siteId: 's5', name: 'Appart Perrache Sud', address: '22 cours Charlemagne, Lyon', contact: '+33 4 00 00 00 48', notes: 'Apartamentos com cozinha; bom para estadias longas.' },
  { id: 'ht4', siteId: 's6', name: 'Hôtel Voltaire Bastille', address: '41 rue Sedaine, Paris', contact: '+33 1 00 00 00 77', notes: 'Sem estacionamento: deixar a viatura no parque da obra.' },
  { id: 'ht5', siteId: 's7', name: 'Hôtel du Canal', address: 'Quai des Charbonnages 18, Bruxelles', contact: '+32 2 000 00 31', notes: '' },
  { id: 'ht6', siteId: 's8', name: 'Pension Isarblick', address: 'Thalkirchner Str. 90, München', contact: '+49 89 0000 0412', notes: 'Check-in até às 22h.' },
  { id: 'ht7', siteId: 's8', name: 'Hotel Sendling Ost', address: 'Plinganserstr. 15, München', contact: '+49 89 0000 0577', notes: 'Alternativa quando a pensão está cheia.' },
]

export function seedLodging(db: DB, today: ISODate): { hotels: Record<string, Hotel>; stays: Record<string, Stay> } {
  const hotels: Record<string, Hotel> = {}
  HOTELS.forEach((h, i) => {
    const p = PHOTOS.hoteis[i]
    hotels[h.id] = { ...h, createdAt: `${addDays(today, -60)}T10:00:00`, ...(p ? { photo: { kind: 'banco', src: p.src, credit: p.credit, alt: `Fachada do ${h.name}`, w: p.w, h: p.h } } : {}) }
  })
  const stays: Record<string, Stay> = {}
  const week = weekStart(today)
  const rows = stayBoard({ ...db, hotels, stays: {} }, week).filter((r) => r.away === 'longe' && r.hotels.length > 0)
  rows.forEach((r, i) => {
    const id = `st-${r.workerId}-${week}`
    // A primeira fica por definir (marca-se a necessidade, reserva-se depois); as outras alternam entre os hotéis da obra.
    stays[id] = { id, workerId: r.workerId, siteId: r.siteId, hotelId: i === 0 ? null : r.hotels[i % r.hotels.length]!.id, week, ...r.proposed, notes: '', createdAt: `${addDays(week, -3)}T16:00:00` }
  })
  // Uma estadia sem escala: a pessoa saiu da obra depois de a dormida estar marcada.
  const scheduled = new Set(rows.map((r) => r.workerId))
  const outsider = Object.values(db.workers).find((w) => w.status === 'ativo' && !scheduled.has(w.id))
  if (outsider) {
    const id = `st-${outsider.id}-${week}`
    stays[id] = { id, workerId: outsider.id, siteId: 's5', hotelId: 'ht2', week, checkIn: week, checkOut: addDays(week, 4), notes: 'Transferido para Braga na segunda; confirmar cancelamento.', createdAt: `${addDays(week, -5)}T11:00:00` }
  }
  return { hotels, stays }
}
