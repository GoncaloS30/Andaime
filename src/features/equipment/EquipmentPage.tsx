import { PackageCheck, Shirt } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ModuleGuard } from '@/app/ModuleGuard'
import { BOOT_SIZES, CLOTHING_SIZES, DELIVERY_STATUS, GLOVE_SIZES, TROUSER_SIZES } from '@/domain/labels'
import type { DeliveryStatus, Sizes } from '@/domain/types'
import { dateNumeric } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { Badge } from '@/ui/Badge'
import { Photo } from '@/ui/Photo'
import { PhotoUpload } from '@/ui/PhotoUpload'
import { Button } from '@/ui/Button'
import { Select } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { Menu } from '@/ui/Menu'
import { TabPanel, Tabs } from '@/ui/Tabs'
import { DeliveryDialog } from '../shared/DeliveryDialog'

const KIND = { fardamento: 'Fardamento', epi: 'EPI', ferramenta: 'Ferramenta' } as const
const SIZE_SETS: { key: keyof Sizes; label: string; sizes: string[] }[] = [
  { key: 'tshirt', label: 'T-shirt', sizes: CLOTHING_SIZES },
  { key: 'sweat', label: 'Sweat', sizes: CLOTHING_SIZES },
  { key: 'parka', label: 'Parka', sizes: CLOTHING_SIZES },
  { key: 'calcas', label: 'Calças', sizes: TROUSER_SIZES },
  { key: 'botas', label: 'Botas', sizes: BOOT_SIZES },
  { key: 'luvas', label: 'Luvas', sizes: GLOVE_SIZES },
]

