# Bloco 1 — Base das fotos: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar fotos a trabalhadores, gestores, obras, viaturas e artigos de EPI, enquadradas no design do Andaime. Inclui fotos de banco no seed, carregamento de fotos pelo utilizador e aplicação das fotos em toda a app.

**Architecture:**
- **Tipo e regras:** um tipo `PhotoRef` no domínio e funções puras de URL e dimensões.
- **Fotos de banco:** um pipeline de build (`scripts/fotos.mjs` com `sharp`) gera os WebP em `public/fotos` e um manifesto TypeScript que o seed consome.
- **Fotos carregadas:** são reduzidas no navegador e guardadas no IndexedDB, num módulo com alternativa em memória.
- **Apresentação:** um único componente `<Photo>` aplica formatos, tratamento de cor e alternativas, e todos os ecrãs o usam (o `Avatar` passa a delegar nele).

**Tech Stack:**
- React 19 e TypeScript strict, Tailwind v4, Zustand com immer;
- Vitest com jsdom e `fake-indexeddb`;
- Playwright (Edge);
- `sharp` (só em dev, no script).

**Spec:** `docs/superpowers/specs/2026-10-16-andaime-lyrical-fotos-design.md` (secções 3, 5, 6 e 7, bloco 1; fluxo 15 da secção 8)

## Global Constraints

- **Âmbito:**
  - todo o texto da interface em pt-PT;
  - protótipo demonstrativo com dados fictícios, sem publicar nem fazer deploy.
- **Fotos de banco:**
  - só Unsplash ou Pexels, com licença livre;
  - descarregar exige autorização do utilizador, pedida com a lista (URL, autor e licença de cada foto);
  - os originais ficam em `fotos-originais/`, que não entra no git;
  - créditos em `public/fotos/CREDITOS.md`;
  - formatos: WebP em dois tamanhos, miniatura (`-s`, 200 px no lado maior; 320 px nas capas) e média (`-m`, 1280 px nas capas e 800 px no resto);
  - peso total de `public/fotos` ≤ 10 MB.
- **Fotos carregadas:**
  - JPEG, lado maior 1600 px, qualidade 0,82;
  - guardadas no IndexedDB `andaime-fotos`, object store `fotos`;
  - sem IndexedDB, ficam só em memória e aparece um aviso.
- **Tratamento de cor:** `saturate(.88) contrast(1.04)` e um véu `#13342a` a 6 % com `mix-blend-mode: multiply`.
- **Proporções:**
  - retrato 1:1, com cantos de 8 px em tamanho grande e círculo em listas;
  - capa de obra 16:9;
  - viatura 4:3;
  - artigo 1:1.
- **Texto alternativo:** `alt=""` quando o nome está ao lado (avatar decorativo); `alt` descritivo nas capas, nas fotos de viatura e nas fotos isoladas.
- **Desempenho:**
  - `loading="lazy"` e `decoding="async"` em tudo, menos na capa da ficha (`eager`);
  - `width` e `height` sempre definidos;
  - o bundle inicial cresce no máximo 15 KB gzip.
- **Versão da store:** o `STORE_VERSION` passa a 4.
- **Commits:** terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Verificação de cada tarefa:**
  - `npx tsc -b` e `npx eslint .` sem erros;
  - os testes da tarefa passam;
  - no fim do bloco correm todos: `npx vitest run`, `npm run build` e `npx playwright test`.

## Mapa de ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `src/domain/photos.ts` (+ `.test.ts`) | `PhotoRef` (tipo), `PHOTO_FORMATS`, `photoUrl`, `photoSrcSet`, `fitWithin` |
| `src/domain/types.ts` | `photo?: PhotoRef` em `Worker`, `Manager`, `Site`, `Vehicle` e `EquipmentItem` |
| `scripts/fotos.manifest.json` | Curadoria: id, categoria, ficheiro original, URL, autor, licença, alt, `look` (para retratos) |
| `scripts/fotos.mjs` | Gera `public/fotos/**`, `public/fotos/CREDITOS.md` e `src/data/seed/photoManifest.ts` |
| `scripts/folha-de-contacto.mjs` | Gera `docs/review/fotos-folha.html` para aprovação |
| `src/data/seed/photoManifest.ts` | Gerado: `PHOTOS` por categoria, com `src`, `w`, `h`, `alt`, `credit` e `look` |
| `src/data/seed/photos.ts` (+ `.test.ts`) | `assignSeedPhotos(db)`: atribuição determinística e sem repetições |
| `src/lib/photos/photoStore.ts` (+ `.test.ts`) | IndexedDB `put`, `get`, `remove` e `clear`, com alternativa em memória |
| `src/lib/photos/resize.ts` | `resizeImage(file) → { blob, w, h }` (canvas) |
| `src/lib/photos/usePhotoUrl.ts` | Converte um `PhotoRef` em URL, criando e libertando object URLs |
| `src/ui/Photo.tsx` (+ `.test.tsx`) | Componente `<Photo>`: formato, tratamento de cor, lazy e alternativa |
| `src/ui/PhotoUpload.tsx` | Botão "Alterar foto" / "Remover foto", com estado de progresso e de erro |
| `src/ui/Avatar.tsx` | Prop `photo` e `PhotoStack` |
| `src/store/actions/photos.ts` (+ testes em `flows.test.ts`) | `setPhoto(target, photo)` com histórico e "Anular"; `resetDemo` limpa o IndexedDB |
| Ecrãs | Retratos em todos os sítios do `Avatar`; obras em cartões; capa da ficha; viaturas; EPI; pinos e painel do mapa |
| `e2e/photos.spec.ts`, `e2e/fixtures/retrato.jpg` | Fluxo 15 |

---

### Tarefa 1: Tipo `PhotoRef` e regras puras

**Files:**
- Create: `src/domain/photos.ts`, `src/domain/photos.test.ts`
- Modify: `src/domain/types.ts`; as interfaces `Manager`, `Worker`, `Site`, `Vehicle` e `EquipmentItem` ganham o campo opcional `photo?: PhotoRef`
- Modify: `src/store/persistence.ts:5` (`STORE_VERSION = 4`)

**Interfaces:**
- Produces:
  - `type PhotoRef`;
  - `type PhotoFormat = 'retrato' | 'capa' | 'viatura' | 'artigo'`;
  - `PHOTO_FORMATS: Record<PhotoFormat, { ratio: number }>`;
  - `photoUrl(ref, size: 's' | 'm'): string | null` (só para fotos de banco; as carregadas devolvem `null`);
  - `photoSrcSet(ref): string | undefined`;
  - `fitWithin(w, h, max): { w: number; h: number }`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// src/domain/photos.test.ts
import { describe, expect, it } from 'vitest'
import { fitWithin, photoSrcSet, photoUrl, type PhotoRef } from './photos'

const banco: PhotoRef = { kind: 'banco', src: 'trabalhadores/t01', credit: 'Foto: A. Autor / Unsplash', alt: 'Retrato', w: 800, h: 800 }
const carregada: PhotoRef = { kind: 'carregada', id: 'ph-1', alt: 'Retrato', w: 1200, h: 900 }

describe('fotos', () => {
  it('URL de banco por tamanho', () => {
    expect(photoUrl(banco, 's')).toBe('/fotos/trabalhadores/t01-s.webp')
    expect(photoUrl(banco, 'm')).toBe('/fotos/trabalhadores/t01-m.webp')
  })
  it('foto carregada não tem URL estático', () => {
    expect(photoUrl(carregada, 'm')).toBeNull()
    expect(photoSrcSet(carregada)).toBeUndefined()
  })
  it('srcset com as larguras reais de cada tamanho', () => {
    expect(photoSrcSet(banco)).toBe('/fotos/trabalhadores/t01-s.webp 200w, /fotos/trabalhadores/t01-m.webp 800w')
  })
  it('fitWithin reduz o lado maior sem deformar e nunca amplia', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 })
    expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 })
  })
})
```

- [ ] **Passo 2: correr e ver falhar.** `npx vitest run src/domain/photos.test.ts` deve falhar com `Failed to resolve import "./photos"`.

- [ ] **Passo 3: implementação mínima**

```ts
// src/domain/photos.ts
/** Fotos do Andaime: de banco (ficheiros em public/fotos) ou carregadas (IndexedDB). */
export type PhotoRef =
  | { kind: 'banco'; src: string; credit: string; alt: string; w: number; h: number }
  | { kind: 'carregada'; id: string; alt: string; w: number; h: number }

