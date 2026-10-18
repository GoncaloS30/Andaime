import { describe, expect, it } from 'vitest'
import { fitWithin, photoSrcSet, photoUrl, type PhotoRef } from './photos'

const banco: PhotoRef = { kind: 'banco', src: 'trabalhadores/t01', credit: 'Foto: A. Autor / Unsplash', alt: 'Retrato', w: 800, h: 800 }
const carregada: PhotoRef = { kind: 'carregada', id: 'ph-1', alt: 'Retrato', w: 1200, h: 900 }

describe('fotos', () => {
  it('URL de banco por tamanho', () => {
    expect(photoUrl(banco, 's')).toBe('/fotos/trabalhadores/t01-s.webp')
    expect(photoUrl(banco, 'm')).toBe('/fotos/trabalhadores/t01-m.webp')
  })
  it('foto carregada não tem URL estático', () => {
    expect(photoUrl(carregada, 'm')).toBeNull()
    expect(photoSrcSet(carregada)).toBeUndefined()
  })
  it('srcset com as larguras reais de cada tamanho', () => {
    expect(photoSrcSet(banco)).toBe('/fotos/trabalhadores/t01-s.webp 200w, /fotos/trabalhadores/t01-m.webp 800w')
  })
  it('capas têm um tamanho intermédio para telemóvel', () => {
    const capa: PhotoRef = { kind: 'banco', src: 'obras/s1', credit: 'c', alt: 'Obra', w: 1280, h: 720 }
    expect(photoSrcSet(capa)).toBe('/fotos/obras/s1-s.webp 320w, /fotos/obras/s1-c.webp 640w, /fotos/obras/s1-m.webp 1280w')
  })
  it('fitWithin reduz o lado maior sem deformar e nunca amplia', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 })
    expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 })
  })
})
