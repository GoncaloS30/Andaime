import { describe, expect, it } from 'vitest'
import { docProblemOn, docState, latestDoc, requiredWorkerDocTypes } from './documents'
import { db, doc, docType } from '@/test/builders'

const TODAY = '2026-10-15'

describe('documents', () => {
  it('estado: válido, a expirar (≤30 dias), expirado, rejeitado, por verificar', () => {
    expect(docState(doc({ typeId: 't', ownerId: 'w', expiresAt: '2027-01-01' }), TODAY)).toBe('valido')
    expect(docState(doc({ typeId: 't', ownerId: 'w', expiresAt: '2026-11-14' }), TODAY)).toBe('a_expirar')
    expect(docState(doc({ typeId: 't', ownerId: 'w', expiresAt: '2026-10-14' }), TODAY)).toBe('expirado')
    expect(docState(doc({ typeId: 't', ownerId: 'w', verification: 'rejeitado' }), TODAY)).toBe('rejeitado')
    expect(docState(doc({ typeId: 't', ownerId: 'w', verification: 'por_verificar' }), TODAY)).toBe('por_verificar')
    expect(docState(doc({ typeId: 't', ownerId: 'w', expiresAt: null }), TODAY)).toBe('valido')
    expect(docState(undefined, TODAY)).toBe('em_falta')
  })

  it('escolhe a versão mais recente do documento do trabalhador', () => {
    const old = doc({ typeId: 'A1', ownerId: 'w1', issuedAt: '2024-01-01', expiresAt: '2025-01-01' })
    const recent = doc({ typeId: 'A1', ownerId: 'w1', issuedAt: '2026-01-01', expiresAt: '2028-01-01' })
    const other = doc({ typeId: 'A1', ownerId: 'w2', issuedAt: '2026-05-01' })
    expect(latestDoc(db({ documents: [old, recent, other] }), 'w1', 'A1')?.id).toBe(recent.id)
  })

  it('explica o problema na data de trabalho', () => {
    expect(docProblemOn(undefined, TODAY)).toBe('Não há registo deste documento')
    expect(docProblemOn(doc({ typeId: 't', ownerId: 'w', verification: 'rejeitado' }), TODAY)).toBe(
      'O documento foi rejeitado na verificação',
    )
    expect(docProblemOn(doc({ typeId: 't', ownerId: 'w', expiresAt: '2026-10-10' }), TODAY)).toBe('Expirou a 10 out')
    expect(docProblemOn(doc({ typeId: 't', ownerId: 'w', expiresAt: '2026-10-15' }), TODAY)).toBeNull()
  })

  it('lista os tipos obrigatórios para trabalhadores num país', () => {
    const types = [
      docType({ id: 'A1', countries: ['FR', 'BE', 'DE'] }),
      docType({ id: 'MED', countries: 'all' }),
      docType({ id: 'BTP', countries: ['FR'] }),
      docType({ id: 'OPT', countries: 'all', mandatory: false }),
      docType({ id: 'PSS', countries: 'all', appliesTo: 'obra' }),
    ]
    const data = db({ docTypes: types })
    expect(requiredWorkerDocTypes(data, 'FR').map((t) => t.id).sort()).toEqual(['A1', 'BTP', 'MED'])
    expect(requiredWorkerDocTypes(data, 'PT').map((t) => t.id)).toEqual(['MED'])
  })
})
