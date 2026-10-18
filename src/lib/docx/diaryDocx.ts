import JSZip from 'jszip'
import { fitWithin } from '@/domain/photos'
import { dateNumeric } from '@/domain/weeks'

/**
 * Diário de obra em Word (.docx), gerado no navegador. Um .docx é um zip com XML: a jszip chega,
 * sem bibliotecas novas. Feito para imprimir: A4, margens de 2 cm, letra pequena, fotos de 7 cm
 * lado a lado (sem deformar) e uma linha fina entre dias — um mês tem de caber em poucas folhas.
 */

export interface DocxImage {
  bytes: Uint8Array
  w: number
  h: number
  ext: 'jpeg' | 'png'
}

export interface DocxDiaryEntry {
  date: string
  title: string
  author: string
  text: string
  images: DocxImage[]
}

const EMU_PER_CM = 360_000
const BOX = 7 * EMU_PER_CM

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function run(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  const props = [opts.bold ? '<w:b/>' : '', opts.color ? `<w:color w:val="${opts.color}"/>` : '', `<w:sz w:val="${opts.size ?? 20}"/>`].join('')
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

function para(runs: string, opts: { spaceAfter?: number; border?: boolean; keepNext?: boolean } = {}) {
  const border = opts.border ? '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="6" w:color="DADCD5"/></w:pBdr>' : ''
  return `<w:p><w:pPr>${opts.keepNext ? '<w:keepNext/>' : ''}${border}<w:spacing w:after="${opts.spaceAfter ?? 80}"/></w:pPr>${runs}</w:p>`
}

function picture(rid: string, n: number, cx: number, cy: number) {
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Foto ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="foto${n}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
}

export async function buildDiaryDocx({ heading, subtitle, entries }: { heading: string; subtitle: string; entries: DocxDiaryEntry[] }): Promise<Blob> {
  const zip = new JSZip()
  const rels: string[] = []
  const body: string[] = [para(run(heading, { bold: true, size: 32 })), para(run(subtitle, { size: 20, color: '5C635E' }), { spaceAfter: 240 })]
  let n = 0

  entries.forEach((e, i) => {
    body.push(para(run(dateNumeric(e.date), { bold: true, size: 20, color: '13342A' }) + run(`  ·  ${e.title}`, { bold: true, size: 20 }), { keepNext: true, spaceAfter: 40 }))
    body.push(para(run(e.author, { size: 16, color: '5C635E' }), { spaceAfter: 60 }))
    // Um texto em três linhas aparece em três parágrafos.
    for (const line of e.text.split('\n').filter((l) => l.trim())) body.push(para(run(line)))
    // Fotos duas a duas: 2 × 7 cm cabem nos 17 cm úteis da página.
    for (let k = 0; k < e.images.length; k += 2) {
      const pics = e.images.slice(k, k + 2).map((img) => {
        n++
        const rid = `rIdImg${n}`
        zip.file(`word/media/foto${n}.${img.ext}`, img.bytes)
        rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/foto${n}.${img.ext}"/>`)
        const { w, h } = fitWithin(img.w, img.h, BOX)
        // fitWithin nunca amplia: para uma foto pequena, escalar até à caixa mantendo a proporção.
        const k2 = BOX / Math.max(w, h)
        return picture(rid, n, Math.round(w * k2), Math.round(h * k2))
      })
      body.push(para(pics.join(run('  ')), { spaceAfter: 80 }))
    }
    if (i < entries.length - 1) body.push(para('', { border: true, spaceAfter: 200 }))
  })

  const sect = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}${sect}</w:body></w:document>`,
  )
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  )
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}
