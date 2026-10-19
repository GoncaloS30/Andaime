import { describe, expect, it } from 'vitest'
import { absence, db as makeDB, site, worker } from '@/test/builders'
import { agendaItems, itemsOnDay, monthGrid, syncVacationsPlan } from './agenda'

describe('agenda', () => {
  it('grelha do mês de segunda a domingo, com os dias dos meses vizinhos', () => {
    const g = monthGrid('2026-10')
    expect(g[0]![0]).toBe('2026-09-28')
    expect(g.at(-1)!.at(-1)).toBe('2026-11-01')
    expect(g.every((w) => w.length === 7)).toBe(true)
  })
  const base = () =>
    makeDB({
      workers: [worker({ id: 'w1', name: 'Ana Silva' })],
      sites: [site({ id: 's1', code: 'OB-1', startDate: '2026-10-05', endDate: '2026-12-20', contractEnd: '2026-12-15' })],
      absences: [absence({ id: 'a1', workerId: 'w1', start: '2026-10-12', end: '2026-10-16', status: 'aprovado' })],
    })
  it('junta as camadas: ausências aprovadas, datas da obra e eventos', () => {
    const db = base()
    db.events = { e1: { id: 'e1', title: 'Reunião', date: '2026-10-20', endDate: '2026-10-20', time: '10:00', location: '', source: 'andaime' } }
    const items = agendaItems(db, '2026-10-01', '2026-12-31', { ausencias: true, obras: true, validades: false, eventos: true, google: false })
    expect(items.map((i) => i.kind)).toEqual(expect.arrayContaining(['ausencia', 'obra', 'evento']))
    expect(items.find((i) => i.kind === 'obra' && i.title.includes('Fim contratual'))!.start).toBe('2026-12-15')
    // um evento de vários dias aparece em cada dia que atravessa
    expect(itemsOnDay(items, '2026-10-14').some((i) => i.id === 'aus-a1')).toBe(true)
    expect(itemsOnDay(items, '2026-10-17').some((i) => i.id === 'aus-a1')).toBe(false)
  })
  it('desligar uma camada tira-a da agenda', () => {
    const items = agendaItems(base(), '2026-10-01', '2026-10-31', { ausencias: false, obras: true, validades: false, eventos: true, google: false })
    expect(items.some((i) => i.kind === 'ausencia')).toBe(false)
  })
  it('sincronizar férias com o Google não duplica: só cria o que ainda não foi', () => {
    const db = base()
    expect(syncVacationsPlan(db).create.map((e) => e.syncKey)).toEqual(['ferias:a1'])
    db.integrations.google.syncedKeys = ['ferias:a1']
    expect(syncVacationsPlan(db)).toMatchObject({ create: [], existing: 1 })
  })
})
