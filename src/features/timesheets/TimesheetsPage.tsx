import { ClipboardCheck, ClipboardPen } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useDerived } from '@/app/hooks'
import { ModuleGuard } from '@/app/ModuleGuard'
import type { EntryStatus } from '@/domain/types'
import { sheets } from '@/store/selectors'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { Select } from '@/ui/Field'
import { PageHeader } from '@/ui/Layout'
import { Tabs } from '@/ui/Tabs'
import { ManualEntryDialog } from './EntryDialogs'
import { SheetList } from './SheetList'

const TABS: { value: EntryStatus | 'todas'; label: string }[] = [
  { value: 'revisto', label: 'Por aprovar' },
  { value: 'submetido', label: 'Por rever' },
  { value: 'rejeitado', label: 'Devolvidas' },
  { value: 'aberto', label: 'Em curso hoje' },
  { value: 'aprovado', label: 'Aprovadas' },
  { value: 'todas', label: 'Todas' },
]

/** Horas e aprovações (gestor): folhas revistas pelos encarregados à espera de aprovação. */
export function TimesheetsPage() {
  const [sp, setSp] = useSearchParams()
  const status = (TABS.find((t) => t.value === sp.get('estado'))?.value ?? 'revisto') as EntryStatus | 'todas'
  const team = sp.get('equipa')
  const site = sp.get('obra')
  const set = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })
  const db = useDemo((s) => s.db)
  const [manual, setManual] = useState(false)
  const counts = useDerived(({ db: d }) => {
    const e = Object.values(d.entries)
    return Object.fromEntries(TABS.map((t) => [t.value, t.value === 'todas' ? 0 : sheets(e, t.value)]))
  })

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title="Horas e aprovações"
        description="Ponto do trabalhador → revisão do encarregado → aprovação do gestor. Só as horas aprovadas são consideradas definitivas."
        actions={<Button icon={<ClipboardPen className="size-4" />} onClick={() => setManual(true)}>Registo manual</Button>}
      />
      <ModuleGuard empty={{ icon: <ClipboardCheck />, title: 'Ainda não há horas registadas', text: 'As entradas e saídas registadas pelos trabalhadores ou pelos encarregados aparecem aqui para revisão e aprovação.' }}>
        <Tabs
          value={status}
          onValueChange={(v) => set('estado', v === 'revisto' ? null : v)}
          label="Estado das folhas"
          tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: counts[t.value] || undefined, tone: t.value === 'rejeitado' ? 'danger' : 'warn' }))}
        >
          <div className="mt-3 mb-3 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="h-team">Equipa</label>
            <Select id="h-team" value={team ?? ''} onChange={(e) => set('equipa', e.target.value || null)} className="w-48">
              <option value="">Todas as equipas</option>
              {Object.values(db.teams).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <label className="sr-only" htmlFor="h-site">Obra</label>
            <Select id="h-site" value={site ?? ''} onChange={(e) => set('obra', e.target.value || null)} className="w-56">
              <option value="">Todas as obras</option>
              {Object.values(db.sites).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
            </Select>
          </div>
          <SheetList mode="gestor" status={status} teamId={team} siteId={site} />
        </Tabs>
      </ModuleGuard>
      {manual && <ManualEntryDialog onClose={() => setManual(false)} />}
    </div>
  )
}
