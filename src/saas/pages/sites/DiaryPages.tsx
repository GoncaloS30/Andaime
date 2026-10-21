import { BookOpen } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { SiteCode } from '@/ui/Badge'
import { Field, Select } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { useRecentDiary } from '../../api/diary'
import { formatDate, useSites } from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { SiteDiary } from './SiteDiary'

/** Diário do encarregado (telemóvel primeiro): escolhe uma das suas obras e escreve, com a câmara à mão. */
export function ForemanDiaryPage() {
  const org = useActiveOrg()
  const sites = useSites(org.id, {})
  const [params, setParams] = useSearchParams()
  const list = (sites.data ?? []).filter((s) => !s.archived)
  const chosen = list.find((s) => s.id === params.get('obra')) ?? list.find((s) => s.status === 'ACTIVE') ?? list[0]

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Diário de obra" description="O que se fez hoje e as fotos que se tiraram, obra a obra." />
      {sites.isPending ? (
        <SkeletonRows rows={4} />
      ) : sites.isError ? (
        <ErrorState onRetry={() => void sites.refetch()} />
      ) : !chosen ? (
        <Panel>
          <EmptyState icon={<BookOpen />} title="Sem obras atribuídas">
            O diário fica disponível nas obras de que é encarregado ou onde a sua equipa está planeada.
          </EmptyState>
        </Panel>
      ) : (
        <>
          {list.length > 1 && (
            <Field label="Obra" className="mb-4 max-w-md">
              {(p) => (
                <Select {...p} value={chosen.id} onChange={(e) => setParams({ obra: e.target.value }, { replace: true })}>
                  {list.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {list.length === 1 && (
            <p className="mb-3 flex items-center gap-2 text-sm text-ink-2">
              <SiteCode code={chosen.code} color={chosen.color} /> {chosen.name}
            </p>
          )}
          <SiteDiary key={chosen.id} siteId={chosen.id} siteLabel={`${chosen.code} · ${chosen.name}`} camera />
        </>
      )}
    </div>
  )
}

/** Início do gestor: últimos registos do diário de todas as obras, com miniaturas. Não aparece enquanto não houver registos. */
export function RecentDiaryPanel() {
  const org = useActiveOrg()
  const recent = useRecentDiary(org.id)
  if (!recent.data?.length) return null
  return (
    <Panel className="mb-5" title="Diário de obra — últimos registos" flush>
      <ul className="divide-y divide-line-2">
        {recent.data.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <Link to={`/obras/${e.siteId}?separador=diario`} className="font-medium text-pinho hover:underline">
                {e.title}
              </Link>
              <p className="truncate text-xs text-ink-3">
                <span className="font-mono">{e.siteCode}</span> {e.siteName} · {formatDate(e.date)} · {e.authorName}
                {e.photoCount > 0 && ` · ${e.photoCount === 1 ? '1 foto' : `${e.photoCount} fotos`}`}
              </p>
            </div>
            {e.photos.length > 0 && (
              <ul className="flex gap-1" aria-label={`Fotos de ${e.title}`}>
                {e.photos.slice(0, 3).map((p, i) => (
                  <li key={p.id} className="aspect-[4/3] w-14 overflow-hidden rounded-xs bg-line-2">
                    <img src={p.url} alt={`Foto ${i + 1} de ${e.title}`} loading="lazy" className="size-full object-cover" />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
