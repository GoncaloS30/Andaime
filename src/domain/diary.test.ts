import { describe, expect, it } from 'vitest'
import { diaryMonths, filterDiary, MAX_DIARY_PHOTOS, normalizeSearch } from './diary'
import type { DiaryEntry } from './types'

const e = (id: string, date: string, title: string, text = ''): DiaryEntry => ({
  id, siteId: 's1', date, title, text, authorId: 'w1', authorName: 'Ivo', authorRole: 'encarregado', createdAt: `${date}T17:00:00`, updatedAt: `${date}T17:00:00`, photos: [],
})
const list = [e('a', '2026-10-14', 'Betonagem da laje', 'Piso 2, betão C30/37'), e('b', '2026-09-30', 'Cofragem'), e('c', '2026-10-02', 'Armaduras', 'Inspeção do fiscal'), e('d', '2026-10-14', 'Chuva', 'Trabalhos parados à tarde')]

describe('diário de obra', () => {
  it('pesquisa sem acentos nem maiúsculas', () => {
    expect(normalizeSearch('Betão Inspeção')).toBe('betao inspecao')
    expect(filterDiary(list, { query: 'betao' }).map((x) => x.id)).toEqual(['a'])
    expect(filterDiary(list, { query: 'INSPECAO' }).map((x) => x.id)).toEqual(['c'])
  })
  it('do mais recente para o mais antigo; no mesmo dia, o último criado primeiro', () => {
    const l = [{ ...list[0]!, createdAt: '2026-10-14T09:00:00' }, list[1]!, list[2]!, { ...list[3]!, createdAt: '2026-10-14T18:00:00' }]
    expect(filterDiary(l, {}).map((x) => x.id)).toEqual(['d', 'a', 'c', 'b'])
  })
  it('filtra por mês', () => {
    expect(filterDiary(list, { month: '2026-09' }).map((x) => x.id)).toEqual(['b'])
  })
  it('meses com registos e contagem, do mais recente para trás', () => {
    expect(diaryMonths(list)).toEqual([{ month: '2026-10', count: 3 }, { month: '2026-09', count: 1 }])
  })
  it('limite de fotos por registo', () => {
    expect(MAX_DIARY_PHOTOS).toBe(20)
  })
})
