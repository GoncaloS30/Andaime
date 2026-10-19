import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Link } from 'react-router'
import { PHOTO_CREDITS } from '@/data/photoCredits'
import { buttonStyles } from '@/ui/Button'
import { PageHeader } from '@/ui/Layout'

const GROUPS: [string, string][] = [
  ['trabalhadores', 'Trabalhadores'],
  ['gestores', 'Gestores'],
  ['obras', 'Obras'],
  ['viaturas', 'Viaturas'],
  ['epi', 'EPI e ferramentas'],
  ['diario', 'Diário de obra'],
  ['hoteis', 'Alojamento'],
]

/** Créditos das fotos de banco: autor, licença e origem de cada foto usada na demonstração. */
export function PhotoCreditsPage() {
  return (
    <div className="mx-auto max-w-[1080px]">
      <Link to="/definicoes" className={buttonStyles('ghost', 'sm', 'mb-2 -ml-2')}><ArrowLeft className="size-3.5" aria-hidden /> Definições</Link>
      <PageHeader
        title="Créditos das fotos"
        description={`${PHOTO_CREDITS.length} fotos de banco com licença livre (Pexels). As pessoas retratadas não têm qualquer relação com os nomes fictícios da demonstração.`}
      />
      <div className="flex flex-col gap-6">
        {GROUPS.map(([key, label]) => {
          const list = PHOTO_CREDITS.filter((c) => c.src.startsWith(`${key}/`))
          if (!list.length) return null
          return (
            <section key={key} aria-labelledby={`cred-${key}`}>
              <h2 id={`cred-${key}`} className="mb-2 font-expanded text-sm font-semibold">{label} <span className="font-normal text-ink-3">· {list.length}</span></h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {list.map((c) => (
                  <li key={c.src} className="overflow-hidden rounded-md border border-line bg-surface">
                    <img src={`/fotos/${c.src}-s.webp`} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full bg-line-2 object-cover" />
                    <div className="p-2 text-xs">
                      <p className="truncate font-medium" title={c.author}>{c.author}</p>
                      <p className="text-ink-3">{c.license}</p>
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-pinho underline-offset-2 hover:underline">
                        Original <ExternalLink className="size-3" aria-hidden /><span className="sr-only"> de {c.author} (abre noutro separador)</span>
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