export type PhotoFormat = 'retrato' | 'capa' | 'viatura' | 'artigo'

export const PHOTO_FORMATS: Record<PhotoFormat, { ratio: number }> = {
  retrato: { ratio: 1 },
  capa: { ratio: 16 / 9 },
  viatura: { ratio: 4 / 3 },
  artigo: { ratio: 1 },
}

/** Largura do tamanho pequeno ("-s") e médio ("-m"), igual à do pipeline (scripts/fotos.mjs). */
export function sizeWidths(ref: Extract<PhotoRef, { kind: 'banco' }>): { s: number; m: number } {
  const cover = ref.src.startsWith('obras/')
  return { s: cover ? 320 : 200, m: cover ? 1280 : 800 }
}

export function photoUrl(ref: PhotoRef, size: 's' | 'm'): string | null {
  return ref.kind === 'banco' ? `/fotos/${ref.src}-${size}.webp` : null
}

export function photoSrcSet(ref: PhotoRef): string | undefined {
  if (ref.kind !== 'banco') return undefined
  const w = sizeWidths(ref)
  return `${photoUrl(ref, 's')} ${w.s}w, ${photoUrl(ref, 'm')} ${w.m}w`
}

/** Medidas que cabem num quadrado de lado `max`, sem deformar nem ampliar. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.round(w * k), h: Math.round(h * k) }
}
```

Em `src/domain/types.ts`:
- acrescentar `import type { PhotoRef } from './photos'` no topo;
- acrescentar a linha `photo?: PhotoRef` às interfaces `Manager`, `Worker`, `Site`, `Vehicle` e `EquipmentItem`;
- reexportar com `export type { PhotoRef } from './photos'`.

Em `src/store/persistence.ts`, mudar para `export const STORE_VERSION = 4`.

- [ ] **Passo 4: correr e ver passar.** `npx vitest run src/domain/photos.test.ts` deve dar 4 passed. `npx tsc -b` deve terminar com exit 0.

- [ ] **Passo 5: commit**

```bash
git add src/domain/photos.ts src/domain/photos.test.ts src/domain/types.ts src/store/persistence.ts
git commit -m "feat(fotos): tipo PhotoRef e regras de URL e dimensões

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Pipeline das fotos de banco e folha de contacto

**Files:**
- Create: `scripts/fotos.manifest.json`, `scripts/fotos.mjs`, `scripts/folha-de-contacto.mjs`
- Modify: `package.json` (devDependency `sharp`; scripts `"fotos": "node scripts/fotos.mjs"` e `"fotos:folha": "node scripts/folha-de-contacto.mjs"`)
- Modify: `.gitignore` (acrescentar `fotos-originais/`)

**Interfaces:**
- Consumes: o formato de nomes da Tarefa 1 (`/fotos/<categoria>/<id>-{s,m}.webp`) e as larguras de `sizeWidths` (capas 320/1280, resto 200/800).
- Produces: `src/data/seed/photoManifest.ts`, que exporta:
  ```ts
  export interface ManifestPhoto { id: string; src: string; w: number; h: number; alt: string; credit: string; look?: 'a' | 'b' }
  export const PHOTOS: Record<'trabalhadores' | 'gestores' | 'obras' | 'viaturas' | 'epi', ManifestPhoto[]>
  ```
  O `w`/`h` é o do tamanho `-m`. O campo `look` só existe nos retratos: é o conjunto de nomes fictícios a que o retrato é atribuído, por verosimilhança (ver Tarefa 4).

- [ ] **Passo 1: instalar o `sharp` e ignorar os originais**

```bash
npm i -D sharp
```
Acrescentar `fotos-originais/` ao `.gitignore`.

- [ ] **Passo 2: formato do manifesto** (`scripts/fotos.manifest.json`). Começa vazio e a Tarefa 3 preenche-o. Cada entrada:

```json
{
  "id": "t01",
  "categoria": "trabalhadores",
  "original": "fotos-originais/trabalhadores/t01.jpg",
  "url": "https://unsplash.com/photos/<id>",
  "autor": "Nome do fotógrafo",
  "licenca": "Unsplash License",
  "alt": "Retrato de trabalhador com capacete branco",
  "look": "a",
  "foco": "centre"
}
```

A primeira versão do ficheiro é `[]`.

- [ ] **Passo 3: script do pipeline**

```js
// scripts/fotos.mjs — gera public/fotos/** e src/data/seed/photoManifest.ts a partir do manifesto.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import sharp from 'sharp'

const RATIO = { trabalhadores: 1, gestores: 1, obras: 16 / 9, viaturas: 4 / 3, epi: 1 }
const WIDTHS = (cat) => (cat === 'obras' ? { s: 320, m: 1280 } : { s: 200, m: 800 })
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
    await sharp(f.original).rotate().resize(w, h, { fit: 'cover', position: f.foco ?? 'attention' }).webp({ quality: size === 's' ? 70 : 74 }).toFile(file)
    if (size === 'm') mDims = { w, h }
  }
  out[f.categoria].push({ id: f.id, src, ...mDims, alt: f.alt, credit: `Foto: ${f.autor} / ${f.licenca.split(' ')[0]}`, ...(f.look ? { look: f.look } : {}) })
}

const ts = `// Gerado por scripts/fotos.mjs a partir de scripts/fotos.manifest.json. Não editar à mão.
export interface ManifestPhoto { id: string; src: string; w: number; h: number; alt: string; credit: string; look?: 'a' | 'b' }
export const PHOTOS: Record<'trabalhadores' | 'gestores' | 'obras' | 'viaturas' | 'epi', ManifestPhoto[]> = ${JSON.stringify(out, null, 2)}
`
await writeFile('src/data/seed/photoManifest.ts', ts)

const credits = ['# Créditos das fotos', '', 'Fotos de banco com licença livre usadas na demonstração. As pessoas retratadas não têm qualquer relação com os nomes fictícios da demo.', '', '| Ficheiro | Autor | Licença | Origem |', '|---|---|---|---|', ...manifest.map((f) => `| ${f.categoria}/${f.id} | ${f.autor} | ${f.licenca} | ${f.url} |`)]
await writeFile('public/fotos/CREDITOS.md', credits.join('\n') + '\n')
console.log(`${manifest.length} fotos processadas.`)
```

- [ ] **Passo 4: folha de contacto**

```js
// scripts/folha-de-contacto.mjs — página com todas as fotos tratadas, para aprovação antes de integrar.
import { readFile, writeFile } from 'node:fs/promises'
const manifest = JSON.parse(await readFile('scripts/fotos.manifest.json', 'utf8'))
const cats = [...new Set(manifest.map((f) => f.categoria))]
const grade = 'filter:saturate(.88) contrast(1.04)'
const html = `<!doctype html><meta charset="utf-8"><title>Folha de contacto — fotos do Andaime</title>
<style>body{font:14px system-ui;background:#f5f5f0;color:#1f2421;margin:24px}h2{margin:24px 0 8px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
figure{margin:0;background:#fff;border:1px solid #dadcd5;border-radius:8px;overflow:hidden}
.v{position:relative}.v img{display:block;width:100%;${grade}}.v::after{content:'';position:absolute;inset:0;background:#13342a;opacity:.06;mix-blend-mode:multiply}
figcaption{padding:6px 8px;font-size:12px}</style>
${cats.map((c) => `<h2>${c}</h2><div class="g">${manifest.filter((f) => f.categoria === c).map((f) => `<figure><div class="v"><img src="../../public/fotos/${c}/${f.id}-m.webp" alt="${f.alt}"></div><figcaption><b>${f.id}</b>${f.look ? ` · ${f.look}` : ''}<br>${f.alt}<br><small>${f.autor} · ${f.licenca}</small></figcaption></figure>`).join('')}</div>`).join('')}`
await writeFile('docs/review/fotos-folha.html', html)
console.log('docs/review/fotos-folha.html')
```

- [ ] **Passo 5: confirmar que o manifesto vazio funciona.** `npm run fotos` deve imprimir `0 fotos processadas.` e criar o `src/data/seed/photoManifest.ts` com as listas vazias. `npx tsc -b` deve terminar com exit 0.

- [ ] **Passo 6: commit**

```bash
git add scripts/ package.json package-lock.json .gitignore src/data/seed/photoManifest.ts public/fotos/CREDITOS.md
git commit -m "feat(fotos): pipeline sharp para WebP, manifesto e folha de contacto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Curadoria, autorização e descarga (ponto de controlo com o utilizador)

**Files:**
- Modify: `scripts/fotos.manifest.json`
- Create (gerados): `public/fotos/**`, `src/data/seed/photoManifest.ts`, `docs/review/fotos-folha.html`

**Quantidades:**

| Categoria | Fotos | Notas |
|---|---|---|
| Trabalhadores | 42 | `look: 'a'` × 39 e `look: 'b'` × 3 (ver Tarefa 4) |
| Gestores | 2 | Retratos de escritório ou de obra, sem EPI |
| Obras | 9 | Uma por obra, de acordo com a descrição no catálogo: habitação coletiva em Lisboa, escola em reabilitação, hotel em construção junto ao rio, armazém logístico, residência sénior, reabilitação de escritórios em Paris, escritórios junto a canal, conjunto habitacional na Alemanha e terreno de moradias antes do arranque |
| Viaturas | 11 | Carrinhas comerciais brancas ou cinzentas de lado ou a 3/4, sem matrícula legível nem logótipos |
| EPI | 14 | Um artigo por foto, fundo limpo |

**Critérios de escolha:**
- luz natural;
- EPI visível nos trabalhadores;
- enquadramento do peito para cima;
- sem marcas legíveis;
- sem crianças;
- sem contextos sensíveis.

- [ ] **Passo 1: procurar** no browser integrado (Unsplash e Pexels) e preencher uma lista provisória com URL, autor e licença de cada foto. Não descarregar nada nesta fase.
- [ ] **Passo 2: pedir autorização ao utilizador.** Apresentar a lista: número de ficheiros, origem e tamanho total estimado. Esperar por um "sim" explícito.
- [ ] **Passo 3: descarregar, depois do sim.** Os originais vão para `fotos-originais/<categoria>/<id>.jpg`, pelo tamanho "médio" do site (≤ 2000 px). Preencher o `scripts/fotos.manifest.json`.
- [ ] **Passo 4: gerar.** Correr `npm run fotos && npm run fotos:folha` e confirmar duas coisas:
  - `du -sh public/fotos` dá ≤ 10 MB;
  - `src/data/seed/photoManifest.ts` tem 42 trabalhadores, 2 gestores, 9 obras, 11 viaturas e 14 artigos de EPI.
- [ ] **Passo 5: mostrar a folha de contacto.** Abrir `docs/review/fotos-folha.html` como artifact ou captura e pedir aprovação. As fotos rejeitadas são substituídas, voltando ao passo 1 só para essas.
- [ ] **Passo 6: commit** (sem os originais)

```bash
git add scripts/fotos.manifest.json public/fotos src/data/seed/photoManifest.ts docs/review/fotos-folha.html
git commit -m "feat(fotos): fotos de banco tratadas (WebP), créditos e folha de contacto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Fotos no seed

**Files:**
- Create: `src/data/seed/photos.ts`, `src/data/seed/photos.test.ts`
- Modify: `src/data/seed/index.ts` (chamar `assignSeedPhotos(db)` imediatamente antes do `return` de `createSeed`)

**Interfaces:**
- Consumes: `PHOTOS` e `ManifestPhoto` (Tarefa 2); `PhotoRef` (Tarefa 1).
- Produces: `assignSeedPhotos(db: DB): void`, que muta o `db` acabado de criar e atribui:
  - `photo` a cada gestor, trabalhador, obra, viatura e artigo;
  - pela ordem dos ids (determinística);
  - sem repetir nenhuma foto.

Os retratos são escolhidos por verosimilhança com o nome fictício: os 3 nomes próprios femininos do catálogo (`Ana`, `Sara`, `Patrícia`) recebem retratos do conjunto `b` e os restantes do conjunto `a`. Se um conjunto se esgotar, a pessoa fica sem foto e aparecem as iniciais, o que nunca acontece com as quantidades da Tarefa 3. O teste abaixo garante isso.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// src/data/seed/photos.test.ts
import { describe, expect, it } from 'vitest'
import { createSeed } from './index'

describe('fotos do seed', () => {
  const { db } = createSeed({ today: '2026-10-15' })
  const all = [
    ...Object.values(db.managers),
    ...Object.values(db.workers),
    ...Object.values(db.sites),
    ...Object.values(db.vehicles),
    ...Object.values(db.equipment),
  ]
  it('todas as pessoas, obras, viaturas e artigos têm foto de banco', () => {
    expect(all.filter((x) => x.photo?.kind !== 'banco').map((x) => x.id)).toEqual([])
  })
  it('nenhuma foto se repete', () => {
    const srcs = all.map((x) => (x.photo?.kind === 'banco' ? x.photo.src : ''))
    expect(new Set(srcs).size).toBe(srcs.length)
  })
  it('é determinístico', () => {
    const again = createSeed({ today: '2026-10-15' }).db
    expect(Object.values(again.workers).map((w) => w.photo)).toEqual(Object.values(db.workers).map((w) => w.photo))
  })
  it('o texto alternativo do retrato nomeia a pessoa fictícia', () => {
    const w = Object.values(db.workers)[0]!
    expect(w.photo?.alt).toBe(`Retrato de ${w.name}`)
  })
})
```

- [ ] **Passo 2: correr e ver falhar.** `npx vitest run src/data/seed/photos.test.ts` deve falhar no primeiro teste (lista de ids sem foto).

- [ ] **Passo 3: implementação**

```ts
// src/data/seed/photos.ts
import type { PhotoRef } from '@/domain/photos'
import type { DB } from '@/domain/types'
import { PHOTOS, type ManifestPhoto } from './photoManifest'

/** Nomes próprios do catálogo que recebem retratos do conjunto "b" (verosimilhança das personas fictícias). */
const LOOK_B = new Set(['Ana', 'Sara', 'Patrícia'])

