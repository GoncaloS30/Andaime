// scripts/fotos.mjs — gera public/fotos/** e src/data/seed/photoManifest.ts a partir do manifesto.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import sharp from 'sharp'

const RATIO = { trabalhadores: 1, gestores: 1, obras: 16 / 9, viaturas: 4 / 3, epi: 1 }
// As mesmas larguras de sizeWidths() em src/domain/photos.ts.
const WIDTHS = (cat) => (cat === 'obras' ? { s: 320, c: 640, m: 1280 } : { s: 200, m: 800 })
const manifest = JSON.parse(await readFile('scripts/fotos.manifest.json', 'utf8'))
const out = { trabalhadores: [], gestores: [], obras: [], viaturas: [], epi: [] }

for (const f of manifest) {
  const ratio = RATIO[f.categoria]
  const widths = WIDTHS(f.categoria)
  const src = `${f.categoria}/${f.id}`
  let mDims = null
  for (const [size, w] of Object.entries(widths)) {
    const h = Math.round(w / ratio)
    const file = `public/fotos/${src}-${size}.webp`
    await mkdir(dirname(file), { recursive: true })
    // Retratos: recorte a partir de cima (a cabeça fica no terço superior). O resto: pela zona de mais interesse.
    // "recorte" = [x, y, largura, altura] em frações da imagem original, para os casos em que o automático falha.
    let img = sharp(f.original).rotate()
    if (f.recorte) {
      const meta = await sharp(f.original).rotate().metadata()
      const [x, y, rw, rh] = f.recorte
      img = sharp(await img.extract({ left: Math.round(x * meta.width), top: Math.round(y * meta.height), width: Math.round(rw * meta.width), height: Math.round(rh * meta.height) }).toBuffer())
    }
    const retrato = f.categoria === 'trabalhadores' || f.categoria === 'gestores'
    await img
      .resize(w, h, { fit: 'cover', position: f.foco ?? (retrato ? 'north' : 'attention') })
      .webp({ quality: size === 'm' ? 74 : 70 })
      .toFile(file)
    if (size === 'm') mDims = { w, h }
  }
  out[f.categoria].push({
    id: f.id,
    src,
    ...mDims,
    alt: f.alt,
    credit: `Foto: ${f.autor} / ${f.licenca.split(' ')[0]}`,
    ...(f.look ? { look: f.look } : {}),
  })
}

const ts = `// Gerado por scripts/fotos.mjs a partir de scripts/fotos.manifest.json. Não editar à mão.
export interface ManifestPhoto { id: string; src: string; w: number; h: number; alt: string; credit: string; look?: 'a' | 'b' }
export const PHOTOS: Record<'trabalhadores' | 'gestores' | 'obras' | 'viaturas' | 'epi', ManifestPhoto[]> = ${JSON.stringify(out, null, 2)}
`
await writeFile('src/data/seed/photoManifest.ts', ts)

await mkdir('public/fotos', { recursive: true })
const credits = [
  '# Créditos das fotos',
  '',
  'Fotos de banco com licença livre usadas na demonstração. As pessoas retratadas não têm qualquer relação com os nomes fictícios da demo.',
  '',
  '| Ficheiro | Autor | Licença | Origem |',
  '|---|---|---|---|',
  ...manifest.map((f) => `| ${f.categoria}/${f.id} | ${f.autor} | ${f.licenca} | ${f.url} |`),
]
await writeFile('public/fotos/CREDITOS.md', credits.join('\n') + '\n')
console.log(`${manifest.length} fotos processadas.`)
