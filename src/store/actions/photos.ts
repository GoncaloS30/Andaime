import type { PhotoRef } from '@/domain/photos'
import type { ActivityRefs, ID } from '@/domain/types'
import { pushUndo, type StoreApi } from '../api'
import { log } from '../helpers'
import type { DemoActions } from '../types'

export type PhotoTarget = { type: 'trabalhador' | 'gestor' | 'obra' | 'viatura' | 'artigo'; id: ID }

const COLLECTION = { trabalhador: 'workers', gestor: 'managers', obra: 'sites', viatura: 'vehicles', artigo: 'equipment' } as const

type WithPhoto = { photo?: PhotoRef; name?: string; plate?: string }

export function photoActions(api: StoreApi): Pick<DemoActions, 'setPhoto'> {
  const { set, get, clock, snapshot } = api
  return {
    setPhoto(target, photo) {
      const entity = get().db[COLLECTION[target.type]][target.id] as WithPhoto | undefined
      if (!entity) throw new Error('Registo não encontrado')
      const label = entity.name ?? entity.plate ?? target.id
      const snap = snapshot('Alterar foto')
      set((s) => {
        pushUndo(s, snap)
        const e = s.db[COLLECTION[target.type]][target.id] as WithPhoto
        if (photo) e.photo = photo
        else delete e.photo
        const refs: ActivityRefs =
          target.type === 'trabalhador' ? { workerId: target.id } : target.type === 'obra' ? { siteId: target.id } : target.type === 'viatura' ? { vehicleId: target.id } : {}
        log(s, clock(), 'foto', `${photo ? 'Alterou' : 'Removeu'} a foto de ${label}.`, refs)
      })
    },
  }
}
