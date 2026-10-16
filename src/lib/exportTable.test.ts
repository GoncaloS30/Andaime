import { describe, expect, it } from 'vitest'
import { toCSV } from './exportTable'

describe('toCSV', () => {
  it('usa ponto e vírgula, aspas quando preciso e vírgula decimal (Excel pt-PT)', () => {
    const csv = toCSV(
      [{ key: 'n', label: 'Nome' }, { key: 'h', label: 'Horas' }],
      [{ n: 'Obra "Atlântida"; Lisboa', h: 12.5 }, { n: 'Douro', h: 8 }],
    )
    expect(csv).toBe('﻿Nome;Horas\r\n"Obra ""Atlântida""; Lisboa";12,5\r\nDouro;8')
  })
})
