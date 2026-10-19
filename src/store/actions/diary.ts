import { MAX_DIARY_PHOTOS } from '@/domain/diary'
import type { PhotoRef } from '@/domain/photos'
import type { DiaryEntry, ID, ISODate } from '@/domain/types'
import { pushUndo, type StoreApi } from '../api'
import { actorName, log, notify, stamp, uid } from '../helpers'
import type { DemoActions } from '../types'

export interface DiaryInput {
  siteId: ID
  date: ISODate
  title: string
  text: string
  photos: PhotoRef[]
}

function validate(input: Partial<DiaryInput>) {
  if (input.title !== undefined && !input.title.trim()) throw new Error('Indique o título do registo')
  if (input.photos && input.photos.length > MAX_DIARY_PHOTOS) throw new Error(`Um registo leva no máximo ${MAX_DIARY_PHOTOS} fotos`)
}

export function diaryActions(api: StoreApi): Pick<DemoActions, 'createDiaryEntry' | 'updateDiaryEntry' | 'removeDiaryEntry'> {
  const { set, get, clock, snapshot } = api
  return {
    createDiaryEntry(input) {
      validate(input)
      const site = get().db.sites[input.siteId]
      if (!site) throw new Error('Obra não encontrada')
      const snap = snapshot('Novo registo no diário')
      const id = uid('dj')
      set((s) => {
        pushUndo(s, snap)
        const role = s.session.role
        const at = stamp(s.session, clock())
        const entry: DiaryEntry = {
          id,
          siteId: input.siteId,
          date: input.date,
          title: input.title.trim(),
          text: input.text.trim(),
          authorId: s.session.personas[role],
          authorName: actorName(s.db, s.session),
          authorRole: role,
          createdAt: at,
          updatedAt: at,
          photos: input.photos,
        }
        s.db.diary[id] = entry
        const fotos = entry.photos.length ? ` com ${entry.photos.length === 1 ? '1 foto' : `${entry.photos.length} fotos`}` : ''
        log(s, clock(), 'diario', `Registou no diário de ${site.code}: ${entry.title}${fotos}.`, { siteId: site.id })
        if (role !== 'gestor') notify(s, clock(), 'gestor', null, `Diário de obra · ${site.code}`, `${entry.authorName}: ${entry.title}${fotos}.`, `/obras/${site.id}?tab=diario`)
      })
      return id
    },

    updateDiaryEntry(id, patch) {
      validate(patch)
      const entry = get().db.diary[id]
      if (!entry) throw new Error('Registo não encontrado')
      const snap = snapshot('Editar registo do diário')
      set((s) => {
        pushUndo(s, snap)
        const e = s.db.diary[id]!
        if (patch.title !== undefined) e.title = patch.title.trim()
        if (patch.text !== undefined) e.text = patch.text.trim()
        if (patch.date !== undefined) e.date = patch.date
        if (patch.photos !== undefined) e.photos = patch.photos
        e.updatedAt = stamp(s.session, clock())
        log(s, clock(), 'diario', `Editou o registo "${e.title}" do diário.`, { siteId: e.siteId })
      })
    },

    removeDiaryEntry(id) {
      const entry = get().db.diary[id]
      if (!entry) return
      const snap = snapshot('Apagar registo do diário')
      set((s) => {
        pushUndo(s, snap)
        delete s.db.diary[id]
        log(s, clock(), 'diario', `Apagou o registo "${entry.title}" do diário.`, { siteId: entry.siteId })
      })
    },
  }
}