const ref = (p: ManifestPhoto, alt: string): PhotoRef => ({ kind: 'banco', src: p.src, credit: p.credit, alt, w: p.w, h: p.h })
const byId = <T extends { id: string }>(r: Record<string, T>) => Object.values(r).sort((a, b) => a.id.localeCompare(b.id, 'pt', { numeric: true }))

export function assignSeedPhotos(db: DB): void {
  const pools = { a: PHOTOS.trabalhadores.filter((p) => p.look !== 'b'), b: PHOTOS.trabalhadores.filter((p) => p.look === 'b') }
  for (const w of byId(db.workers)) {
    const p = pools[LOOK_B.has(w.name.split(' ')[0]!) ? 'b' : 'a'].shift()
    if (p) w.photo = ref(p, `Retrato de ${w.name}`)
  }
  byId(db.managers).forEach((m, i) => { const p = PHOTOS.gestores[i]; if (p) m.photo = ref(p, `Retrato de ${m.name}`) })
  byId(db.sites).forEach((s, i) => { const p = PHOTOS.obras[i]; if (p) s.photo = ref(p, `Obra ${s.name}, em ${s.city}`) })
  byId(db.vehicles).forEach((v, i) => { const p = PHOTOS.viaturas[i]; if (p) v.photo = ref(p, `${v.make} ${v.model}`) })
  byId(db.equipment).forEach((e, i) => { const p = PHOTOS.epi[i]; if (p) e.photo = ref(p, e.name) })
}
```

O manifesto das obras tem de seguir a ordem `s1`…`s9` (a mesma de `SITES` no catálogo). As viaturas seguem a ordem `v1`…`v11` e o EPI a ordem de `EQUIPMENT`. A Tarefa 3 garante essa ordem no manifesto.

Em `src/data/seed/index.ts`: `import { assignSeedPhotos } from './photos'` e chamar `assignSeedPhotos(db)` antes de devolver `{ db, personas }`.

- [ ] **Passo 4: correr.** `npx vitest run src/data/seed` deve dar todos passed, incluindo os testes do seed que já existiam.

- [ ] **Passo 5: commit** (`feat(fotos): seed atribui fotos de banco a pessoas, obras, viaturas e EPI`, com a linha Co-Authored-By).

---

### Tarefa 5: Armazenamento das fotos carregadas (IndexedDB)

**Files:**
- Create: `src/lib/photos/photoStore.ts`, `src/lib/photos/photoStore.test.ts`, `src/lib/photos/resize.ts`
- Modify: `package.json` (`npm i -D fake-indexeddb`)

**Interfaces:**
- Produces: `photoStore` com:
  - `put(id: string, blob: Blob): Promise<void>`;
  - `get(id: string): Promise<Blob | null>`;
  - `remove(id: string): Promise<void>`;
  - `clear(): Promise<void>`;
  - `readonly persistent: boolean`.
- Produces também `createPhotoStore(idb?: IDBFactory | null)` para os testes, e `resizeImage(file: File): Promise<{ blob: Blob; w: number; h: number }>`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// src/lib/photos/photoStore.test.ts
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createPhotoStore } from './photoStore'

const blob = (s: string) => new Blob([s], { type: 'image/jpeg' })

describe('photoStore', () => {
  it('guarda, lê, remove e limpa no IndexedDB', async () => {
    const st = createPhotoStore(indexedDB)
    expect(st.persistent).toBe(true)
    await st.put('a', blob('1'))
    await st.put('b', blob('2'))
    expect(await (await st.get('a'))!.text()).toBe('1')
    await st.remove('a')
    expect(await st.get('a')).toBeNull()
    await st.clear()
    expect(await st.get('b')).toBeNull()
  })
  it('sem IndexedDB funciona em memória e diz que não persiste', async () => {
    const st = createPhotoStore(null)
    expect(st.persistent).toBe(false)
    await st.put('a', blob('x'))
    expect(await (await st.get('a'))!.text()).toBe('x')
  })
})
```

