import type { PhotoRef } from '@/domain/photos'
import type { DB, DiaryEntry, ISODate } from '@/domain/types'
import { addDays, isWeekend } from '@/domain/weeks'
import { PHOTOS } from './photoManifest'

/** Registos-tipo de um diário de obra (fictícios). As fotos vêm do manifesto, se houver categoria "diario". */
const ENTRIES: { title: string; text: string; photos: number }[] = [
  { title: 'Betonagem da laje do piso 2', text: 'Betonagem concluída às 15h30, 42 m³ de betão C30/37.\nVibração e regularização sem incidentes. Cura com rega a partir de amanhã.', photos: 3 },
  { title: 'Montagem de cofragem', text: 'Cofragem dos pilares do eixo C montada e verificada pelo encarregado.\nFalta escorar a viga V12.', photos: 2 },
  { title: 'Armaduras inspecionadas', text: 'Visita da fiscalização às armaduras da laje.\nAprovado com uma correção: recobrimento nas vigas de bordadura.', photos: 2 },
  { title: 'Chuva — trabalhos parados à tarde', text: 'Chuva forte a partir das 14h. Equipa passou para trabalhos interiores (arrumação de estaleiro e marcações).', photos: 1 },
  { title: 'Alvenarias do piso 1', text: 'Fecho das alvenarias exteriores do alçado norte. Aberturas de janelas conforme projeto.', photos: 2 },
  { title: 'Entrega de material', text: 'Receção de 18 paletes de tijolo e 6 t de aço A500. Guias conferidas e arquivadas.', photos: 1 },
  { title: 'Reunião de obra', text: 'Reunião semanal com o dono de obra. Pedido de antecipação da cobertura em uma semana; a avaliar no planeamento.', photos: 0 },
  { title: 'Impermeabilização da cobertura', text: 'Aplicação da primeira demão de impermeabilização na cobertura do bloco A.', photos: 2 },
]

const AUTHOR_TIMES = ['17:10', '17:45', '18:05', '16:50']

/** Diário das últimas 3 semanas para as obras em curso: um registo a cada dois dias úteis, aproximadamente. */
export function seedDiary(db: DB, today: ISODate): Record<string, DiaryEntry> {
  const out: Record<string, DiaryEntry> = {}
  const pool = PHOTOS.diario
  let photoIdx = 0
  const sites = Object.values(db.sites).filter((s) => s.status === 'em_curso').sort((a, b) => a.id.localeCompare(b.id))
  sites.forEach((site, si) => {
    const author = site.foremanId ? db.workers[site.foremanId] : undefined
    const director = db.managers[site.directorId]
    let n = 0
    for (let back = 20; back >= 1; back--) {
      const date = addDays(today, -back)
      if (isWeekend(date) || (back + si) % 2 === 1) continue
      const spec = ENTRIES[(n + si * 3) % ENTRIES.length]!
      const byForeman = !!author && n % 3 !== 2
      const photos: PhotoRef[] = []
      for (let k = 0; k < spec.photos && pool.length; k++) {
        const p = pool[photoIdx++ % pool.length]!
        photos.push({ kind: 'banco', src: p.src, credit: p.credit, alt: `${spec.title} — foto ${k + 1}`, w: p.w, h: p.h })
      }
      const at = `${date}T${AUTHOR_TIMES[(n + si) % AUTHOR_TIMES.length]}:00`
      const id = `dj-${site.id}-${date}`
      out[id] = {
        id,
        siteId: site.id,
        date,
        title: spec.title,
        text: spec.text,
        authorId: byForeman ? author!.id : (director?.id ?? site.directorId),
        authorName: byForeman ? author!.name : (director?.name ?? 'Direção de obra'),
        authorRole: byForeman ? 'encarregado' : 'gestor',
        createdAt: at,
        updatedAt: at,
        photos,
      }
      n++
    }
  })
  return out
}
