import { CheckCircle2, Download, FileCheck2, FileUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Checkbox, Field, Input, Select } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { Dialog, Drawer } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { TabPanel, Tabs } from '@/ui/Tabs'
import { errorMessage, isApiError } from '../../api/http'
import {
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  downloadUrl,
  useCompliance,
  useDocument,
  useDocumentAction,
  useDocuments,
  useDocumentTypes,
  useSaveDocumentType,
  useUploadDocument,
  type DocStatus,
} from '../../api/operations'
import { atLeast } from '../../api/types'
import { formatDate, useEmployeeOptions } from '../../api/workforce'
import { useActiveOrg } from '../../session'

const SIZE = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/** Documentos: conformidade por trabalhador, documentos carregados e tipos/exigências da empresa. */
export function DocumentsPage() {
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(params.get('employeeId') ? 'documents' : 'compliance')
  const [uploading, setUploading] = useState<{ employeeId?: string; typeId?: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title={manager ? 'Documentos' : 'Documentação da equipa'}
        description="Ficheiros guardados em armazenamento privado; o download passa sempre pela verificação de acesso."
        actions={
          <Button variant="primary" icon={<FileUp className="size-4" />} onClick={() => setUploading({})}>
            Carregar documento
          </Button>
        }
      />
      <Tabs
        value={tab}
        onValueChange={setTab}
        label="Secções de documentos"
        tabs={[
          { value: 'compliance', label: 'Conformidade' },
          { value: 'documents', label: 'Documentos' },
          ...(manager ? [{ value: 'types', label: 'Tipos e exigências' }] : []),
        ]}
      >
        <TabPanel value="compliance" className="pt-4">
          <ComplianceTab onUpload={(employeeId, typeId) => setUploading({ employeeId, typeId })} onOpen={setOpen} />
        </TabPanel>
        <TabPanel value="documents" className="pt-4">
          <DocumentsTab
            employeeId={params.get('employeeId') ?? undefined}
            onClearEmployee={() => setParams({})}
            onOpen={setOpen}
          />
        </TabPanel>
        {manager && (
          <TabPanel value="types" className="pt-4">
            <TypesTab />
          </TabPanel>
        )}
      </Tabs>
      {uploading && <UploadDialog preset={uploading} onClose={() => setUploading(null)} />}
      <DocumentDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function ComplianceTab({ onUpload, onOpen }: { onUpload: (employeeId: string, typeId: string) => void; onOpen: (id: string) => void }) {
  const org = useActiveOrg()
  const [country, setCountry] = useState('')
  const compliance = useCompliance(org.id, country || undefined)
  if (compliance.isPending) return <SkeletonRows rows={6} />
  if (compliance.isError) return <ErrorState onRetry={() => void compliance.refetch()}>{errorMessage(compliance.error)}</ErrorState>
  const rows = compliance.data
  const types = rows[0]?.items.map((i) => ({ id: i.typeId, name: i.typeName })) ?? []
  return (
    <Panel
      flush
      title="Documentos obrigatórios"
      description="Obrigatórios em todas as obras e, se escolher um país, também os exigidos para obras nesse país."
      actions={
        <Input aria-label="País das obras" placeholder="País (ex.: FR)" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} className="h-8 w-32" />
      }
    >
      {types.length === 0 ? (
        <EmptyState icon={<FileCheck2 />} title="Nenhum documento é obrigatório">
          Defina em “Tipos e exigências” os documentos exigidos para trabalhar nas obras.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="px-4 py-2 font-semibold">Trabalhador</th>
                {types.map((t) => (
                  <th key={t.id} className="px-2 py-2 font-semibold">
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} className="border-b border-line-2 last:border-0">
                  <td className="px-4 py-2 font-semibold text-ink">{r.employeeName}</td>
                  {r.items.map((i) => (
                    <td key={i.typeId} className="px-2 py-2">
                      <button
                        type="button"
                        className="flex flex-col items-start text-left"
                        onClick={() => (i.documentId ? onOpen(i.documentId) : onUpload(r.employeeId, i.typeId))}
                        aria-label={`${i.typeName} de ${r.employeeName}: ${DOC_STATUS_LABEL[i.status]}${i.documentId ? '' : '. Carregar'}`}
                      >
                        <Badge tone={DOC_STATUS_TONE[i.status]}>{DOC_STATUS_LABEL[i.status]}</Badge>
                        {i.expiresOn && <span className="mt-0.5 text-xs text-ink-3 tabular">até {formatDate(i.expiresOn)}</span>}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function DocumentsTab({ employeeId, onClearEmployee, onOpen }: { employeeId?: string; onClearEmployee: () => void; onOpen: (id: string) => void }) {
  const org = useActiveOrg()
  const [status, setStatus] = useState('')
  const documents = useDocuments(org.id, { employeeId, status })
  return (
    <Panel
      flush
      title="Documentos carregados"
      actions={
        <span className="flex items-center gap-2">
          {employeeId && (
            <Button size="sm" variant="ghost" onClick={onClearEmployee}>
              Ver todos
            </Button>
          )}
          <Select aria-label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 max-w-[160px]">
            <option value="">Todas as situações</option>
            {(['VALID', 'EXPIRING', 'EXPIRED'] as DocStatus[]).map((s) => (
              <option key={s} value={s}>
                {DOC_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </span>
      }
    >
      {documents.isPending ? (
        <SkeletonRows rows={5} />
      ) : documents.isError ? (
        <ErrorState onRetry={() => void documents.refetch()}>{errorMessage(documents.error)}</ErrorState>
      ) : documents.data.length === 0 ? (
        <EmptyState icon={<FileCheck2 />} title="Sem documentos" />
      ) : (
        <ul className="divide-y divide-line-2">
          {documents.data.map((d) => (
            <li key={d.id}>
              <button type="button" className="grid w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-cal md:grid-cols-[1.4fr_1fr_0.8fr_0.6fr]" onClick={() => onOpen(d.id)}>
                <span className="font-semibold text-ink">{d.employeeName ?? d.vehiclePlate}</span>
                <span className="text-sm text-ink-2">{d.typeName}</span>
                <span className="text-sm text-ink-3 tabular">{d.expiresOn ? `até ${formatDate(d.expiresOn)}` : 'Sem validade'}</span>
                <span className="flex flex-wrap gap-1">
                  <Badge tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>
                  {!d.verified && <Badge tone="info">Por verificar</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function TypesTab() {
  const org = useActiveOrg()
  const types = useDocumentTypes(org.id)
  const save = useSaveDocumentType(org.id)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState<'EMPLOYEE' | 'VEHICLE'>('EMPLOYEE')
  const [alertDays, setAlertDays] = useState('30')
  const [countries, setCountries] = useState<Record<string, string>>({})
  if (types.isPending) return <SkeletonRows rows={5} />
  if (types.isError) return <ErrorState onRetry={() => void types.refetch()} />
  const setRequirement = (id: string, everywhere: boolean, list: string[]) =>
    save.mutate({ mode: 'requirements', id, everywhere, countries: list }, { onSuccess: () => toast.success('Exigência atualizada'), onError: (e) => toast.error(errorMessage(e)) })
  return (
    <Panel
      flush
      title="Tipos de documento"
      description="Escolha onde cada documento é obrigatório. Um trabalhador planeado sem um documento obrigatório válido gera um aviso no planeamento."
      actions={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          Novo tipo
        </Button>
      }
    >
      <ul className="divide-y divide-line-2">
        {types.data.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="font-semibold text-ink">{t.name}</span>
              <span className="block text-xs text-ink-3">
                {t.subject === 'EMPLOYEE' ? 'Trabalhador' : 'Viatura'} · {t.requiresExpiry ? `aviso ${t.alertDays} dias antes de caducar` : 'sem validade'}
              </span>
            </span>
            {t.subject === 'EMPLOYEE' && (
              <span className="flex flex-wrap items-center gap-3">
                <Checkbox label="Obrigatório em todas as obras" checked={t.requiredEverywhere} onChange={(e) => setRequirement(t.id, e.target.checked, t.requiredCountries)} />
                <Input
                  aria-label={`Países onde ${t.name} é obrigatório`}
                  placeholder="Países (FR, BE)"
                  className="h-8 w-40"
                  value={countries[t.id] ?? t.requiredCountries.join(', ')}
                  onChange={(e) => setCountries({ ...countries, [t.id]: e.target.value })}
                  onBlur={() => {
                    const list = (countries[t.id] ?? '').split(/[,\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)
                    if (countries[t.id] !== undefined && list.join(',') !== t.requiredCountries.join(',')) setRequirement(t.id, t.requiredEverywhere, list)
                  }}
                />
              </span>
            )}
          </li>
        ))}
      </ul>
      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="Novo tipo de documento"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={name.trim().length < 2}
              loading={save.isPending}
              onClick={() =>
                save.mutate(
                  { mode: 'create', name: name.trim(), subject, requiresExpiry: true, alertDays: Number(alertDays) || 30 },
                  { onSuccess: () => (toast.success('Tipo criado'), setCreating(false), setName('')), onError: (e) => toast.error(errorMessage(e)) },
                )
              }
            >
              Criar
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" className="sm:col-span-2">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Titular">
            {(p) => (
              <Select {...p} value={subject} onChange={(e) => setSubject(e.target.value as 'EMPLOYEE' | 'VEHICLE')}>
                <option value="EMPLOYEE">Trabalhador</option>
                <option value="VEHICLE">Viatura</option>
              </Select>
            )}
          </Field>
          <Field label="Avisar com (dias)">{(p) => <Input {...p} type="number" min={0} max={365} value={alertDays} onChange={(e) => setAlertDays(e.target.value)} />}</Field>
        </div>
      </Dialog>
    </Panel>
  )
}

/** Carregar ou renovar um documento (cria uma nova versão se já existir um do mesmo tipo). */
export function UploadDialog({ preset, onClose, selfOnly = false }: { preset: { employeeId?: string; typeId?: string }; onClose: () => void; selfOnly?: boolean }) {
  const org = useActiveOrg()
  const types = useDocumentTypes(org.id)
  const employees = useEmployeeOptions(org.id, !selfOnly)
  const upload = useUploadDocument(org.id)
  const [employeeId, setEmployeeId] = useState(preset.employeeId ?? '')
  const [typeId, setTypeId] = useState(preset.typeId ?? '')
  const [issuedOn, setIssuedOn] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const type = types.data?.find((t) => t.id === typeId)
  const ready = !!typeId && !!file && (selfOnly || !!employeeId) && (!type?.requiresExpiry || !!expiresOn)
  const fieldError = (name: string) => (isApiError(upload.error) ? upload.error.fieldErrors[name] : undefined)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Carregar documento"
      description="PDF, JPEG, PNG ou WebP até 15 MB. O formato é verificado pelo conteúdo do ficheiro."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!ready}
            loading={upload.isPending}
            onClick={() =>
              file &&
              upload.mutate(
                { typeId, employeeId: selfOnly ? preset.employeeId : employeeId, issuedOn: issuedOn || undefined, expiresOn: expiresOn || undefined, file },
                { onSuccess: () => (toast.success('Documento carregado'), onClose()), onError: (e) => toast.error(errorMessage(e)) },
              )
            }
          >
            Carregar
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!selfOnly && (
          <Field label="Trabalhador" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Escolha…</option>
                {(employees.data?.items ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Tipo" className="sm:col-span-2" error={fieldError('typeId')}>
          {(p) => (
            <Select {...p} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Escolha…</option>
              {(types.data ?? [])
                .filter((t) => t.subject === 'EMPLOYEE')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Emitido em" optional>{(p) => <Input {...p} type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />}</Field>
        <Field label="Válido até" optional={!type?.requiresExpiry} error={fieldError('expiresOn')}>
          {(p) => <Input {...p} type="date" value={expiresOn} min={issuedOn || undefined} onChange={(e) => setExpiresOn(e.target.value)} />}
        </Field>
        <Field label="Ficheiro" className="sm:col-span-2" error={fieldError('file')}>
          {(p) => <Input {...p} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Field>
      </div>
    </Dialog>
  )
}

function DocumentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const doc = useDocument(org.id, id)
  const action = useDocumentAction(org.id)
  const d = doc.data
  return (
    <Drawer open={!!id} onOpenChange={(o) => !o && onClose()} title={d?.typeName ?? 'Documento'} eyebrow={d?.employeeName ?? d?.vehiclePlate ?? undefined}>
      {doc.isPending ? (
        <SkeletonRows rows={4} />
      ) : doc.isError ? (
        <ErrorState>{errorMessage(doc.error)}</ErrorState>
      ) : (
        d && (
          <div className="flex flex-col gap-4">
            <span className="flex flex-wrap gap-1">
              <Badge tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>
              {d.expiresOn && <Badge>até {formatDate(d.expiresOn)}</Badge>}
            </span>
            <ol className="flex flex-col gap-2">
              {d.versions.map((v, index) => (
                <li key={v.id} className={cn('rounded-sm border p-3 text-sm', index === 0 ? 'border-pinho/40' : 'border-line-2')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink">
                      {v.filename} <span className="font-normal text-ink-3">· {SIZE(v.sizeBytes)}</span>
                    </span>
                    <a className="inline-flex items-center gap-1 text-pinho underline" href={downloadUrl(org.id, d.id, v.id)} download>
                      <Download className="size-4" aria-hidden /> Descarregar
                    </a>
                  </div>
                  <p className="text-xs text-ink-3">
                    {index === 0 ? 'Versão atual' : 'Versão anterior'} · carregada por {v.uploadedBy} a {new Date(v.uploadedAt).toLocaleDateString('pt-PT')}
                    {v.expiresOn && ` · válida até ${formatDate(v.expiresOn)}`}
                  </p>
                  {v.verifiedAt ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-ok">
                      <CheckCircle2 className="size-3.5" aria-hidden /> Verificada por {v.verifiedBy}
                    </p>
                  ) : (
                    manager &&
                    index === 0 && (
                      <Button
                        size="sm"
                        className="mt-2"
                        loading={action.isPending}
                        onClick={() => action.mutate({ action: 'verify', documentId: d.id, versionId: v.id }, { onSuccess: () => toast.success('Documento verificado'), onError: (e) => toast.error(errorMessage(e)) })}
                      >
                        Marcar como verificado
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ol>
          </div>
        )
      )}
    </Drawer>
  )
}
