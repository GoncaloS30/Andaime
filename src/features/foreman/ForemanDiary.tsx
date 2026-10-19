import { BookOpen } from 'lucide-react'
import { useState } from 'react'
import { useDerived } from '@/app/hooks'
import { selectForemanScope } from '@/store/selectors'
import { Select } from '@/ui/Field'
import { PageHeader } from '@/ui/Layout'
import { EmptyState } from '@/ui/States'
import { SiteDiary } from '../sites/diary/SiteDiary'

/** Diário de obra do encarregado: as obras dele, com a câmara do telemóvel à mão. */
export function ForemanDiary() {
  const sites = useDerived((s) => selectForemanScope(s).siteIds.map((id) => s.db.sites[id]!).filter(Boolean))
  const [chosen, setChosen] = useState<string | null>(null)
  const site = sites.find((s) => s.id === chosen) ?? sites[0]
  return (
    <div className="mx-auto max-w-[960px]">
      <PageHeader
        title="Diário de obra"
        description="O que se fez hoje, com fotos. O escritório vê no momento."
        actions={
          sites.length > 1 ? (
            <>
              <label className="sr-only" htmlFor="fd-site">Obra</label>
              <Select id="fd-site" value={site?.id ?? ''} onChange={(e) => setChosen(e.target.value)} className="w-64">
                {sites.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
              </Select>
            </>
          ) : undefined
        }
      />
      {site ? (
        <SiteDiary site={site} camera />
      ) : (
        <EmptyState icon={<BookOpen />} title="Sem obras atribuídas">Quando lhe for atribuída uma obra, o diário aparece aqui.</EmptyState>
      )}
    </div>
  )
}
