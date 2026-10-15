import type { Country, DB, DocumentRec, DocumentType, ID, ISODate } from './types'
import { addDays, dateShort } from './weeks'

export const EXPIRY_WARNING_DAYS = 30

export type DocState = 'valido' | 'a_expirar' | 'expirado' | 'rejeitado' | 'por_verificar' | 'em_falta'

export const DOC_STATE_LABEL: Record<DocState, string> = {
  valido: 'Válido',
  a_expirar: 'A expirar',
  expirado: 'Expirado',
  rejeitado: 'Rejeitado',
  por_verificar: 'Por verificar',
  em_falta: 'Em falta',
}

export function docState(doc: DocumentRec | undefined, today: ISODate): DocState {
  if (!doc) return 'em_falta'
  if (doc.verification === 'rejeitado') return 'rejeitado'
  if (doc.expiresAt && doc.expiresAt < today) return 'expirado'
  if (doc.verification === 'por_verificar') return 'por_verificar'
  if (doc.expiresAt && doc.expiresAt <= addDays(today, EXPIRY_WARNING_DAYS)) return 'a_expirar'
  return 'valido'
}

export function latestDoc(db: DB, ownerId: ID, typeId: ID): DocumentRec | undefined {
  let best: DocumentRec | undefined
  for (const d of Object.values(db.documents)) {
    if (d.ownerId !== ownerId || d.typeId !== typeId) continue
    if (!best || d.issuedAt > best.issuedAt) best = d
  }
  return best
}

/** Explica porque é que o documento não serve na data indicada; null se serve. */
export function docProblemOn(doc: DocumentRec | undefined, date: ISODate): string | null {
  if (!doc) return 'Não há registo deste documento'
  if (doc.verification === 'rejeitado') return 'O documento foi rejeitado na verificação'
  if (doc.expiresAt && doc.expiresAt < date) return `Expirou a ${dateShort(doc.expiresAt)}`
  return null
}

const appliesIn = (t: DocumentType, country: Country) => t.countries === 'all' || t.countries.includes(country)

export function requiredWorkerDocTypes(db: DB, country: Country): DocumentType[] {
  return Object.values(db.docTypes).filter((t) => t.appliesTo === 'trabalhador' && t.mandatory && appliesIn(t, country))
}

export function requiredSiteDocTypes(db: DB, country: Country): DocumentType[] {
  return Object.values(db.docTypes).filter((t) => t.appliesTo === 'obra' && t.mandatory && appliesIn(t, country))
}

export interface ComplianceRow {
  type: DocumentType
  doc: DocumentRec | undefined
  state: DocState
  countries: Country[]
}

/** Documentos exigidos a um trabalhador pelos países onde trabalha (ou vai trabalhar) a partir de hoje. */
export function workerCompliance(db: DB, workerId: ID, today: ISODate): ComplianceRow[] {
  const countries = new Set<Country>(['PT'])
  for (const a of Object.values(db.assignments)) {
    if (a.workerId !== workerId || a.date < today) continue
    const s = db.sites[a.siteId]
    if (s) countries.add(s.country)
  }
  const rows = new Map<ID, ComplianceRow>()
  for (const c of countries) {
    for (const t of requiredWorkerDocTypes(db, c)) {
      const row = rows.get(t.id)
      if (row) row.countries.push(c)
      else {
        const doc = latestDoc(db, workerId, t.id)
        rows.set(t.id, { type: t, doc, state: docState(doc, today), countries: [c] })
      }
    }
  }
  // Documentos opcionais registados também aparecem.
  for (const d of Object.values(db.documents)) {
    if (d.ownerId !== workerId || rows.has(d.typeId)) continue
    const t = db.docTypes[d.typeId]
    if (!t) continue
    const doc = latestDoc(db, workerId, t.id)
    rows.set(t.id, { type: t, doc, state: docState(doc, today), countries: [] })
  }
  return [...rows.values()].sort((a, b) => a.type.name.localeCompare(b.type.name))
}
