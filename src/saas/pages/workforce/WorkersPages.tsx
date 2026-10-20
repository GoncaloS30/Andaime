import { Archive, ArchiveRestore, ArrowLeft, Download, FileSignature, Mail, Pencil, Phone, Plus, Search, Trash2, Users, UserX } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { CATEGORIES } from '@/domain/labels'
import { Avatar } from '@/ui/Avatar'
import { Badge } from '@/ui/Badge'
import { Button, buttonStyles } from '@/ui/Button'
import { Detail, PageHeader, Panel } from '@/ui/Layout'
import { Field, Input, Select } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { TabPanel, Tabs } from '@/ui/Tabs'
import { errorMessage, isApiError } from '../../api/http'
import { atLeast } from '../../api/types'
import {
  CONTRACT_LABEL,
  formatDate,
  todayIso,
  useAddContract,
  useAnonymizeEmployee,
  useArchiveEmployee,
  useContracts,
  useEmployee,
  useEmployees,
  useEmployeeTeams,
  usePhoto,
  useRemoveContract,
  useTeams,
  type Contract,
  type EmployeeStatus,
} from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { FormError } from '../auth/AuthLayout'
import { PhotoControls } from '../shared/PhotoControls'
import { EmployeeForm } from './EmployeeForm'
import { HistoryList } from './HistoryList'

