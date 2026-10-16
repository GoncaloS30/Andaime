import { Check, FileCheck2, FileUp, History, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { ModuleGuard } from '@/app/ModuleGuard'
import { DOC_STATE_LABEL, docState, latestDoc, requiredSiteDocTypes, workerCompliance, type DocState } from '@/domain/documents'
import { COUNTRY_NAME } from '@/domain/labels'
import type { Country, DocOwnerType, ID } from '@/domain/types'
import { dateNumeric, dateShort } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { PageHeader, Panel } from '@/ui/Layout'
import { Drawer } from '@/ui/Overlay'
import { EmptyState } from '@/ui/States'
import { TabPanel, Tabs } from '@/ui/Tabs'
import { DocumentDialog } from '../shared/DocumentDialog'

const TONE = (s: DocState) => (s === 'valido' ? 'ok' : s === 'a_expirar' || s === 'por_verificar' ? 'warn' : 'danger')
const RANK: DocState[] = ['em_falta', 'expirado', 'rejeitado', 'a_expirar', 'por_verificar', 'valido']

interface Target {
  ownerType: DocOwnerType
  ownerId: ID
  typeId: ID
}

function VersionsDrawer({ docId, onClose }: { docId: ID; onClose: () => void }) {
  const db = useDemo((s) => s.db)
  const d = db.documents[docId]
  if (!d) return null
  const t = db.docTypes[d.typeId]
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={`Versões · ${t?.short}`} description={d.ownerType === 'trabalhador' ? db.workers[d.ownerId]?.name : db.sites[d.ownerId]?.code ?? db.company.name}>
      <ol className="relative flex flex-col gap-4 border-l border-line pl-4">
        {[...d.versions].reverse().map((v) => (
          <li key={v.version}>
            <span aria-hidden className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-pinho ring-2 ring-surface" />
            <p className="text-sm font-semibold">Versão {v.version}</p>
            <p className="text-xs text-ink-3">{dateShort(v.at.slice(0, 10))} · {v.by}</p>
            <p className="text-sm">{v.expiresAt ? `Válido até ${dateNumeric(v.expiresAt)}` : 'Sem validade'}</p>
            {v.note && <p className="text-xs text-ink-2">{v.note}</p>}
          </li>
        ))}
      </ol>
      <p className="mt-4 font-mono text-xs text-ink-3">{d.fileName}</p>
    </Drawer>
  )
}

