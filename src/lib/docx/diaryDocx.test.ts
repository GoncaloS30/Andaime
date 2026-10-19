// @vitest-environment node
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { buildDiaryDocx } from './diaryDocx'

const img = (w: number, h: number) => ({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), w, h, ext: 'jpeg' as const })

describe('Word do diário de obra', () => {
  it('gera um .docx com título, texto em parágrafos e as fotos sem deformar', async () => {
    const blob = await buildDiaryDocx({
      heading: 'OB-24-031 Edifício Atlântida',
      subtitle: 'Diário de obra · outubro de 2026',
      entries: [
        { date: '2026-10-14', title: 'Betonagem & <laje>', author: 'Ivo Monteiro', text: 'Linha 1\nLinha 2', images: [img(1600, 1200), img(900, 1600)] },
        { date: '2026-10-12', title: 'Cofragem', author: 'Marta', text: '', images: [] },
      ],
    })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const doc = await zip.file('word/document.xml')!.async('string')
    expect(doc).toContain('Betonagem &amp; &lt;laje&gt;')
    expect(doc).toContain('Linha 1')
    expect(doc).toContain('Linha 2')
    expect(doc.match(/<wp:inline/g)).toHaveLength(2)
    // 7 cm = 2 520 000 EMU no lado maior; a foto em retrato fica alta e estreita
    expect(doc).toContain('cx="2520000" cy="1890000"')
    expect(doc).toContain('cx="1417500" cy="2520000"')
    expect(Object.values(zip.files).filter((f) => !f.dir && f.name.startsWith('word/media/'))).toHaveLength(2)
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('image/jpeg')
  })
})