export function WorkersPage() {
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const [sp, setSp] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const filters = {
    q: sp.get('q') ?? '',
    team: sp.get('equipa') ?? '',
    category: sp.get('categoria') ?? '',
    status: (sp.get('estado') ?? '') as EmployeeStatus | '',
    archived: sp.get('arquivados') === 'sim',
    page: Number(sp.get('pagina') ?? 0),
  }
  const set = (k: string, v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p)
        if (v) n.set(k, v)
        else n.delete(k)
        if (k !== 'pagina') n.delete('pagina')
        return n
      },
      { replace: true },
    )
  const employees = useEmployees(org.id, filters)
  const teams = useTeams(org.id, false, manager)
  const data = employees.data
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1
  const filtering = !!(filters.q || filters.team || filters.category || filters.status || filters.archived)

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Trabalhadores"
        description={data ? `${data.total} ${filters.archived ? 'arquivados' : data.total === 1 ? 'trabalhador' : 'trabalhadores'}` : undefined}
        actions={
          manager && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Novo trabalhador
            </Button>
          )
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
          <label className="sr-only" htmlFor="w-q">
            Pesquisar
          </label>
          <Input id="w-q" value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Nome, número ou categoria" className="w-64 pl-8" />
        </div>
        {manager && (
          <>
            <label className="sr-only" htmlFor="w-team">
              Equipa
            </label>
            <Select id="w-team" value={filters.team} onChange={(e) => set('equipa', e.target.value)} className="w-44">
              <option value="">Todas as equipas</option>
              {teams.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="none">Sem equipa</option>
            </Select>
          </>
        )}
        <label className="sr-only" htmlFor="w-cat">
          Categoria
        </label>
        <Select id="w-cat" value={filters.category} onChange={(e) => set('categoria', e.target.value)} className="w-48">
          <option value="">Todas as categorias</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="w-st">
          Estado
        </label>
        <Select id="w-st" value={filters.archived ? 'arquivados' : filters.status} onChange={(e) => (e.target.value === 'arquivados' ? setSp({ arquivados: 'sim' }, { replace: true }) : (set('arquivados', ''), set('estado', e.target.value)))} className="w-40">
          <option value="">Ativos e inativos</option>
          <option value="ACTIVE">Só ativos</option>
          <option value="INACTIVE">Só inativos</option>
          {manager && <option value="arquivados">Arquivados</option>}
        </Select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        {employees.isPending ? (
          <SkeletonRows rows={8} />
        ) : employees.isError ? (
          <ErrorState onRetry={() => void employees.refetch()} />
        ) : data!.items.length === 0 ? (
          filtering ? (
            <EmptyState icon={<Search />} title="Nenhum trabalhador encontrado">
              Ajuste a pesquisa ou os filtros.
            </EmptyState>
          ) : (
            <EmptyState
              icon={<Users />}
              title={manager ? 'Ainda não há trabalhadores' : 'Sem trabalhadores no seu âmbito'}
              action={
                manager && (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    Registar trabalhador
                  </Button>
                )
              }
            >
              {manager
                ? 'Registe os trabalhadores para os organizar em equipas e, a seguir, planeá-los em obra.'
                : 'Vê aqui os trabalhadores das equipas de que é responsável. Peça ao escritório para ligar a sua conta à sua ficha.'}
            </EmptyState>
          )
        ) : (
          <table className="table-a min-w-[680px]">
            <thead>
              <tr>
                <th scope="col">Trabalhador</th>
                <th scope="col">Categoria</th>
                <th scope="col">Equipa</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data!.items.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link to={`/trabalhadores/${w.id}`} className="flex items-center gap-2.5 font-medium text-ink hover:underline">
                      <Avatar name={w.fullName} size="sm" color={w.team?.color ?? '#7d847f'} photo={w.photoUrl} />
                      <span>
                        {w.fullName}
                        <span className="block text-xs font-normal text-ink-3 tabular">N.º {w.number}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="text-ink-2">{w.category}</td>
                  <td>
                    {w.team ? (
                      manager ? (
                        <Link to={`/equipas/${w.team.id}`} className="hover:underline">
                          {w.team.name}
                        </Link>
                      ) : (
                        w.team.name
                      )
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td>
                    {w.archived ? (
                      <Badge>Arquivado</Badge>
                    ) : (
                      <Badge tone={w.status === 'ACTIVE' ? 'ok' : 'neutral'} dot>
                        {w.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {pages > 1 && (
        <nav aria-label="Páginas" className="mt-3 flex items-center justify-between text-sm">
          <Button variant="ghost" size="sm" disabled={filters.page === 0} onClick={() => set('pagina', String(filters.page - 1))}>
            Anteriores
          </Button>
          <span className="text-ink-3">
            Página {filters.page + 1} de {pages}
          </span>
          <Button variant="ghost" size="sm" disabled={filters.page + 1 >= pages} onClick={() => set('pagina', String(filters.page + 1))}>
            Seguintes
          </Button>
        </nav>
      )}
      {creating && <EmployeeForm open onOpenChange={setCreating} />}
    </div>
  )
}

function ContractsPanel({ employeeId }: { employeeId: string }) {
  const org = useActiveOrg()
  const contracts = useContracts(org.id, employeeId, true)
  const add = useAddContract(org.id, employeeId)
  const remove = useRemoveContract(org.id, employeeId)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ kind: 'PERMANENT' as Contract['kind'], startDate: todayIso(), endDate: '', weeklyHours: '40', notes: '' })
  const weekly = Number(form.weeklyHours.replace(',', '.'))
  const invalid = !form.startDate || (form.endDate && form.endDate < form.startDate) || !(weekly > 0 && weekly <= 80)

  return (
    <Panel
      title="Contratos"
      flush
      actions={
        <Button size="sm" icon={<FileSignature className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
          Registar contrato
        </Button>
      }
    >
      {contracts.isPending ? (
        <SkeletonRows rows={2} />
      ) : contracts.isError ? (
        <ErrorState onRetry={() => void contracts.refetch()} />
      ) : contracts.data.length === 0 ? (
        <EmptyState compact title="Sem contratos registados" />
      ) : (
        <ul className="divide-y divide-line-2">
          {contracts.data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{CONTRACT_LABEL[c.kind]}</p>
                <p className="text-ink-3">
                  {formatDate(c.startDate)} — {c.endDate ? formatDate(c.endDate) : 'sem fim'}
                  {c.weeklyMin ? ` · ${c.weeklyMin / 60} h/semana` : ''}
                  {c.notes ? ` · ${c.notes}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="size-4" aria-hidden />}
                aria-label="Remover contrato"
                onClick={() => remove.mutate(c.id, { onSuccess: () => toast.success('Contrato removido'), onError: (e) => toast.error(errorMessage(e)) })}
              />
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Registar contrato"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={!!invalid}
              loading={add.isPending}
              onClick={() =>
                add.mutate(
                  { kind: form.kind, startDate: form.startDate, endDate: form.endDate || null, weeklyMin: Math.round(weekly * 60), notes: form.notes },
                  { onSuccess: () => (toast.success('Contrato registado'), setOpen(false)) },
                )
              }
            >
              Registar
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormError message={isApiError(add.error, 'overlap') ? 'Já existe um contrato em vigor nessas datas.' : add.error ? errorMessage(add.error) : null} />
          </div>
          <Field label="Tipo" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Contract['kind'] })}>
                {Object.entries(CONTRACT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Início">{(p) => <Input {...p} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />}</Field>
          <Field label="Fim" optional error={form.endDate && form.endDate < form.startDate ? 'Anterior ao início.' : null}>
            {(p) => <Input {...p} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />}
          </Field>
          <Field label="Horas por semana">{(p) => <Input {...p} type="number" min={1} max={80} value={form.weeklyHours} onChange={(e) => setForm({ ...form, weeklyHours: e.target.value })} />}</Field>
          <Field label="Notas" optional>{(p) => <Input {...p} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
        </div>
      </Dialog>
    </Panel>
  )
}

export function WorkerDetailPage() {
  const { id = '' } = useParams()
  const org = useActiveOrg()
  const manager = atLeast(org.role, 'MANAGER')
  const [tab, setTab] = useState('dados')
  const [editing, setEditing] = useState(false)
  const employee = useEmployee(org.id, id)
  const photo = usePhoto(org.id, 'employees', id)
  const teams = useEmployeeTeams(org.id, id)
  const archive = useArchiveEmployee(org.id, id)

  if (employee.isPending) return <SkeletonRows rows={8} />
  if (employee.isError)
    return isApiError(employee.error, 'not-found') ? (
      <EmptyState
        title="Trabalhador não encontrado"
        action={
          <Link to="/trabalhadores" className="text-pinho underline">
            Voltar à lista
          </Link>
        }
      >
        Não existe ou não pertence ao seu âmbito.
      </EmptyState>
    ) : (
      <ErrorState onRetry={() => void employee.refetch()} />
    )
  const w = employee.data
  const tabs = [
    { value: 'dados', label: 'Dados profissionais' },
    { value: 'equipas', label: 'Equipas' },
    ...(manager ? [{ value: 'contratos', label: 'Contratos' }, { value: 'historico', label: 'Histórico' }] : []),
  ]

  return (
    <div className="mx-auto max-w-[1280px]">
      <Link to="/trabalhadores" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Trabalhadores
      </Link>
      <header className="mb-4 flex flex-wrap items-start gap-4">
        <div className="flex flex-col items-center gap-1">
          <Avatar name={w.fullName} size="lg" color={w.team?.color ?? '#7d847f'} photo={w.photoUrl} className="size-20 text-2xl" />
          {manager && !w.anonymized && (
            <PhotoControls
              hasPhoto={!!w.photoUrl}
              subject={w.fullName}
              uploading={photo.upload.isPending}
              removing={photo.remove.isPending}
              onUpload={(file) => photo.upload.mutateAsync(file)}
              onRemove={() => photo.remove.mutateAsync()}
            />
          )}
        </div>
        <div className="min-w-[min(100%,18rem)] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-expanded text-2xl font-semibold tracking-tight">{w.fullName}</h1>
            {w.archivedAt ? (
              <Badge>Arquivado</Badge>
            ) : (
              <Badge tone={w.status === 'ACTIVE' ? 'ok' : 'neutral'} dot>
                {w.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink-2">
            {w.category} · N.º {w.number}
            {w.team && (
              <>
                {' · '}
                {manager ? (
                  <Link to={`/equipas/${w.team.id}`} className="font-medium text-pinho underline decoration-pinho/40 underline-offset-2 hover:decoration-pinho">
                    {w.team.name}
                  </Link>
                ) : (
                  w.team.name
                )}
              </>
            )}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
            <span className="flex items-center gap-1">
              <Phone className="size-3.5" aria-hidden /> {w.phone || '—'}
            </span>
            {!w.restricted && (
              <span className="flex items-center gap-1">
                <Mail className="size-3.5" aria-hidden /> {w.email || '—'}
              </span>
            )}
          </p>
        </div>
        {manager && (
          <div className="flex flex-wrap gap-2">
            {!w.archivedAt && (
              <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Editar
              </Button>
            )}
            {atLeast(org.role, 'ADMIN') && !org.supportUntil && (
              // RGPD (arts. 15.º e 20.º): ZIP com os dados e os documentos do trabalhador; cada exportação fica auditada.
              <a href={`/api/orgs/${org.id}/employees/${w.id}/export`} download className={buttonStyles('ghost')}>
                <Download className="size-4" aria-hidden /> Exportar dados (RGPD)
              </a>
            )}
            {w.archivedAt && !w.anonymized && atLeast(org.role, 'ADMIN') && <AnonymizeButton id={w.id} name={w.fullName} />}
            {!w.anonymized && (
            <Button
              variant="ghost"
              icon={w.archivedAt ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              loading={archive.isPending}
              onClick={() =>
                archive.mutate(!w.archivedAt, {
                  onSuccess: () => toast.success(w.archivedAt ? 'Ficha reposta' : 'Ficha arquivada. Saiu das equipas a partir de hoje; o histórico mantém-se.'),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              {w.archivedAt ? 'Repor' : 'Arquivar'}
            </Button>
            )}
          </div>
        )}
      </header>

      <Tabs value={tab} onValueChange={setTab} label="Ficha do trabalhador" tabs={tabs}>
        <TabPanel value="dados">
          <Panel>
            <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Categoria">{w.category}</Detail>
              <Detail label="Horas normais por dia">{w.dailyCapacityMin / 60} h</Detail>
              <Detail label="Competências">{w.skills.length ? w.skills.join(', ') : '—'}</Detail>
              {!w.restricted && (
                <>
                  <Detail label="Data de admissão">{formatDate(w.hireDate)}</Detail>
                  <Detail label="Nacionalidade">{w.nationality || '—'}</Detail>
                  <Detail label="Residência">{w.homeCity || '—'}</Detail>
                  <Detail label="Custo por hora">{w.hourlyCost != null ? `${w.hourlyCost.toFixed(2).replace('.', ',')} €` : '—'}</Detail>
                  <Detail label="Tamanhos">
                    {Object.keys(w.sizes).length ? Object.entries(w.sizes).map(([k, v]) => `${k} ${v}`).join(' · ') : '—'}
                  </Detail>
                  <Detail label="Conta na aplicação">{w.account ? `${w.account.displayName} (${w.account.role.toLowerCase()})` : 'Sem conta ligada'}</Detail>
                </>
              )}
            </dl>
            {w.notes && !w.restricted && <p className="border-t border-line-2 px-4 py-3 text-sm text-ink-2">{w.notes}</p>}
            {w.restricted && <p className="border-t border-line-2 px-4 py-3 text-xs text-ink-3">Os dados pessoais e de custo só são visíveis para a gestão.</p>}
          </Panel>
          <p className="mt-3 text-xs text-ink-3">Horas, documentos, ausências e fardamento entregue aparecem aqui quando esses módulos forem ligados ao servidor (fases F4 e F5).</p>
        </TabPanel>
        <TabPanel value="equipas">
          <Panel title="Percurso em equipas" description="Cada mudança de equipa vale de uma data em diante; o histórico anterior nunca é reescrito." flush>
            {teams.isPending ? (
              <SkeletonRows rows={2} />
            ) : teams.isError ? (
              <ErrorState onRetry={() => void teams.refetch()} />
            ) : teams.data.length === 0 ? (
              <EmptyState compact title="Ainda não pertenceu a nenhuma equipa" />
            ) : (
              <ul className="divide-y divide-line-2">
                {teams.data.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 border-l-4 px-4 py-2.5 text-sm" style={{ borderLeftColor: p.teamColor }}>
                    <span className="flex-1 font-medium">{p.teamName}</span>
                    <span className="text-ink-3 tabular">
                      {formatDate(p.joinedOn)} — {p.leftOn ? formatDate(p.leftOn) : 'atual'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabPanel>
        {manager && (
          <>
            <TabPanel value="contratos">
              <ContractsPanel employeeId={id} />
            </TabPanel>
            <TabPanel value="historico">
              <HistoryList entityType="employee" id={id} />
            </TabPanel>
          </>
        )}
      </Tabs>
      {editing && <EmployeeForm open onOpenChange={setEditing} existing={w} />}
    </div>
  )
}

/** RGPD: apaga os dados pessoais de um ex-trabalhador arquivado. Irreversível, por isso pede confirmação escrita. */
function AnonymizeButton({ id, name }: { id: string; name: string }) {
  const org = useActiveOrg()
  const anonymize = useAnonymizeEmployee(org.id, id)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  return (
    <>
      <Button variant="ghost" icon={<UserX className="size-4" />} onClick={() => setOpen(true)}>
        Anonimizar
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Anonimizar ${name}`}
        description="Apaga nome, contactos, nacionalidade, morada, tamanhos, competências, notas, custo e contratos. Ficam o número, a categoria e o histórico de horas e planeamento sem identificação. Os documentos ficam arquivados. Não é possível desfazer."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={typed.trim() !== 'ANONIMIZAR'}
              loading={anonymize.isPending}
              onClick={() => anonymize.mutate(undefined, { onSuccess: () => (toast.success('Dados pessoais apagados'), setOpen(false)), onError: (e) => toast.error(errorMessage(e)) })}
            >
              Anonimizar
            </Button>
          </div>
        }
      >
        <Field label="Escreva ANONIMIZAR para confirmar">{(p) => <Input {...p} value={typed} onChange={(e) => setTyped(e.target.value)} />}</Field>
      </Dialog>
    </>
  )
}
