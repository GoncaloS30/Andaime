import { describe, expect, it } from 'vitest'
import { activityCode, buildTimesheetRows, buildWeeklyMap } from './weeklyMap'
import { DEFAULT_SETTINGS } from './types'
import { assignment, db, entry, site, team, vehicle, worker } from '@/test/builders'

const WS = '2026-10-12'

function fixture() {
  const t = team({ id: 't1', name: 'Equipa Norte', foremanId: 'w1' })
  const s = site({ id: 's1', code: 'OB-1', name: 'Atlântida', clientId: 'c1' })
  const s2 = site({ id: 's2', code: 'OB-2', name: 'Douro', clientId: 'c2' })
  const v = vehicle({ id: 'v1', plate: 'AT-41-RQ' })
  const w1 = worker({ id: 'w1', name: 'Ana', number: '7001', category: 'Encarregado', teamId: 't1' })
  const w2 = worker({ id: 'w2', name: 'Bruno', number: '7002', teamId: 't1' })
  const assignments = [
    ...['2026-10-12', '2026-10-13', '2026-10-14'].flatMap((d) => [
      assignment({ workerId: 'w1', siteId: 's1', date: d, teamId: 't1', vehicleId: 'v1', isForeman: true }),
      assignment({ workerId: 'w2', siteId: 's1', date: d, teamId: 't1', vehicleId: 'v1', note: 'Betonagem laje 3' }),
    ]),
    assignment({ workerId: 'w2', siteId: 's2', date: '2026-10-15', teamId: 't1', start: '08:00', end: '12:00', hours: 4 }),
    assignment({ workerId: 'w2', siteId: 's1', date: '2026-10-20', teamId: 't1' }), // semana seguinte
  ]
  const data = db({ teams: [t], sites: [s, s2], vehicles: [v], workers: [w1, w2], assignments })
  data.clients = {
    c1: { id: 'c1', name: 'Cliente Um', nif: '', contactName: '', email: '', country: 'PT' },
    c2: { id: 'c2', name: 'Cliente Dois', nif: '', contactName: '', email: '', country: 'PT' },
  }
  data.weekNotes[WS] = { weekStart: WS, text: 'Levar andaimes' }
  return data
}

describe('buildWeeklyMap', () => {
  it('agrupa por equipa e obra com dias, viatura, horário e notas', () => {
    const map = buildWeeklyMap(fixture(), WS, {})
    expect(map.weekNumber).toBe(42)
    expect(map.note).toBe('Levar andaimes')
    expect(map.groups).toHaveLength(2)
    const g = map.groups[0]!
    expect(g).toMatchObject({
      teamName: 'Equipa Norte',
      siteCode: 'OB-1',
      clientName: 'Cliente Um',
      dates: ['2026-10-12', '2026-10-13', '2026-10-14'],
      vehicles: ['AT-41-RQ'],
      schedule: '08:00–17:00',
      foremanName: 'Ana',
      totalHours: 48,
      notes: ['Betonagem laje 3'],
    })
    expect(g.workers.map((w) => w.name)).toEqual(['Ana', 'Bruno'])
    expect(g.workers[1]!.hoursByDate['2026-10-13']).toBe(8)
    expect(map.totals).toEqual({ hours: 52, workers: 2, sites: 2, vehicles: 1 })
  })

  it('filtra por obra, cliente e trabalhador', () => {
    expect(buildWeeklyMap(fixture(), WS, { siteId: 's2' }).groups.map((g) => g.siteCode)).toEqual(['OB-2'])
    expect(buildWeeklyMap(fixture(), WS, { clientId: 'c2' }).totals.hours).toBe(4)
    const byWorker = buildWeeklyMap(fixture(), WS, { workerId: 'w1' })
    expect(byWorker.groups).toHaveLength(1)
    expect(byWorker.groups[0]!.workers.map((w) => w.name)).toEqual(['Ana'])
  })

  it('mapa vazio quando não há atribuições', () => {
    const map = buildWeeklyMap(fixture(), '2026-11-02', {})
    expect(map.groups).toEqual([])
    expect(map.totals.hours).toBe(0)
  })
})

describe('buildTimesheetRows', () => {
  it('usa horas realizadas válidas e calcula o código de atividade', () => {
    const data = fixture()
    data.entries = Object.fromEntries(
      [
        entry({ id: 'e1', workerId: 'w2', siteId: 's1', date: '2026-10-12', status: 'aprovado' }),
        entry({ id: 'e2', workerId: 'w2', siteId: 's1', date: '2026-10-13', clockOut: '18:00', status: 'revisto' }),
        entry({ id: 'e3', workerId: 'w2', siteId: 's1', date: '2026-10-14', clockOut: '19:00', status: 'submetido' }),
        entry({ id: 'e4', workerId: 'w1', siteId: 's1', date: '2026-10-12', status: 'rejeitado' }),
      ].map((e) => [e.id, e]),
    )
    const rows = buildTimesheetRows(data, WS, {}, DEFAULT_SETTINGS)
    expect(rows.map((r) => [r.workerNumber, r.date, r.hours, r.activityCode])).toEqual([
      ['7002', '2026-10-12', 8, '800'],
      ['7002', '2026-10-13', 9, '801'],
      ['7002', '2026-10-14', 10, '802'],
    ])
    expect(rows[0]!.siteCode).toBe('OB-1')
  })

  it('código de atividade: até 8 h normal, 9 h, acima disso extra; fim de semana é extra', () => {
    const codes = DEFAULT_SETTINGS.activityCodes
    expect(activityCode('2026-10-15', 8, codes)).toBe('800')
    expect(activityCode('2026-10-15', 8.5, codes)).toBe('801')
    expect(activityCode('2026-10-15', 9, codes)).toBe('801')
    expect(activityCode('2026-10-15', 9.5, codes)).toBe('802')
    expect(activityCode('2026-10-17', 4, codes)).toBe('802')
  })
})
