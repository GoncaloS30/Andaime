import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './types'
import { absence, db as makeDB, entry, site, worker } from '@/test/builders'
import { hrBookSheets, mergeHrRows, sheetName } from './hrBook'

describe('livro de horas do RH', () => {
  it('nome da folha: "Nome-Número", no máximo 31 caracteres e sem caracteres proibidos pelo Excel', () => {
    expect(sheetName('Rui Fontes', '1042')).toBe('Rui Fontes-1042')
    expect(sheetName('João [Encarregado] / Obra?', '7')).toBe('João Encarregado Obra-7')
    const long = sheetName('Maximiliano Bartolomeu Vasconcelos Ferreira', '1042')
    expect(long.length).toBeLessThanOrEqual(31)
    expect(long.endsWith('-1042')).toBe(true)
  })
  it('uma folha por pessoa; dias de ausência a 0 h com o motivo; dias sem nada não entram', () => {
    const d = makeDB({
      sites: [site({ id: 's1', code: 'OB-1', erpOrder: '41000274' })],
      workers: [worker({ id: 'w1', name: 'Ana', number: '1001' }), worker({ id: 'w2', name: 'Bruno', number: '1002' })],
      entries: [entry({ workerId: 'w1', siteId: 's1', date: '2026-10-12' }), entry({ workerId: 'w1', siteId: 's1', date: '2026-10-13', clockOut: '18:00' })],
      absences: [absence({ workerId: 'w1', type: 'ferias', start: '2026-10-15', end: '2026-10-19', status: 'aprovado' })],
    })
    const sheets = hrBookSheets(d, DEFAULT_SETTINGS, '2026-10')
    expect(sheets.map((s) => s.name)).toEqual(['Ana-1001'])
    const rows = sheets[0]!.rows
    expect(rows.map((r) => r.date)).toEqual(['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-16', '2026-10-19'])
    expect(rows[0]).toMatchObject({ hours: 8, order: '41000274', activity: '800', absence: '' })
    expect(rows[1]).toMatchObject({ hours: 9, activity: '801' })
    expect(rows[2]).toMatchObject({ hours: 0, order: '', absence: 'Férias' })
  })
  it('atualizar substitui só o período: repetir dá o mesmo resultado', () => {
    const old = [
      { date: '2026-09-30', hours: 8, order: 'A', activity: '800', absence: '' },
      { date: '2026-10-02', hours: 7, order: 'A', activity: '800', absence: '' },
    ]
    const fresh = [
      { date: '2026-10-02', hours: 8, order: 'A', activity: '800', absence: '' },
      { date: '2026-10-05', hours: 8, order: 'A', activity: '800', absence: '' },
    ]
    const once = mergeHrRows(old, fresh, '2026-10-01', '2026-10-31')
    expect(once.map((r) => `${r.date}:${r.hours}`)).toEqual(['2026-09-30:8', '2026-10-02:8', '2026-10-05:8'])
    expect(mergeHrRows(once, fresh, '2026-10-01', '2026-10-31')).toEqual(once)
  })
})
