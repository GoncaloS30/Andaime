import type { DiaryEntry } from './types'

/** Um registo leva no máximo 20 fotos: chega para um dia de obra e trava um disparate. */
export const MAX_DIARY_PHOTOS = 20

/** Pesquisa sem acentos nem maiúsculas: quem escreve à pressa não escreve "Betão". */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Do mais recente para o mais antigo; no mesmo dia, o último criado primeiro. */
function byRecent(a: DiaryEntry, b: DiaryEntry) {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
}

/** Registos filtrados por mês ("AAAA-MM") e por texto (título e texto, sem acentos). */
export function filterDiary(entries: DiaryEntry[], { month, query }: { month?: string | null; query?: string | null }): DiaryEntry[] {
  const q = query ? normalizeSearch(query) : ''
  return entries
    .filter((e) => !month || e.date.startsWith(month))
    .filter((e) => !q || normalizeSearch(`${e.title} ${e.text}`).includes(q))
    .sort(byRecent)
}

/** Meses com registos e quantos tem cada um, do mais recente para trás: os atalhos por cima da linha do tempo. */
export function diaryMonths(entries: DiaryEntry[]): { month: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e.date.slice(0, 7), (counts.get(e.date.slice(0, 7)) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, count]) => ({ month, count }))
}