- [ ] **Passo 2: ver falhar.** `npx vitest run src/lib/photos` deve falhar a resolver `./photoStore`.

- [ ] **Passo 3: implementação**

```ts
// src/lib/photos/photoStore.ts
/** Fotos carregadas na demonstração. Ficam no IndexedDB deste navegador; sem ele, só em memória. */
const DB_NAME = 'andaime-fotos'
const STORE = 'fotos'

export interface PhotoStore {
  readonly persistent: boolean
  put(id: string, blob: Blob): Promise<void>
  get(id: string): Promise<Blob | null>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

function memoryStore(): PhotoStore {
  const m = new Map<string, Blob>()
  return {
    persistent: false,
    put: async (id, b) => void m.set(id, b),
    get: async (id) => m.get(id) ?? null,
    remove: async (id) => void m.delete(id),
    clear: async () => m.clear(),
  }
}

export function createPhotoStore(idb: IDBFactory | null | undefined = globalThis.indexedDB): PhotoStore {
  if (!idb) return memoryStore()
  let opening: Promise<IDBDatabase> | null = null
  const open = () =>
    (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }))
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return {
    persistent: true,
    put: async (id, b) => void (await run('readwrite', (s) => s.put(b, id))),
    get: async (id) => ((await run<Blob | undefined>('readonly', (s) => s.get(id))) ?? null),
    remove: async (id) => void (await run('readwrite', (s) => s.delete(id))),
    clear: async () => void (await run('readwrite', (s) => s.clear())),
  }
}

/** Instância da aplicação. Se o IndexedDB estiver bloqueado (janela privada), a abertura falha e cai na memória. */
export const photoStore: PhotoStore = (() => {
  try { return createPhotoStore() } catch { return memoryStore() }
})()
```

```ts
// src/lib/photos/resize.ts
import { fitWithin } from '@/domain/photos'

/** Reduz uma foto no navegador: JPEG, lado maior 1600 px. Uma foto de telemóvel fica em ~300 KB. */
export async function resizeImage(file: File, max = 1600): Promise<{ blob: Blob; w: number; h: number }> {
  if (!file.type.startsWith('image/')) throw new Error('O ficheiro não é uma imagem. Escolha uma foto JPG, PNG ou WebP.')
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { w, h } = fitWithin(bmp.width, bmp.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
  if (!blob) throw new Error('Não foi possível preparar a foto. Tente outra imagem.')
  return { blob, w, h }
}
```

- [ ] **Passo 4: correr.** `npx vitest run src/lib/photos` deve dar 2 passed. O `resizeImage` não tem teste unitário porque o jsdom não tem canvas; fica coberto pelo E2E da Tarefa 12.

- [ ] **Passo 5: commit** (`feat(fotos): armazenamento de fotos carregadas no IndexedDB, com alternativa em memória`).

---

### Tarefa 6: Ação `setPhoto` e reposição

**Files:**
- Create: `src/store/actions/photos.ts`
- Modify: `src/store/types.ts` (acrescentar a `DemoActions`), `src/store/store.ts:69-71` (`...photoActions(api)`), `src/store/actions/operations.ts:466-474` (`resetDemo` limpa o `photoStore`)
- Test: `src/store/flows.test.ts` (novo `describe('fluxo 15 — fotos')`)

**Interfaces:**
- Consumes: `PhotoRef` (Tarefa 1) e `photoStore.clear()` (Tarefa 5).
- Produces:
  ```ts
  export type PhotoTarget = { type: 'trabalhador' | 'gestor' | 'obra' | 'viatura' | 'artigo'; id: ID }
  setPhoto(target: PhotoTarget, photo: PhotoRef | null): void
  ```
  - empilha "Anular" com a etiqueta "Alterar foto";
  - regista histórico do tipo `foto`, com as refs certas;
  - `photo: null` remove a foto.

- [ ] **Passo 1: escrever o teste que falha** (acrescentar a `src/store/flows.test.ts`, reutilizando o `make()` desse ficheiro)

```ts
describe('fluxo 15 — fotos', () => {
  it('alterar a foto de um trabalhador regista histórico e pode anular-se', () => {
    const store = make()
    const st = () => store.getState()
    const w = Object.values(st().db.workers)[0]!
    const before = w.photo
    st().setPhoto({ type: 'trabalhador', id: w.id }, { kind: 'carregada', id: 'ph-1', alt: `Retrato de ${w.name}`, w: 800, h: 800 })
    expect(st().db.workers[w.id]!.photo).toMatchObject({ kind: 'carregada', id: 'ph-1' })
    expect(st().db.activity[0]).toMatchObject({ kind: 'foto', refs: { workerId: w.id } })
    st().undo()
    expect(st().db.workers[w.id]!.photo).toEqual(before)
  })
  it('remover a foto de uma obra deixa a obra sem foto', () => {
    const store = make()
    store.getState().setPhoto({ type: 'obra', id: 's1' }, null)
    expect(store.getState().db.sites.s1!.photo).toBeUndefined()
  })
})
```

- [ ] **Passo 2: ver falhar.** `npx vitest run src/store/flows.test.ts -t "fluxo 15"` deve dar `setPhoto is not a function`.

- [ ] **Passo 3: implementação**

```ts
// src/store/actions/photos.ts
import type { PhotoRef } from '@/domain/photos'
import type { ActivityRefs, ID } from '@/domain/types'
import { pushUndo, type StoreApi } from '../api'
import { log } from '../helpers'
import type { DemoActions } from '../types'

export type PhotoTarget = { type: 'trabalhador' | 'gestor' | 'obra' | 'viatura' | 'artigo'; id: ID }

const COLLECTION = { trabalhador: 'workers', gestor: 'managers', obra: 'sites', viatura: 'vehicles', artigo: 'equipment' } as const

export function photoActions(api: StoreApi): Pick<DemoActions, 'setPhoto'> {
  const { set, get, clock, snapshot } = api
  return {
    setPhoto(target, photo) {
      const entity = get().db[COLLECTION[target.type]][target.id] as { name?: string; plate?: string } | undefined
      if (!entity) throw new Error('Registo não encontrado')
      const snap = snapshot('Alterar foto')
      set((s) => {
        pushUndo(s, snap)
        const e = s.db[COLLECTION[target.type]][target.id] as { photo?: PhotoRef }
        if (photo) e.photo = photo
        else delete e.photo
        const label = entity.name ?? entity.plate ?? target.id
        const refs: ActivityRefs = target.type === 'trabalhador' ? { workerId: target.id } : target.type === 'obra' ? { siteId: target.id } : target.type === 'viatura' ? { vehicleId: target.id } : {}
        log(s, clock(), 'foto', `${photo ? 'Alterou' : 'Removeu'} a foto de ${label}.`, refs)
      })
    },
  }
}
```

