import { describe, expect, it } from 'vitest'
import { createSeed } from './index'

describe('fotos do seed', () => {
  const { db } = createSeed({ today: '2026-10-15' })
  const all = [
    ...Object.values(db.managers),
    ...Object.values(db.workers),
    ...Object.values(db.sites),
    ...Object.values(db.vehicles),
    ...Object.values(db.equipment),
  ]
  it('todas as pessoas, obras, viaturas e artigos têm foto de banco', () => {
    expect(all.filter((x) => x.photo?.kind !== 'banco').map((x) => x.id)).toEqual([])
  })
  it('nenhuma foto se repete', () => {
    const srcs = all.map((x) => (x.photo?.kind === 'banco' ? x.photo.src : ''))
    expect(new Set(srcs).size).toBe(srcs.length)
  })
  it('é determinístico', () => {
    const again = createSeed({ today: '2026-10-15' }).db
    expect(Object.values(again.workers).map((w) => w.photo)).toEqual(Object.values(db.workers).map((w) => w.photo))
  })
  it('o texto alternativo do retrato nomeia a pessoa fictícia', () => {
    const w = Object.values(db.workers)[0]!
    expect(w.photo?.alt).toBe(`Retrato de ${w.name}`)
  })
  it('cada obra recebe a foto com o seu id', () => {
    expect(db.sites.s3!.photo).toMatchObject({ src: 'obras/s3' })
    expect(db.vehicles.v11!.photo).toMatchObject({ src: 'viaturas/v11' })
    expect(db.equipment['eq-laser']!.photo).toMatchObject({ src: 'epi/eq-laser' })
  })
})
