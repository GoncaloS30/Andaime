import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, downloadFile } from './http'

/** Contratos do diário de obra (F8.5). */

export const MAX_DIARY_PHOTOS = 20

export interface DiaryPhoto {
  id: string
  position: number
  /** URL autorizado na API (a foto nunca muda: substituir = apagar e carregar outra). */
  url: string
  contentType: string
  width: number | null
  height: number | null
}

export interface DiaryEntry {
  id: string
  siteId: string
  date: string
  title: string
  body: string
  author: { userId: string; name: string; role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'FOREMAN' }
  createdAt: string
  updatedAt: string
  version: number
  canEdit: boolean
  photos: DiaryPhoto[]
}

export interface DiaryPage {
  entries: DiaryEntry[]
  months: { month: string; count: number }[]
  total: number
  truncated: boolean
  canWrite: boolean
}

export interface RecentDiaryEntry {
  id: string
  siteId: string
  siteCode: string
  siteName: string
  siteColor: string
  date: string
  title: string
  authorName: string
  createdAt: string
  photoCount: number
  photos: DiaryPhoto[]
}

export interface DiaryFilters {
  month?: string | null
  q?: string
}

export const authorRoleLabel = (role: DiaryEntry['author']['role']) => (role === 'FOREMAN' ? 'Encarregado' : 'Direção de obra')

const monthFormat = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' })
/** "2026-10" → "outubro de 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return monthFormat.format(new Date(y, m - 1, 1))
}

const query = (f: DiaryFilters) => {
  const search = new URLSearchParams()
  if (f.month) search.set('month', f.month)
  if (f.q?.trim()) search.set('q', f.q.trim())
  const s = search.toString()
  return s ? `?${s}` : ''
}

const diaryPath = (orgId: string, siteId: string) => `/orgs/${orgId}/sites/${siteId}/diary`

export const useDiary = (orgId: string, siteId: string, filters: DiaryFilters, enabled = true) =>
  useQuery({
    queryKey: ['org', orgId, 'diary', siteId, filters],
    queryFn: () => api<DiaryPage>(`${diaryPath(orgId, siteId)}${query(filters)}`),
    placeholderData: keepPreviousData,
    enabled: enabled && !!siteId,
  })

export const useRecentDiary = (orgId: string, enabled = true) =>
  useQuery({
    queryKey: ['org', orgId, 'diary', 'recent'],
    queryFn: () => api<RecentDiaryEntry[]>(`/orgs/${orgId}/diary/recent?limit=6`),
    enabled,
  })

export interface DiaryEntryInput {
  date: string
  title: string
  body: string
}

/** Novas fotos (ficheiros já reduzidos no navegador) e fotos existentes a remover. */
export interface DiarySave {
  entry: DiaryEntry | null
  input: DiaryEntryInput
  add: File[]
  remove: string[]
  onProgress?: (done: number, total: number) => void
}

/**
 * Guarda um registo: cria ou altera o texto, envia as fotos novas uma a uma (cada uma com a sua chave, para repetir sem
 * duplicar) e remove as que saíram. Um erro a meio deixa o que já foi guardado e diz o que falhou.
 */
export function useSaveDiaryEntry(orgId: string, siteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ entry, input, add, remove, onProgress }: DiarySave) => {
      const base = `${diaryPath(orgId, siteId)}/entries`
      const saved = entry
        ? await api<DiaryEntry>(`${base}/${entry.id}`, { method: 'PATCH', body: { ...input, version: entry.version } })
        : await api<DiaryEntry>(base, { method: 'POST', body: { ...input, clientKey: crypto.randomUUID() } })
      for (const id of remove) await api<void>(`${base}/${saved.id}/photos/${id}`, { method: 'DELETE' })
      let result = saved
      for (let i = 0; i < add.length; i++) {
        onProgress?.(i, add.length)
        const form = new FormData()
        form.append('files', add[i]!)
        result = await api<DiaryEntry>(`${base}/${saved.id}/photos?clientKey=${crypto.randomUUID()}`, { method: 'POST', body: form })
      }
      onProgress?.(add.length, add.length)
      return result
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'diary'] }),
  })
}

export function useDeleteDiaryEntry(orgId: string, siteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) => api<void>(`${diaryPath(orgId, siteId)}/entries/${entryId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'diary'] }),
  })
}

export function exportDiary(orgId: string, siteId: string, kind: 'docx' | 'xlsx', filters: DiaryFilters) {
  return downloadFile(`${diaryPath(orgId, siteId)}/export.${kind}${query(filters)}`, `diario.${kind}`)
}

/**
 * Reduz uma foto do telemóvel para JPEG com o lado maior até 2048 px antes de enviar: o envio é mais rápido em obra,
 * a orientação da câmara fica aplicada e o servidor guarda sempre o mesmo formato. Se o navegador não conseguir ler a
 * imagem, envia o ficheiro original (o servidor valida o tipo pelo conteúdo).
 */
export async function shrinkPhoto(file: File, maxSide = 2048): Promise<File> {
  if (typeof createImageBitmap !== 'function') return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.type === 'image/jpeg' && file.size < 3 * 1024 * 1024) {
      bitmap.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