- em `src/store/types.ts`, dentro de `DemoActions`, acrescentar `setPhoto(target: PhotoTarget, photo: PhotoRef | null): void`, com os imports de tipo de `./actions/photos` e `@/domain/photos`;
- em `src/store/store.ts`, `import { photoActions } from './actions/photos'` e acrescentar `...photoActions(api),` depois de `...operationActions(api),`;
- em `resetDemo` (`operations.ts`), acrescentar `void import('@/lib/photos/photoStore').then((m) => m.photoStore.clear())` antes do `set(...)`. O import dinâmico mantém o IndexedDB fora do arranque e dos testes da store.

- [ ] **Passo 4: correr.** `npx vitest run src/store` deve dar todos passed.

- [ ] **Passo 5: commit** (`feat(fotos): ação setPhoto com histórico e anular; repor limpa as fotos carregadas`).

---

### Tarefa 7: Componente `<Photo>` e tratamento de cor

**Files:**
- Create: `src/lib/photos/usePhotoUrl.ts`, `src/ui/Photo.tsx`, `src/ui/Photo.test.tsx`
- Modify: `src/index.css` (classe `.photo-grade`)

**Interfaces:**
- Consumes: `photoUrl`, `photoSrcSet` e `PHOTO_FORMATS` (Tarefa 1); `photoStore.get` (Tarefa 5).
- Produces:
  ```tsx
  <Photo photo={PhotoRef | undefined} format="retrato" | "capa" | "viatura" | "artigo"
         sizes="..." alt?={string} eager?={boolean} rounded?="none" | "sm" | "md" | "full"
         fallback={ReactNode} className="..." />
  ```
  - o `alt` é opcional e, por defeito, vem de `photo.alt`; `alt=""` torna a foto decorativa;
  - devolve um `<span>` com a proporção reservada;
  - se não houver foto ou ela falhar, mostra o `fallback`.

  `usePhotoUrl(ref): string | null`: nas fotos de banco devolve logo o URL; nas carregadas cria o object URL e liberta-o no cleanup.

- [ ] **Passo 1: escrever o teste que falha**

```tsx
// src/ui/Photo.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Photo } from './Photo'

const banco = { kind: 'banco' as const, src: 'obras/s1', credit: 'c', alt: 'Obra Edifício Atlântida', w: 1280, h: 720 }

describe('<Photo>', () => {
  it('foto de banco com srcset, lazy, medidas e tratamento de cor', () => {
    render(<Photo photo={banco} format="capa" sizes="320px" fallback={<span>sem foto</span>} />)
    const img = screen.getByRole('img', { name: 'Obra Edifício Atlântida' })
    expect(img).toHaveAttribute('srcset', '/fotos/obras/s1-s.webp 320w, /fotos/obras/s1-m.webp 1280w')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('width', '1280')
    expect(img.parentElement).toHaveClass('photo-grade')
  })
  it('sem foto mostra a alternativa', () => {
    render(<Photo photo={undefined} format="retrato" fallback={<span>AB</span>} />)
    expect(screen.getByText('AB')).toBeInTheDocument()
  })
  it('se a imagem falhar, volta à alternativa', () => {
    render(<Photo photo={banco} format="capa" fallback={<span>sem foto</span>} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('sem foto')).toBeInTheDocument()
  })
})
```

- [ ] **Passo 2: ver falhar.** `npx vitest run src/ui/Photo.test.tsx` deve falhar a resolver `./Photo`.

- [ ] **Passo 3: implementação**

```ts
// src/lib/photos/usePhotoUrl.ts
import { useEffect, useState } from 'react'
import { photoUrl, type PhotoRef } from '@/domain/photos'
import { photoStore } from './photoStore'

/** URL a mostrar para uma foto. As carregadas vêm do IndexedDB como object URL, libertado quando já não é preciso. */
export function usePhotoUrl(ref: PhotoRef | undefined): string | null {
  const id = ref?.kind === 'carregada' ? ref.id : null
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    let made: string | null = null
    void photoStore.get(id).then((b) => {
      if (!alive || !b) return
      made = URL.createObjectURL(b)
      setUrl(made)
    })
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
      setUrl(null)
    }
  }, [id])
  if (!ref) return null
  return ref.kind === 'banco' ? photoUrl(ref, 'm') : url
}
```

```tsx
// src/ui/Photo.tsx
import { useState, type ReactNode } from 'react'
import { PHOTO_FORMATS, photoSrcSet, type PhotoFormat, type PhotoRef } from '@/domain/photos'
import { cn } from '@/lib/cn'
import { usePhotoUrl } from '@/lib/photos/usePhotoUrl'

interface PhotoProps {
  photo: PhotoRef | undefined
  format: PhotoFormat
  sizes?: string
  /** Por defeito, o alt da foto. "" = decorativa (o nome já está ao lado). */
  alt?: string
  eager?: boolean
  rounded?: 'none' | 'sm' | 'md' | 'full'
  fallback: ReactNode
  className?: string
}

const ROUND = { none: '', sm: 'rounded-sm', md: 'rounded-md', full: 'rounded-full' }

/** Foto com proporção reservada (sem saltos), tratamento de cor da marca e alternativa se faltar. */
export function Photo({ photo, format, sizes, alt, eager, rounded = 'md', fallback, className }: PhotoProps) {
  const url = usePhotoUrl(photo)
  const [failed, setFailed] = useState<string | null>(null)
  const show = photo && url && failed !== url
  return (
    <span
      className={cn('photo-grade relative block shrink-0 overflow-hidden bg-line-2', ROUND[rounded], className)}
      style={{ aspectRatio: String(PHOTO_FORMATS[format].ratio) }}
    >
      {show ? (
        <img
          src={url}
          srcSet={photoSrcSet(photo)}
          sizes={sizes}
          alt={alt ?? photo.alt}
          width={photo.w}
          height={photo.h}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(url)}
          className="size-full object-cover motion-safe:animate-fade-in"
        />
      ) : (
        <span className="flex size-full items-center justify-center">{fallback}</span>
      )}
    </span>
  )
}
```

Em `src/index.css`, junto das outras utilidades:

```css
/* Tratamento comum: fotos de origens diferentes ficam da mesma família (spec 3.2). */
.photo-grade img { filter: saturate(.88) contrast(1.04); }
.photo-grade::after { content: ''; position: absolute; inset: 0; background: #13342a; opacity: .06; mix-blend-mode: multiply; pointer-events: none; border-radius: inherit; }
```

- [ ] **Passo 4: correr.** `npx vitest run src/ui/Photo.test.tsx` deve dar 3 passed.

- [ ] **Passo 5: commit** (`feat(fotos): componente Photo com proporção reservada, tratamento de cor e alternativa`).

---

### Tarefa 8: Retratos em toda a app

**Files:**
- Modify: `src/ui/Avatar.tsx`
- Modify: os 19 ficheiros com `<Avatar` (lista no grep abaixo)
- Modify: `src/features/teams/TeamsPage.tsx:49` (passa a usar `PhotoStack`)
- Test: `src/ui/Avatar.test.tsx`

**Interfaces:**
- Consumes: `<Photo>` (Tarefa 7).
- Produces:
  - `Avatar` com a prop opcional `photo?: PhotoRef`. O retrato é sempre decorativo (`alt=""`), porque o nome aparece sempre ao lado. Os tamanhos `xs`, `sm` e `md` ficam em círculo e o `lg` fica quadrado com cantos de 8 px. `onSite?: boolean` desenha o ponto Lima;
  - `PhotoStack({ people: { id, name, color?, photo? }[], max = 4 })`: retratos sobrepostos com "+N".

