import { normalizeSearch } from './diary'
import type { DB, EquipmentItem, EquipmentKind, ID, ISODate } from './types'

/** Artigo do catálogo com este nome, comparado sem acentos, maiúsculas nem espaços nas pontas. */
export function findItemByName(items: Record<ID, EquipmentItem>, name: string): EquipmentItem | null {
  const key = normalizeSearch(name)
  return Object.values(items).find((i) => normalizeSearch(i.name) === key) ?? null
}

export const SHEET_HEADER = ['Data', 'Artigo', 'Tipo', 'Tamanho', 'Qtd.', 'N.º de série'] as const
export const KIND_LABEL: Record<EquipmentKind, string> = { fardamento: 'Fardamento', epi: 'EPI', ferramenta: 'Ferramenta' }
export const SHEET_DECLARATION =
  'Declaro que recebi os artigos acima, em bom estado, e que me comprometo a usá-los nas tarefas a que se destinam e a devolvê-los quando me forem pedidos.'

export interface SheetRow {
  deliveryId: ID
  date: ISODate
  name: string
  kind: EquipmentKind
  size: string
  qty: number
  serial: string
}

/** Folha de entrega: o que a pessoa tem em seu poder (estado "entregue"), do mais antigo para o mais recente. */
export function deliverySheet(db: Pick<DB, 'deliveries' | 'equipment'>, workerId: ID): SheetRow[] {
  return Object.values(db.deliveries)
    .filter((d) => d.workerId === workerId && d.status === 'entregue')
    .map((d) => {
      const item = db.equipment[d.itemId]
      return { deliveryId: d.id, date: d.date, name: item?.name ?? '—', kind: item?.kind ?? 'epi', size: d.size, qty: d.qty, serial: item?.serial ?? '' }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'pt'))
}
