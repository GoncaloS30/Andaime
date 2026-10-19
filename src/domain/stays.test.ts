import { describe, expect, it } from 'vitest'
import { absence, assignment, db as makeDB, site, worker } from '@/test/builders'
import { distanceKm, nightsBetween, proposedDates, stayBoard, staySummary } from './stays'
import type { Hotel, Stay } from './types'

const WEEK = '2026-10-12' // segunda
const hotel = (id: string, siteId: string): Hotel => ({ id, siteId, name: `Hotel ${id}`, address: '', contact: '', notes: '', createdAt: '2026-10-01T10:00:00' })
const stay = (p: Partial<Stay>): Stay => ({ id: 'st1', workerId: 'w1', siteId: 's1', hotelId: null, week: WEEK, checkIn: '2026-10-12', checkOut: '2026-10-16', notes: '', createdAt: '2026-10-10T10:00:00', ...p })

describe('dormidas', () => {
  it('as noites contam-se da entrada à saída: segunda a sexta são 4', () => {
    expect(nightsBetween('2026-10-12', '2026-10-16')).toBe(4)
    expect(nightsBetween('2026-10-12', '2026-10-12')).toBe(0)
  })
  it('datas propostas: entra na noite do primeiro dia, sai na manhã do último; um só dia leva 1 noite', () => {
    expect(proposedDates('2026-10-12', '2026-10-16')).toEqual({ checkIn: '2026-10-12', checkOut: '2026-10-16' })
    expect(proposedDates('2026-10-14', '2026-10-14')).toEqual({ checkIn: '2026-10-14', checkOut: '2026-10-15' })
  })
  it('distância entre cidades (Braga–Porto ≈ 50 km)', () => {
    expect(Math.round(distanceKm({ lat: 41.55, lng: -8.42 }, { lat: 41.15, lng: -8.61 }))).toBeGreaterThan(40)
    expect(Math.round(distanceKm({ lat: 41.55, lng: -8.42 }, { lat: 41.15, lng: -8.61 }))).toBeLessThan(60)
  })

  const base = () =>
    makeDB({
      sites: [site({ id: 's1', country: 'DE', lat: 48.11, lng: 11.56 }), site({ id: 's2', country: 'PT', lat: 41.56, lng: -8.4 })],
      workers: [worker({ id: 'w1', homeCity: 'Braga' }), worker({ id: 'w2', homeCity: 'Braga' }), worker({ id: 'w3', homeCity: 'Atlântida' })],
      assignments: [
        ...['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((d, i) => assignment({ id: `a${i}`, workerId: 'w1', siteId: 's1', date: d })),
        assignment({ id: 'b1', workerId: 'w2', siteId: 's2', date: '2026-10-13' }),
        assignment({ id: 'c1', workerId: 'w3', siteId: 's1', date: '2026-10-14' }),
        assignment({ id: 'c2', workerId: 'w3', siteId: 's1', date: '2026-10-15' }),
      ],
      absences: [absence({ id: 'ab', workerId: 'w3', start: '2026-10-15', end: '2026-10-15', status: 'aprovado' })],
    })

  it('quadro da semana: uma linha por pessoa e obra, só com os dias em que lá vai mesmo', () => {
    const db = base()
    const rows = stayBoard(db, WEEK)
    const w1 = rows.find((r) => r.workerId === 'w1')!
    expect(w1.days).toHaveLength(5)
    expect(w1.proposed).toEqual({ checkIn: '2026-10-12', checkOut: '2026-10-16' })
    // w3 tem ausência aprovada no dia 15: fica só o dia 14
    expect(rows.find((r) => r.workerId === 'w3')!.days).toEqual(['2026-10-14'])
  })
  it('longe de casa: outro país ou mais de 100 km; cidade sem coordenadas não sugere nada', () => {
    const rows = stayBoard(base(), WEEK)
    expect(rows.find((r) => r.workerId === 'w1')!.away).toBe('longe')
    expect(rows.find((r) => r.workerId === 'w2')!.away).toBe('perto')
    expect(rows.find((r) => r.workerId === 'w3')!.away).toBe('longe') // outro país chega
  })
  it('liga a estadia marcada à linha e encontra as órfãs', () => {
    const db = base()
    db.hotels = { h1: hotel('h1', 's1') }
    db.stays = { st1: stay({ hotelId: 'h1' }), st2: stay({ id: 'st2', workerId: 'w2', siteId: 's1' }) }
    const rows = stayBoard(db, WEEK)
    expect(rows.find((r) => r.workerId === 'w1')!.stay?.id).toBe('st1')
    expect(rows.find((r) => r.workerId === 'w1')!.hotels.map((h) => h.id)).toEqual(['h1'])
    const sum = staySummary(db, WEEK)
    expect(sum.orphans.map((s) => s.id)).toEqual(['st2'])
    expect(sum).toMatchObject({ away: 1, nights: 8, undecided: 1 })
  })
})