- [ ] **Passo 1: escrever o teste que falha**

```tsx
// src/ui/Avatar.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar, PhotoStack } from './Avatar'

const photo = { kind: 'banco' as const, src: 'trabalhadores/t01', credit: 'c', alt: 'Retrato de Rui Fontes', w: 800, h: 800 }

describe('Avatar', () => {
  it('com foto mostra o retrato decorativo (o nome está ao lado)', () => {
    const { container } = render(<Avatar name="Rui Fontes" photo={photo} />)
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })
  it('sem foto mostra as iniciais', () => {
    render(<Avatar name="Rui Fontes" />)
    expect(screen.getByText('RF')).toBeInTheDocument()
  })
  it('PhotoStack mostra até 4 e o resto como +N', () => {
    const people = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, name: `Pessoa ${i}` }))
    render(<PhotoStack people={people} />)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })
})
```

- [ ] **Passo 2: ver falhar.** `npx vitest run src/ui/Avatar.test.tsx` deve falhar porque `PhotoStack` não existe e não aparece nenhum `img`.

- [ ] **Passo 3: implementação.** Em `src/ui/Avatar.tsx` mantêm-se `initials` e `avatarBackground`. O componente `Avatar` passa a ser:

```tsx
interface AvatarProps {
  name: string
  color?: string
  photo?: PhotoRef
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  ring?: boolean
  /** Ponto Lima: em obra hoje. */
  onSite?: boolean
}

const BOX = { xs: 'size-5 text-[9px]', sm: 'size-7 text-[11px]', md: 'size-9 text-sm', lg: 'size-14 text-lg' }

export function Avatar({ name, color = '#24543f', photo, size = 'sm', className, ring, onSite }: AvatarProps) {
  const letters = (
    <span aria-hidden className="flex size-full items-center justify-center font-semibold select-none font-wide" style={{ background: avatarBackground(color), color: '#ffffff' }}>
      {initials(name)}
    </span>
  )
  return (
    <span className={cn('relative inline-block shrink-0', BOX[size], className)}>
      <Photo photo={photo} format="retrato" alt="" sizes={size === 'lg' ? '56px' : '36px'} rounded={size === 'lg' ? 'md' : 'full'} fallback={letters} className={cn('size-full', ring && 'ring-2 ring-surface')} />
      {onSite && <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-surface bg-lima" />}
    </span>
  )
}

export function PhotoStack({ people, max = 4 }: { people: { id: string; name: string; color?: string; photo?: PhotoRef }[]; max?: number }) {
  const rest = people.length - max
  return (
    <span className="flex -space-x-1.5">
      {people.slice(0, max).map((p) => <Avatar key={p.id} name={p.name} color={p.color} photo={p.photo} size="sm" ring />)}
      {rest > 0 && <span className="flex size-7 items-center justify-center rounded-full bg-pinho text-[11px] font-semibold text-lima ring-2 ring-surface">+{rest}</span>}
    </span>
  )
}
```

Os imports novos são `import { Photo } from './Photo'` e `import type { PhotoRef } from '@/domain/photos'`.

- [ ] **Passo 4: passar a foto em cada chamada.** A lista sai de `grep -rn "<Avatar" src --include=*.tsx`.
  - Onde existe um trabalhador `w`, acrescentar `photo={w?.photo}`.
  - Casos especiais:
    - `Sidebar.tsx:99` e `RoleSwitcher.tsx:117` passam `photo={personaPhoto(db, session, role)}`. É um helper novo em `src/store/selectors.ts`, que devolve `db.managers[id]?.photo` no papel de gestor e `db.workers[id]?.photo` nos outros papéis;
    - `ActivityList.tsx:25` fica sem foto: o ator é texto livre;
    - `DesignPage.tsx:115` mostra os dois estados: um avatar com foto, tirada de `useDemo((s) => Object.values(s.db.workers)[0]?.photo)`, e um sem.
  - Ponto Lima: o `WorkerRows.tsx:119` (quadro de planeamento) e o `ForemanPages.tsx:86` passam `onSite`. Vale `true` quando existe atribuição do trabalhador para `session.today`; os dois ficheiros já calculam as atribuições do dia.
  - `TeamsPage.tsx:49` deixa de fazer o `map` de avatares e passa a `<PhotoStack people={members.map((m) => ({ ...m, color: t.color }))} />`, onde `members` é a variável que hoje alimenta esse `map`.

- [ ] **Passo 5: correr.** `npx vitest run src/ui` deve passar, e `npx tsc -b && npx eslint .` também. Depois abrir `/planeamento`, `/trabalhadores` e `/equipas` com `npm run dev` e confirmar que os retratos aparecem e que não há erros na consola.

- [ ] **Passo 6: commit** (`feat(fotos): retratos em toda a app, ponto "em obra hoje" e pilha de retratos nas equipas`).

---

### Tarefa 9: Carregar e remover fotos

**Files:**
- Create: `src/ui/PhotoUpload.tsx`
- Modify: `src/features/workers/WorkerDetailPage.tsx` (cabeçalho), `src/features/worker-app/WorkerScreens.tsx:329` (perfil), `src/features/sites/SiteDetailPage.tsx` (capa, Tarefa 10), `src/features/vehicles/VehicleDetailPage.tsx` (Tarefa 11), `src/features/equipment/EquipmentPage.tsx` (Tarefa 11)

**Interfaces:**
- Consumes: `resizeImage`, `photoStore` (Tarefa 5) e `setPhoto` (Tarefa 6).
- Produces: `<PhotoUpload target={PhotoTarget} current={PhotoRef | undefined} alt={string} label?="Alterar foto" />`. É um botão secundário pequeno (`buttonStyles('secondary', 'sm')`) que abre o seletor de ficheiros:
  - aceita `image/jpeg`, `image/png` e `image/webp`;
  - mostra "A preparar a foto…" (`role=status`) enquanto trabalha;
  - quando termina, mostra o toast "Foto atualizada" com a ação "Anular";
  - se houver erro, mostra-o num `role=alert` com a mensagem de `resizeImage`;
  - quando há foto, aparece também o botão fantasma "Remover foto";
  - se `photoStore.persistent` for `false`, depois de carregar aparece o aviso: "Esta janela não guarda fotos: a foto desaparece quando fechar o separador."

- [ ] **Passo 1: implementação**

```tsx
// src/ui/PhotoUpload.tsx
import { Camera, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import type { PhotoRef } from '@/domain/photos'
import { photoStore } from '@/lib/photos/photoStore'
import { resizeImage } from '@/lib/photos/resize'
import type { PhotoTarget } from '@/store/actions/photos'
import { uid } from '@/store/helpers'
import { useDemo } from '@/store/store'
import { Button, buttonStyles } from './Button'

export function PhotoUpload({ target, current, alt, label = 'Alterar foto' }: { target: PhotoTarget; current: PhotoRef | undefined; alt: string; label?: string }) {
  const inputId = useId()
  const setPhoto = useDemo((s) => s.setPhoto)
  const undo = useDemo((s) => s.undo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const { blob, w, h } = await resizeImage(file)
      const id = uid('ph')
      await photoStore.put(id, blob)
      setPhoto(target, { kind: 'carregada', id, alt, w, h })
      toast.success('Foto atualizada', {
        description: photoStore.persistent ? undefined : 'Esta janela não guarda fotos: a foto desaparece quando fechar o separador.',
        action: { label: 'Anular', onClick: () => undo() },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar a foto.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={inputId} className={buttonStyles('secondary', 'sm')}>
        <Camera className="size-3.5" aria-hidden /> {label}
      </label>
      <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      {current && (
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => { setPhoto(target, null); toast('Foto removida', { action: { label: 'Anular', onClick: () => undo() } }) }}>
          Remover foto
        </Button>
      )}
      {busy && <span role="status" className="text-xs text-ink-3">A preparar a foto…</span>}
      {error && <span role="alert" className="text-xs text-tijolo">{error}</span>}
    </div>
  )
}
```

`buttonStyles(variant, size)` e `<Button size="sm">` já existem em `src/ui/Button.tsx`.

