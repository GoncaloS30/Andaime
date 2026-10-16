// scripts/folha-de-contacto.mjs — página com todas as fotos tratadas, para aprovação antes de integrar.
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile('scripts/fotos.manifest.json', 'utf8'))
const cats = [...new Set(manifest.map((f) => f.categoria))]
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const grade = 'filter:saturate(.88) contrast(1.04)'
const html = `<!doctype html><html lang="pt-PT"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Folha de contacto — fotos do Andaime</title>
<style>body{font:14px system-ui;background:#f5f5f0;color:#1f2421;margin:24px}h2{margin:24px 0 8px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
figure{margin:0;background:#fff;border:1px solid #dadcd5;border-radius:8px;overflow:hidden}
.v{position:relative}.v img{display:block;width:100%;${grade}}.v::after{content:'';position:absolute;inset:0;background:#13342a;opacity:.06;mix-blend-mode:multiply}
figcaption{padding:6px 8px;font-size:12px}</style>
<h1>Folha de contacto — fotos do Andaime</h1>
<p>${manifest.length} fotos, já com o tratamento de cor da marca.</p>
${cats
  .map(
    (c) =>
      `<h2>${c}</h2><div class="g">${manifest
        .filter((f) => f.categoria === c)
        .map(
          (f) =>
            `<figure><div class="v"><img src="../../public/fotos/${c}/${f.id}-m.webp" alt="${esc(f.alt)}"></div><figcaption><b>${f.id}</b>${f.look ? ` · ${f.look}` : ''}<br>${esc(f.alt)}<br><small>${esc(f.autor)} · ${esc(f.licenca)}</small></figcaption></figure>`,
        )
        .join('')}</div>`,
  )
  .join('')}</html>`
await mkdir('docs/review', { recursive: true })
await writeFile('docs/review/fotos-folha.html', html)
console.log('docs/review/fotos-folha.html')