export function DocumentsPage() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('vista') ?? 'tratar'
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const verify = useDemo((s) => s.verifyDocument)
  const [target, setTarget] = useState<Target | null>(null)
  const [versions, setVersions] = useState<ID | null>(null)

  const todo = useDerived(({ db: d, session }) => {
    const rows: { key: string; ownerType: DocOwnerType; ownerId: ID; ownerName: string; typeId: ID; state: DocState; docId?: ID; expiresAt: string | null; why: string }[] = []
    for (const w of Object.values(d.workers)) {
      for (const r of workerCompliance(d, w.id, session.today)) {
        if (r.state === 'valido') continue
        rows.push({ key: `${w.id}-${r.type.id}`, ownerType: 'trabalhador', ownerId: w.id, ownerName: w.name, typeId: r.type.id, state: r.state, docId: r.doc?.id, expiresAt: r.doc?.expiresAt ?? null, why: r.countries.length ? `Exigido em ${r.countries.map((c) => COUNTRY_NAME[c]).join(', ')}` : 'Opcional' })
      }
    }
    for (const s of Object.values(d.sites)) {
      if (s.status === 'concluida' || s.status === 'planeada') continue
      for (const t of requiredSiteDocTypes(d, s.country)) {
        const doc = latestDoc(d, s.id, t.id)
        const st = docState(doc, session.today)
        if (st !== 'valido') rows.push({ key: `${s.id}-${t.id}`, ownerType: 'obra', ownerId: s.id, ownerName: `${s.code} ${s.name}`, typeId: t.id, state: st, docId: doc?.id, expiresAt: doc?.expiresAt ?? null, why: `Obra em ${COUNTRY_NAME[s.country]}` })
      }
    }
    for (const t of Object.values(d.docTypes).filter((x) => x.appliesTo === 'empresa')) {
      const doc = latestDoc(d, 'empresa', t.id)
      const st = docState(doc, session.today)
      if (st !== 'valido') rows.push({ key: `emp-${t.id}`, ownerType: 'empresa', ownerId: 'empresa', ownerName: d.company.name, typeId: t.id, state: st, docId: doc?.id, expiresAt: doc?.expiresAt ?? null, why: 'Empresa' })
    }
    return rows.sort((a, b) => RANK.indexOf(a.state) - RANK.indexOf(b.state) || (a.expiresAt ?? '').localeCompare(b.expiresAt ?? ''))
  })

  const matrix = useDerived(({ db: d, session }) => {
    const types = Object.values(d.docTypes).filter((t) => t.appliesTo === 'trabalhador' && t.mandatory)
    return { types, rows: Object.values(d.workers).sort((a, b) => a.name.localeCompare(b.name)).map((w) => ({ w, comp: new Map(workerCompliance(d, w.id, session.today).map((r) => [r.type.id, r])) })) }
  })

  const countries: Country[] = ['PT', 'FR', 'BE', 'DE']

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Documentos"
        description="Validades e requisitos de trabalhadores, obras e empresa. Os requisitos por país são ilustrativos e não constituem aconselhamento jurídico."
      />
      <ModuleGuard empty={{ icon: <FileCheck2 />, title: 'Sem documentos', text: 'Registe aptidões médicas, formações e documentos de destacamento para receber alertas de validade.' }}>
        <Tabs
          value={tab}
          onValueChange={(v) => setSp(v === 'tratar' ? {} : { vista: v }, { replace: true })}
          label="Documentos"
          tabs={[
            { value: 'tratar', label: 'A tratar', count: todo.length, tone: 'danger' },
            { value: 'trabalhadores', label: 'Por trabalhador' },
            { value: 'requisitos', label: 'Requisitos por país' },
            { value: 'catalogo', label: 'Catálogo' },
          ]}
        >
          <TabPanel value="tratar">
            {todo.length === 0 ? (
              <EmptyState icon={<ShieldCheck />} title="Tudo em dia">Não há documentos expirados, a expirar, em falta ou por verificar.</EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                <table className="table-a min-w-[900px]">
                  <thead><tr><th scope="col">Documento</th><th scope="col">De</th><th scope="col">Porquê</th><th scope="col">Validade</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
                  <tbody>
                    {todo.map((r) => (
                      <tr key={r.key}>
                        <td className="font-medium">
                          {db.docTypes[r.typeId]?.name}
                          {r.docId && (
                            <button type="button" onClick={() => setVersions(r.docId!)} className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-ink-3 hover:text-ink">
                              <History className="size-3" aria-hidden /> {db.documents[r.docId]?.versions.length} versões
                            </button>
                          )}
                        </td>
                        <td>
                          <Link to={r.ownerType === 'trabalhador' ? `/trabalhadores/${r.ownerId}?tab=documentos` : r.ownerType === 'obra' ? `/obras/${r.ownerId}?tab=documentos` : '/documentos'} className="hover:underline">{r.ownerName}</Link>
                        </td>
                        <td className="text-xs text-ink-3">{r.why}</td>
                        <td className="font-mono text-xs">{r.expiresAt ? dateNumeric(r.expiresAt) : '—'}</td>
                        <td><Badge tone={TONE(r.state)} dot>{DOC_STATE_LABEL[r.state]}</Badge></td>
                        <td className="text-right whitespace-nowrap">
                          {r.state === 'por_verificar' && r.docId ? (
                            <span className="inline-flex gap-1">
                              <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={() => { verify(r.docId!, 'verificado'); toast.success('Documento verificado') }}>Validar</Button>
                              <Button size="sm" icon={<X className="size-3.5" />} onClick={() => { verify(r.docId!, 'rejeitado'); toast.success('Documento rejeitado', { description: 'Fica a contar como inválido até nova versão.' }) }}>Rejeitar</Button>
                            </span>
                          ) : (
                            <Button size="sm" variant="primary" icon={<FileUp className="size-3.5" />} onClick={() => setTarget({ ownerType: r.ownerType, ownerId: r.ownerId, typeId: r.typeId })}>{r.docId ? 'Atualizar' : 'Registar'}</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabPanel>
          <TabPanel value="trabalhadores">
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="table-a min-w-[860px]">
                <thead>
                  <tr>
                    <th scope="col">Trabalhador</th>
                    {matrix.types.map((t) => <th key={t.id} scope="col">{t.short}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map(({ w, comp }) => (
                    <tr key={w.id}>
                      <td><Link to={`/trabalhadores/${w.id}?tab=documentos`} className="hover:underline">{w.name}</Link></td>
                      {matrix.types.map((t) => {
                        const r = comp.get(t.id)
                        if (!r) return <td key={t.id} className="text-xs text-ink-4">não exigido</td>
                        return (
                          <td key={t.id}>
                            <button type="button" onClick={() => setTarget({ ownerType: 'trabalhador', ownerId: w.id, typeId: t.id })} className="rounded-sm hover:ring-1 hover:ring-ink-4" aria-label={`${t.short} de ${w.name}: ${DOC_STATE_LABEL[r.state]}. Atualizar.`}>
                              <Badge tone={TONE(r.state)} dot>{r.state === 'valido' && r.doc?.expiresAt ? dateNumeric(r.doc.expiresAt).slice(3) : DOC_STATE_LABEL[r.state]}</Badge>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabPanel>
          <TabPanel value="requisitos">
            <Panel title="Requisitos por país" description="Ilustrativo: confirme sempre com a entidade competente antes de destacar trabalhadores." flush>
              <div className="overflow-x-auto">
                <table className="table-a min-w-[720px]">
                  <thead><tr><th scope="col">Documento</th><th scope="col">Aplica-se a</th>{countries.map((c) => <th key={c} scope="col" className="text-center">{COUNTRY_NAME[c]}</th>)}</tr></thead>
                  <tbody>
                    {Object.values(db.docTypes).map((t) => (
                      <tr key={t.id}>
                        <td><span className="font-medium">{t.name}</span><span className="block text-xs text-ink-3">{t.description}</span></td>
                        <td className="text-xs capitalize">{t.appliesTo}{!t.mandatory && ' · opcional'}</td>
                        {countries.map((c) => {
                          const on = t.countries === 'all' || t.countries.includes(c)
                          return <td key={c} className="text-center">{on ? <Check className={cn('mx-auto size-4', t.mandatory ? 'text-pinho' : 'text-ink-4')} aria-label="Exigido" /> : <span className="text-ink-4" aria-label="Não exigido">—</span>}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </TabPanel>
          <TabPanel value="catalogo">
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="table-a min-w-[700px]">
                <thead><tr><th scope="col">Tipo</th><th scope="col">Abreviatura</th><th scope="col">Aplica-se a</th><th scope="col">Validade</th><th scope="col" className="num">Registados</th></tr></thead>
                <tbody>
                  {Object.values(db.docTypes).map((t) => (
                    <tr key={t.id}>
                      <td className="font-medium">{t.name}</td>
                      <td>{t.short}</td>
                      <td className="capitalize">{t.appliesTo}</td>
                      <td>{t.validityMonths ? `${t.validityMonths} meses` : 'Sem validade'}</td>
                      <td className="num tabular">{Object.values(db.documents).filter((d) => d.typeId === t.id).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-3">Documentos das viaturas (seguro, inspeção) são geridos em Viaturas. Hoje: {dateShort(today)}.</p>
          </TabPanel>
        </Tabs>
      </ModuleGuard>
      {target && <DocumentDialog open onOpenChange={() => setTarget(null)} {...target} />}
      {versions && <VersionsDrawer docId={versions} onClose={() => setVersions(null)} />}
    </div>
  )
}