- [ ] **Passo 2: usar o componente**
  - **Ficha do trabalhador:** no cabeçalho, ao lado do `<Avatar size="lg">`, `<PhotoUpload target={{ type: 'trabalhador', id: w.id }} current={w.photo} alt={`Retrato de ${w.name}`} />`.
  - **App do trabalhador:** em `WorkerScreens.tsx:329` (perfil), o mesmo, com o rótulo "Mudar a minha foto".
  - **Obra, viatura e artigo:** o componente entra nas Tarefas 10 e 11.

- [ ] **Passo 3: verificar no browser.** Em `npm run dev`, abrir uma ficha de trabalhador e carregar um JPG. Confirmar:
  - o retrato muda na ficha e no `/planeamento`;
  - "Anular" repõe a foto anterior;
  - depois de recarregar a página, a foto carregada mantém-se.

- [ ] **Passo 4: commit** (`feat(fotos): carregar e remover fotos (trabalhador e app)`).

---

### Tarefa 10: Obras em cartões e capa da ficha

**Files:**
- Create: `src/features/sites/SiteCard.tsx`
- Modify: `src/features/sites/SitesPage.tsx` (alternar entre cartões e tabela com `?vista=tabela`; os cartões são o defeito)
- Modify: `src/features/sites/SiteDetailPage.tsx:113-125` (capa no cabeçalho)

**Interfaces:**
- Consumes: `<Photo>`, `SiteCode`, `CountryTag`, `HoursGauge`, `HoursStatus`, `Badge`, `SITE_STATUS` e `PhotoUpload`.
- Produces: `SiteCard({ s, client, foreman, teams, m })`, com os mesmos dados que hoje alimentam cada linha da tabela.

- [ ] **Passo 1: cartão da obra**

```tsx
// src/features/sites/SiteCard.tsx
import { Building2 } from 'lucide-react'
import { Link } from 'react-router'
import { SITE_STATUS } from '@/domain/labels'
import type { SiteMetrics } from '@/domain/siteMetrics'
import type { Client, Site, Team, Worker } from '@/domain/types'
import { Badge } from '@/ui/Badge'
import { HoursGauge, HoursStatus } from '@/ui/HoursGauge'
import { Photo } from '@/ui/Photo'
import { CountryTag } from '../shared/Country'

export function SiteCard({ s, client, foreman, teams, m }: { s: Site; client?: Client; foreman?: Worker; teams: Team[]; m: SiteMetrics }) {
  return (
    <article className="group overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-ink-4">
      <Link to={`/obras/${s.id}`} className="block focus-visible:outline-none">
        <div className="relative">
          <Photo photo={s.photo} format="capa" alt="" rounded="none" sizes="(min-width: 1280px) 420px, (min-width: 640px) 50vw, 100vw" fallback={<Building2 className="size-8 text-ink-4" aria-hidden />} />
          <span className="absolute bottom-2 left-2 rounded-xs bg-pinho px-1.5 py-0.5 font-mono text-[11px] font-semibold text-lima">{s.code} · {s.country}</span>
        </div>
        <div className="p-3">
          <h2 className="font-semibold text-ink group-hover:underline">{s.name}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3"><CountryTag country={s.country} /> {s.city} · <span className="truncate">{client?.name}</span></p>
        </div>
      </Link>
      <div className="space-y-2 px-3 pb-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <Badge tone={s.status === 'em_curso' ? 'ok' : s.status === 'planeada' ? 'info' : 'neutral'} dot>{SITE_STATUS[s.status]}</Badge>
          <span className="truncate text-ink-3">{teams.map((t) => t.name).join(', ') || 'Sem equipa'} · {foreman?.name ?? 'Sem encarregado'}</span>
        </div>
        <HoursGauge m={m} size="sm" />
        <HoursStatus m={m} className="block" />
      </div>
    </article>
  )
}
```

O tipo `SiteMetrics` está em `src/domain/siteMetrics.ts`. O `alt=""` é intencional, porque o nome da obra está no título do cartão.

- [ ] **Passo 2: página da lista.** Em `SitesPage.tsx`:
  - acrescentar `const view = sp.get('vista') === 'tabela' ? 'tabela' : 'cartoes'`;
  - acrescentar um `Segmented` (de `@/ui/Field`) com as opções "Cartões" e "Tabela" na barra de filtros, que muda o parâmetro `vista` através da função `set`;
  - com `view === 'cartoes'`, desenhar `<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map(... <SiteCard key={s.id} ... m={metrics[s.id]!} />)}</div>` e manter o `EmptyState` quando a lista está vazia;
  - a tabela atual fica igual no outro ramo.

- [ ] **Passo 3: capa na ficha.** Em `SiteDetailPage.tsx`, envolver o `<header>` atual numa grelha `md:grid-cols-[minmax(0,1fr)_320px]`:
  - à esquerda, o conteúdo atual;
  - à direita, `<Photo photo={s.photo} format="capa" eager sizes="320px" fallback={<Building2 …/>} />` e, por baixo, `<PhotoUpload target={{ type: 'obra', id }} current={s.photo} alt={`Obra ${s.name}, em ${s.city}`} label="Alterar capa" />`;
  - em telemóvel a capa vai para cima, com `order-first md:order-none`.

- [ ] **Passo 4: verificar.** `npx tsc -b && npx eslint .`. Depois, no browser, abrir `/obras` (cartões), `/obras?vista=tabela` e `/obras/s1` a 1440 e a 390 px, e confirmar que não há overflow horizontal.

- [ ] **Passo 5: commit** (`feat(fotos): obras em cartões com capa e código; capa na ficha da obra`).

---

### Tarefa 11: Viaturas e EPI com foto

**Files:**
- Modify: `src/features/vehicles/VehiclesPage.tsx` (miniatura na primeira coluna)
- Modify: `src/features/vehicles/VehicleDetailPage.tsx` (foto 4:3 com placa e selo)
- Modify: `src/features/equipment/EquipmentPage.tsx` (miniatura no catálogo e upload no detalhe do artigo, se existir; se não existir, junto à linha)

- [ ] **Passo 1: lista da frota.** Em `VehiclesPage.tsx`, dentro do `<Link>` da primeira coluna, antes de `<Plate>`, acrescentar `<Photo photo={v.photo} format="viatura" alt="" sizes="64px" rounded="sm" className="w-16" fallback={<Truck className="size-4 text-ink-4" aria-hidden />} />`.
- [ ] **Passo 2: ficha da viatura.** No cabeçalho de `VehicleDetailPage.tsx`, acrescentar à direita (ou em cima, em telemóvel) o bloco:

```tsx
<div className="relative w-full md:w-72">
  <Photo photo={v.photo} format="viatura" eager sizes="288px" fallback={<Truck className="size-8 text-ink-4" aria-hidden />} />
  <Plate plate={v.plate} className="absolute right-2 bottom-2 shadow-e1" />
  {v.status !== 'operacional' && <Badge tone="danger" dot className="absolute top-2 left-2">{VEHICLE_STATUS[v.status]}</Badge>}
</div>
<PhotoUpload target={{ type: 'viatura', id: v.id }} current={v.photo} alt={`${v.make} ${v.model}`} />
```

  O `alt` da foto vem do seed (`"${make} ${model}"`), por isso é descritivo.
- [ ] **Passo 3: catálogo de EPI.** Na lista do catálogo em `EquipmentPage.tsx`, cada artigo ganha `<Photo photo={item.photo} format="artigo" alt="" sizes="40px" rounded="sm" className="w-10" fallback={<Shirt className="size-4 text-ink-4" aria-hidden />} />` antes do nome. No sítio onde o artigo é editado, acrescentar `<PhotoUpload target={{ type: 'artigo', id: item.id }} current={item.photo} alt={item.name} />`. Se o ecrã não tiver edição de artigo, o upload vai para a linha do catálogo, como botão pequeno.
- [ ] **Passo 4: verificar** `/viaturas`, `/viaturas/v4` e `/equipamentos` a 1440 e a 390 px, e correr `npx tsc -b && npx eslint .`.
- [ ] **Passo 5: commit** (`feat(fotos): viaturas com foto, placa e selo; catálogo de EPI com fotos`).