export function EquipmentPage() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('vista') ?? 'catalogo'
  const db = useDemo((s) => s.db)
  const recordReturn = useDemo((s) => s.recordReturn)
  const [deliver, setDeliver] = useState<{ itemId?: string } | null>(null)
  const [status, setStatus] = useState<DeliveryStatus | ''>('')
  const deliveries = Object.values(db.deliveries).filter((d) => !status || d.status === status).sort((a, b) => b.date.localeCompare(a.date))
  const workers = Object.values(db.workers).filter((w) => w.status === 'ativo').sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Fardamento e EPI"
        description="Tamanhos, stock, entregas e devoluções de fardamento, equipamento de proteção e ferramentas."
        actions={<Button variant="primary" icon={<PackageCheck className="size-4" />} onClick={() => setDeliver({})}>Registar entrega</Button>}
      />
      <ModuleGuard empty={{ icon: <Shirt />, title: 'Sem catálogo', text: 'Registe os artigos de fardamento e EPI para controlar entregas e tamanhos.' }}>
        <Tabs value={tab} onValueChange={(v) => setSp(v === 'catalogo' ? {} : { vista: v }, { replace: true })} label="Fardamento e EPI" tabs={[{ value: 'catalogo', label: 'Catálogo e stock' }, { value: 'entregas', label: 'Entregas' }, { value: 'tamanhos', label: 'Tamanhos' }]}>
          <TabPanel value="catalogo">
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="table-a min-w-[720px]">
                <thead><tr><th scope="col">Artigo</th><th scope="col">Tipo</th><th scope="col" className="num">Em stock</th><th scope="col" className="num">Com trabalhadores</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>
                  {Object.values(db.equipment).map((e) => {
                    const out = Object.values(db.deliveries).filter((d) => d.itemId === e.id && d.status === 'entregue').reduce((s, d) => s + d.qty, 0)
                    return (
                      <tr key={e.id}>
                        <td className="font-medium">
                          <span className="flex items-center gap-2.5">
                            <Photo photo={e.photo} format="artigo" alt="" sizes="40px" rounded="sm" className="w-10" fallback={<Shirt className="size-4 text-ink-4" aria-hidden />} />
                            <span>{e.name}{e.sizeKind && <span className="ml-1.5 text-xs font-normal text-ink-3">por tamanho</span>}</span>
                          </span>
                        </td>
                        <td><Badge>{KIND[e.kind]}</Badge></td>
                        <td className="num">
                          <span className="font-mono tabular">{e.stock}</span>
                          {e.stock < 5 && <Badge tone="warn" dot className="ml-2">Stock baixo</Badge>}
                        </td>
                        <td className="num font-mono tabular">{out}</td>
                        <td>
                          <span className="flex items-center justify-end gap-1">
                            <PhotoUpload target={{ type: 'artigo', id: e.id }} current={e.photo} alt={e.name} label="Foto" compact />
                            <Button size="sm" variant="ghost" onClick={() => setDeliver({ itemId: e.id })}>Entregar</Button>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </TabPanel>
          <TabPanel value="entregas">
            <div className="mb-3">
              <label className="sr-only" htmlFor="eq-st">Estado</label>
              <Select id="eq-st" value={status} onChange={(e) => setStatus(e.target.value as DeliveryStatus | '')} className="w-48">
                <option value="">Todos os estados</option>
                {Object.entries(DELIVERY_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div className="max-h-[70dvh] overflow-auto rounded-lg border border-line bg-surface">
              <table className="table-a min-w-[860px]">
                <thead><tr><th scope="col">Data</th><th scope="col">Trabalhador</th><th scope="col">Artigo</th><th scope="col">Tamanho</th><th scope="col" className="num">Qtd.</th><th scope="col">Estado</th><th scope="col">Por</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>
                  {deliveries.slice(0, 200).map((d) => (
                    <tr key={d.id}>
                      <td className="text-xs whitespace-nowrap">{dateNumeric(d.date)}</td>
                      <td><Link to={`/trabalhadores/${d.workerId}?tab=equipamentos`} className="hover:underline">{db.workers[d.workerId]?.name}</Link></td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Photo photo={db.equipment[d.itemId]?.photo} format="artigo" alt="" sizes="32px" rounded="sm" className="w-8" fallback={<Shirt className="size-3.5 text-ink-4" aria-hidden />} />
                          <span>{db.equipment[d.itemId]?.name}{d.note && <span className="block text-xs text-ink-3">{d.note}</span>}</span>
                        </span>
                      </td>
                      <td className="font-mono text-xs">{d.size || '—'}</td>
                      <td className="num tabular">{d.qty}</td>
                      <td><Badge tone={d.status === 'entregue' ? 'info' : d.status === 'devolvido' ? 'neutral' : 'danger'} dot>{DELIVERY_STATUS[d.status]}</Badge></td>
                      <td className="text-xs text-ink-3">{d.by}</td>
                      <td className="text-right">
                        {d.status === 'entregue' && (
                          <Menu
                            trigger={<Button size="sm" variant="ghost">Registar…</Button>}
                            items={(['devolvido', 'danificado', 'perdido'] as const).map((s) => ({
                              label: DELIVERY_STATUS[s],
                              danger: s === 'perdido',
                              onSelect: () => { recordReturn(d.id, s, ''); toast.success(s === 'devolvido' ? 'Devolução registada, stock reposto' : `Registado como ${DELIVERY_STATUS[s].toLowerCase()}`) },
                            }))}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {deliveries.length > 200 && <p className="mt-2 text-xs text-ink-3">A mostrar as 200 entregas mais recentes de {deliveries.length}.</p>}
          </TabPanel>
          <TabPanel value="tamanhos">
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              <Panel title="Resumo por tamanho" description="Útil para encomendas: quantos trabalhadores ativos usam cada tamanho.">
                <div className="flex flex-col gap-3">
                  {SIZE_SETS.map((s) => {
                    const counts = s.sizes.map((z) => ({ z, n: workers.filter((w) => w.sizes[s.key] === z).length })).filter((x) => x.n > 0)
                    const missing = workers.filter((w) => !w.sizes[s.key]).length
                    return (
                      <div key={s.key}>
                        <p className="mb-1 text-xs font-semibold text-ink-3">{s.label}</p>
                        <div className="flex flex-wrap gap-1">
                          {counts.map(({ z, n }) => <span key={z} className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-xs"><strong>{z}</strong> × {n}</span>)}
                          {missing > 0 && <Badge tone="warn">{missing} sem tamanho</Badge>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Panel>
              <div className="max-h-[70dvh] overflow-auto rounded-lg border border-line bg-surface">
                <table className="table-a">
                  <thead><tr><th scope="col">Trabalhador</th>{SIZE_SETS.map((s) => <th key={s.key} scope="col">{s.label}</th>)}</tr></thead>
                  <tbody>
                    {workers.map((w) => (
                      <tr key={w.id}>
                        <td><Link to={`/trabalhadores/${w.id}?tab=fardamento`} className="hover:underline">{w.name}</Link></td>
                        {SIZE_SETS.map((s) => <td key={s.key} className="font-mono text-xs">{w.sizes[s.key] ?? <span className="text-ambar-ink">—</span>}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabPanel>
        </Tabs>
      </ModuleGuard>
      {deliver && <DeliveryDialog open onOpenChange={() => setDeliver(null)} itemId={deliver.itemId} />}
    </div>
  )
}
