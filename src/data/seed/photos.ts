import type { PhotoRef } from '@/domain/photos'
import type { DB } from '@/domain/types'
import { PHOTOS, type ManifestPhoto } from './photoManifest'

/**
 * Nomes próprios do catálogo que recebem retratos do conjunto "b". É só verosimilhança
 * entre o nome fictício e o retrato de banco; os conjuntos seguem as descrições dos fotógrafos.
 */
const LOOK_B = new Set(['Ana', 'Sara', 'Patrícia'])

const ref = (p: ManifestPhoto, alt: string): PhotoRef => ({ kind: 'banco', src: p.src, credit: p.credit, alt, w: p.w, h: p.h })
const byId = <T extends { id: string }>(r: Record<string, T>) => Object.values(r).sort((a, b) => a.id.localeCompare(b.id, 'pt', { numeric: true }))
const find = (list: ManifestPhoto[], id: string) => list.find((p) => p.id === id)

/** Dá uma foto de banco a cada pessoa, obra, viatura e artigo do seed. Determinístico e sem repetições. */
export function assignSeedPhotos(db: DB): void {
  const pools = { a: PHOTOS.trabalhadores.filter((p) => p.look !== 'b'), b: PHOTOS.trabalhadores.filter((p) => p.look === 'b') }
  for (const w of byId(db.workers)) {
    const p = pools[LOOK_B.has(w.name.split(' ')[0]!) ? 'b' : 'a'].shift()
    if (p) w.photo = ref(p, `Retrato de ${w.name}`)
  }
  for (const m of Object.values(db.managers)) {
    const p = find(PHOTOS.gestores, m.id)
    if (p) m.photo = ref(p, `Retrato de ${m.name}`)
  }
  for (const s of Object.values(db.sites)) {
    const p = find(PHOTOS.obras, s.id)
    if (p) s.photo = ref(p, `Obra ${s.name}, em ${s.city}`)
  }
  for (const v of Object.values(db.vehicles)) {
    const p = find(PHOTOS.viaturas, v.id)
    if (p) v.photo = ref(p, `${v.make} ${v.model}`)
  }
  for (const e of Object.values(db.equipment)) {
    const p = find(PHOTOS.epi, e.id)
    if (p) e.photo = ref(p, e.name)
  }
}
