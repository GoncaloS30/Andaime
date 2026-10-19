import { describe, expect, it } from 'vitest'
import { deliverySheet, findItemByName } from './equipment'
import type { Delivery, EquipmentItem } from './types'

const item = (id: string, name: string, kind: EquipmentItem['kind'] = 'epi', serial = ''): EquipmentItem => ({ id, name, kind, sizeKind: null, stock: 5, serial })
const dl = (id: string, itemId: string, date: string, status: Delivery['status'] = 'entregue', workerId = 'w1'): Delivery => ({
  id, workerId, itemId, size: '', qty: 1, date, status, returnedAt: null, by: 'Gestor', note: '',
})

describe('findItemByName', () => {
  const items = { a: item('a', 'Capacete com francalete'), b: item('b', 'Botas de segurança S3') }
  it('encontra o artigo sem olhar a acentos, maiúsculas nem espaços', () => {
    expect(findItemByName(items, '  BOTAS de seguranca s3 ')?.id).toBe('b')
  })
  it('devolve null quando não existe', () => {
    expect(findItemByName(items, 'Luvas')).toBeNull()
  })
})

describe('deliverySheet', () => {
  const equipment = { a: item('a', 'Capacete'), b: item('b', 'Berbequim', 'ferramenta', 'BRB-0042'), c: item('c', 'Botas') }
  const deliveries = {
    d1: dl('d1', 'a', '2026-09-10'),
    d2: dl('d2', 'b', '2026-08-01'),
    d3: dl('d3', 'c', '2026-07-01', 'devolvido'),
    d4: dl('d4', 'a', '2026-09-01', 'entregue', 'w2'),
  }
  it('só lista o que a pessoa tem em seu poder, do mais antigo para o mais recente', () => {
    const rows = deliverySheet({ equipment, deliveries }, 'w1')
    expect(rows.map((r) => r.name)).toEqual(['Berbequim', 'Capacete'])
  })
  it('traz o n.º de série das ferramentas', () => {
    expect(deliverySheet({ equipment, deliveries }, 'w1')[0]!.serial).toBe('BRB-0042')
  })
})
