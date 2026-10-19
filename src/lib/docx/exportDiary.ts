import { photoUrl, type PhotoRef } from '@/domain/photos'
import type { DiaryEntry, Site } from '@/domain/types'
import { dateNumeric } from '@/domain/weeks'
import { download, downloadXLSX } from '@/lib/exportTable'
import { photoStore } from '@/lib/photos/photoStore'
import type { DocxImage } from './diaryDocx'

/** O Word não lê WebP: as fotos de banco passam a JPEG num canvas; as carregadas já são JPEG. */
async function photoBytes(ref: PhotoRef): Promise<DocxImage | null> {
  try {
    if (ref.kind === 'carregada') {
      const blob = await photoStore.get(ref.id)
      return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), w: ref.w, h: ref.h, ext: 'jpeg' } : null
    }
    const res = await fetch(photoUrl(ref, 'm')!)
    const bmp = await createImageBitmap(await res.blob())
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    canvas.getContext('2d')!.drawImage(bmp, 0, 0)
    const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    const out = jpeg ? { bytes: new Uint8Array(await jpeg.arrayBuffer()), w: bmp.width, h: bmp.height, ext: 'jpeg' as const } : null
    bmp.close()
    return out
  } catch {
    // Uma foto que não se lê não deita a exportação abaixo: o registo sai sem ela.
    return null
  }
}

const fileBase = (site: Site, scope: string) => `diario-${site.code}${scope ? `-${scope}` : ''}`

/** Exporta os registos visíveis (respeita o mês e a pesquisa escolhidos) para Word, com fotos. */
export async function exportDiaryWord(site: Site, entries: DiaryEntry[], scopeLabel: string, scope: string) {
  const { buildDiaryDocx } = await import('./diaryDocx')
  const withImages = await Promise.all(
    entries.map(async (e) => ({
      date: e.date,
      title: e.title,
      author: `${e.authorName} · ${e.authorRole === 'gestor' ? 'Direção de obra' : 'Encarregado'}`,
      text: e.text,
      images: (await Promise.all(e.photos.map(photoBytes))).filter((x): x is DocxImage => !!x),
    })),
  )
  const blob = await buildDiaryDocx({ heading: `${site.code} ${site.name}`, subtitle: `Diário de obra · ${scopeLabel} · ${site.city}`, entries: withImages })
  download(blob, `${fileBase(site, scope)}.docx`)
}

export async function exportDiaryExcel(site: Site, entries: DiaryEntry[], scope: string) {
  await downloadXLSX(
    fileBase(site, scope),
    `Diário ${site.code}`,
    [
      { key: 'data', label: 'Data' },
      { key: 'titulo', label: 'Título' },
      { key: 'texto', label: 'Texto' },
      { key: 'autor', label: 'Autor' },
      { key: 'fotos', label: 'Fotos' },
    ],
    entries.map((e) => ({ data: dateNumeric(e.date), titulo: e.title, texto: e.text, autor: e.authorName, fotos: e.photos.length })),
  )
}