---

### Tarefa 12: Mapa — miniaturas nos pinos e capa no painel

**Files:**
- Modify: `src/features/shared/SiteMap.tsx:14-25` (`pinIcon`)
- Modify: `src/features/geo-map/GeoMapPage.tsx` (painel da obra selecionada)

- [ ] **Passo 1: pino com miniatura.** No `pinIcon`, quando `site.photo?.kind === 'banco'`, o rótulo do pino passa a ter uma miniatura de 20×20 à esquerda do código:

```ts
const thumb = site.photo?.kind === 'banco'
  ? `<img src="/fotos/${site.photo.src}-s.webp" width="20" height="20" alt="" style="width:20px;height:20px;object-fit:cover;border-radius:3px;margin-right:4px;filter:saturate(.88) contrast(1.04)">`
  : ''
```

  Esse fragmento entra no `<div>` do rótulo, que passa a ter `display:flex;align-items:center`. As fotos carregadas não aparecem no pino, porque o HTML do Leaflet não passa pelo React; aparecem no painel.
- [ ] **Passo 2: capa no painel.** No painel lateral da obra selecionada em `GeoMapPage.tsx`, acrescentar `<Photo photo={site.photo} format="capa" sizes="360px" fallback={<Building2 …/>} />` no topo.
- [ ] **Passo 3: verificar** `/mapa`: pinos com miniatura, painel com capa e consola sem erros (o Leaflet tem de continuar sem animações).
- [ ] **Passo 4: commit** (`feat(fotos): miniaturas nos pinos e capa no painel do mapa`).

---

### Tarefa 13: Fluxo 15 em E2E, acessibilidade, crítica visual e documentação

**Files:**
- Create: `e2e/photos.spec.ts`, `e2e/fixtures/retrato.jpg`. A fixture é um JPEG de 600×600 gerado com o `sharp` a partir de uma cor sólida: `node -e "require('sharp')({create:{width:600,height:600,channels:3,background:'#888'}}).jpeg().toFile('e2e/fixtures/retrato.jpg')"`
- Modify: `e2e/a11y.spec.ts` (a rota `'/obras?vista=tabela'` entra em `GESTOR`)
- Modify: `README.md`, `docs/limitacoes.md` e `docs/review-report.md` (secção do bloco 1)

- [ ] **Passo 1: escrever o E2E (fluxo 15)**

```ts
// e2e/photos.spec.ts
import { expect, test } from '@playwright/test'
import { go, open, state } from './helpers'

test('fluxo 15: carregar a foto de um trabalhador reflete-se no planeamento e persiste', async ({ page }) => {
  await open(page, '/')
  const wid = await state<string>(page, '(s) => Object.values(s.db.workers)[0].id')
  await go(page, `/trabalhadores/${wid}`)
  await page.getByLabel('Alterar foto').setInputFiles('e2e/fixtures/retrato.jpg')
  await expect(page.getByText('Foto atualizada')).toBeVisible()
  expect(await state<string>(page, `(s) => s.db.workers['${wid}'].photo.kind`)).toBe('carregada')
  const src = await page.locator('main img').first().getAttribute('src')
  expect(src).toMatch(/^blob:/)
  await page.reload()
  expect(await state<string>(page, `(s) => s.db.workers['${wid}'].photo.kind`)).toBe('carregada')
  await expect(page.locator('main img[src^="blob:"]').first()).toBeVisible()
})

test('obras em cartões com capa e alternância para tabela', async ({ page }) => {
  await open(page, '/obras')
  await expect(page.getByRole('heading', { name: 'Edifício Atlântida' })).toBeVisible()
  await expect(page.locator('main article img').first()).toHaveAttribute('srcset', /obras\/s1-s\.webp/)
  await page.getByRole('radio', { name: 'Tabela' }).click()
  await expect(page.getByRole('table')).toBeVisible()
})
```

  - O nome acessível do input é o `<label>` "Alterar foto", porque o `htmlFor` aponta para o input.
  - O `Segmented` usa `role=radio`.
  - A persistência está ligada por defeito (`persistEnabled()`), por isso o `reload` mantém o estado.

- [ ] **Passo 2: correr e corrigir.** `npx playwright test e2e/photos.spec.ts` deve passar em desktop. Depois correr `npx playwright test`: todos os testes passam e o axe não encontra violações sérias.
- [ ] **Passo 3: crítica visual.** Tirar capturas de `/`, `/obras`, `/obras/s1`, `/trabalhadores`, `/planeamento`, `/equipas`, `/viaturas`, `/viaturas/v4`, `/equipamentos`, `/mapa` e `/app` a 1440 e a 390 px, com o spec `@quality` existente ou com o browser integrado.
  - Aplicar a skill `design:design-critique` às capturas e corrigir o que aparecer, em especial contraste das sobreposições, cortes de rosto e alinhamentos.
  - Confirmar CLS ≤ 0,02 em `/obras` com o Lighthouse.
- [ ] **Passo 4: documentação.**
  - `README.md`: comandos `npm run fotos` e `npm run fotos:folha`, e de onde vêm as fotos.
  - `docs/limitacoes.md`:
    - fotos carregadas só neste navegador (IndexedDB);
    - em janelas privadas, só em memória;
    - pinos do mapa só com fotos de banco.
  - `docs/review-report.md`: secção "Bloco 1 — fotos", com a evidência (contagens de testes e Lighthouse).
- [ ] **Passo 5: verificação final.** Correr `npx tsc -b && npx eslint . && npx vitest run && npm run build && npx playwright test && npm audit`. Tudo verde. O tamanho do bundle inicial, visto no output do build, não cresce mais de 15 KB gzip face a 190 KB.
- [ ] **Passo 6: commit e ponto de controlo.** Commit `feat(fotos): fluxo 15 em E2E, crítica visual e documentação do bloco 1`. Depois mostrar ao utilizador as capturas a 1440 e a 390 px, que são o ponto de controlo do bloco 1 na spec.

---

## Auto-revisão

- **Cobertura da spec (bloco 1):**

  | Ponto da spec | Tarefas |
  |---|---|
  | `PhotoRef` | 1 |
  | Formatos e tratamento de cor | 1 e 7 |
  | Origem de banco com autorização, créditos e folha de contacto | 2 e 3 |
  | Seed com fotos | 4 |
  | IndexedDB e alternativa em memória | 5 |
  | Repor limpa as fotos | 6 |
  | `alt` | 7 e 8 |
  | Lazy e srcset | 7 |
  | Retratos em toda a app e ponto Lima | 8 |
  | Equipas com pilha de retratos | 8 |
  | Upload | 9 |
  | Obras em cartões e capa | 10 |
  | Viaturas e EPI | 11 |
  | Pinos e painel do mapa | 12 |
  | Fluxo 15 em E2E, critérios de CLS e bundle, capturas | 13 |

  A página "Créditos das fotos" nas Definições fica para o bloco 6, como a spec define. Neste bloco os créditos ficam em `public/fotos/CREDITOS.md`.
- **Desvio assumido face à spec 3.3:** o `alt` dos retratos em listas fica vazio porque o nome está sempre ao lado; isto evita repetir o nome no leitor de ecrã. As fotos isoladas (capa, viatura) continuam com `alt` descritivo.
- **Consistência de nomes entre tarefas:**
  - `PhotoRef`, `photoUrl`, `photoSrcSet` e `fitWithin` (Tarefa 1);
  - `PHOTOS` e `ManifestPhoto` (Tarefa 2);
  - `assignSeedPhotos` (Tarefa 4);
  - `photoStore` e `createPhotoStore` (Tarefa 5);
  - `PhotoTarget` e `setPhoto` (Tarefa 6);
  - `usePhotoUrl` e `Photo` (Tarefa 7);
  - `PhotoStack` (Tarefa 8);
  - `PhotoUpload` (Tarefa 9);
  - `SiteCard` (Tarefa 10).
- **Confirmado no código antes de fechar o plano:**
  - `buttonStyles(variant, size)`;
  - `SiteMetrics`;
  - o `Segmented` com `role=radio`;
  - a persistência ligada por defeito;
  - o `open`, `go` e `state` dos helpers E2E.
