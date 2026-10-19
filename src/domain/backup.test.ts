import { describe, expect, it } from 'vitest'
import { makeBackup, parseBackup, uploadedPhotoIds } from './backup'

const db = {
  workers: { w1: { id: 'w1', photo: { kind: 'carregada', id: 'f1', alt: '', w: 1, h: 1 } }, w2: { id: 'w2', photo: { kind: 'banco', src: 'x', credit: '', alt: '', w: 1, h: 1 } } },
  diary: { d1: { photos: [{ kind: 'carregada', id: 'f2', alt: '', w: 1, h: 1 }, { kind: 'carregada', id: 'f1', alt: '', w: 1, h: 1 }] } },
}

describe('uploadedPhotoIds', () => {
  it('junta as fotos carregadas de todo o lado, sem repetir', () => {
    expect(uploadedPhotoIds(db).sort()).toEqual(['f1', 'f2'])
  })
})

describe('parseBackup', () => {
  const ok = JSON.stringify(makeBackup({ db: { workers: {} }, session: { role: 'gestor' } }, 7, '2026-10-19T10:00:00'))

  it('aceita uma cópia desta versão', () => {
    const r = parseBackup(ok, 7)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.backup.exportedAt).toBe('2026-10-19T10:00:00')
  })
  it('recusa texto que não é JSON', () => {
    expect(parseBackup('olá', 7)).toEqual({ ok: false, error: 'O ficheiro não é uma cópia do Andaime (não é JSON).' })
  })
  it('recusa JSON de outra coisa', () => {
    expect(parseBackup('{"a":1}', 7)).toEqual({ ok: false, error: 'O ficheiro não é uma cópia do Andaime.' })
  })
  it('recusa uma cópia de outra versão e diz qual', () => {
    const r = parseBackup(ok, 8)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/versão 7.*versão 8/)
  })
})
