import { MailPlus, Monitor, RotateCw, Trash2, UserX } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import {
  useAudit,
  useChangeMemberRole,
  useChangePassword,
  useDeactivateMember,
  useInvitations,
  useInvite,
  useMembers,
  useOrganization,
  useResendInvitation,
  useRevokeInvitation,
  useRevokeSession,
  useSessions,
  useUpdateOrganization,
  useUpdateProfile,
} from '../../api/hooks'
import { errorMessage, isApiError } from '../../api/http'
import { atLeast, ORG_ROLE_LABEL, type Member, type Organization, type OrgRole } from '../../api/types'
import { useEmployeeOptions, useLinkEmployee } from '../../api/workforce'
import { useActiveOrg, useSession } from '../../session'
import { EMAIL_PATTERN, FormError, passwordProblem } from '../auth/AuthLayout'
import { TIMEZONES } from '../auth/OnboardingPages'

const dateTime = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' })
const date = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium' })

function SettingsTabs() {
  const org = useActiveOrg()
  const tabs = [
    ...(atLeast(org.role, 'ADMIN') ? [{ to: '/definicoes', label: 'Empresa', end: true }] : []),
    ...(atLeast(org.role, 'MANAGER') ? [{ to: '/definicoes/equipa', label: 'Equipa e acessos' }] : []),
    { to: '/definicoes/conta', label: 'A minha conta' },
    ...(atLeast(org.role, 'ADMIN') ? [{ to: '/definicoes/auditoria', label: 'Auditoria' }] : []),
  ]
  return (
    <nav aria-label="Definições" className="mb-5 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              'relative inline-flex h-10 shrink-0 items-center px-2.5 text-sm font-medium text-ink-3 hover:text-ink',
              'after:absolute after:inset-x-1.5 after:-bottom-px after:h-0.5 after:rounded-full',
              isActive ? 'text-ink after:bg-pinho' : 'after:bg-transparent',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}

function SettingsFrame({ children }: { children: ReactNode }) {
  const org = useActiveOrg()
  return (
    <>
      <PageHeader eyebrow={org.name} title="Definições" />
      <SettingsTabs />
      {children}
    </>
  )
}

// --- Empresa --------------------------------------------------------------------------

function OrganizationForm({ org }: { org: Organization }) {
  const update = useUpdateOrganization(org.id)
  const [form, setForm] = useState({ name: org.name, legalName: org.legalName ?? '', taxId: org.taxId ?? '', timezone: org.timezone })
  const server = update.error && isApiError(update.error) ? update.error.fieldErrors : {}
  const nameError = form.name.trim().length < 2 ? 'Indique o nome da empresa.' : null
  const dirty = form.name !== org.name || form.legalName !== (org.legalName ?? '') || form.taxId !== (org.taxId ?? '') || form.timezone !== org.timezone

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (nameError) return
    update.mutate(
      { name: form.name.trim(), legalName: form.legalName.trim() || null, taxId: form.taxId.trim() || null, timezone: form.timezone, version: org.version },
      { onSuccess: () => toast.success('Dados da empresa guardados') },
    )
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4 p-4" noValidate>
      <FormError
        message={
          isApiError(update.error, 'stale')
            ? 'Outra pessoa alterou estes dados entretanto. Recarregue a página para ver a versão atual.'
            : update.error && !Object.keys(server).length
              ? errorMessage(update.error)
              : null
        }
      />
      <Field label="Nome" error={nameError ?? server.name}>
        {(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
      </Field>
      <Field label="Denominação social" optional error={server.legalName}>
        {(p) => <Input {...p} value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />}
      </Field>
      <Field label="NIF" optional error={server.taxId}>
        {(p) => <Input {...p} value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="País da sede" hint="Definido na criação da empresa.">
          {(p) => <Input {...p} value={org.country} disabled />}
        </Field>
        <Field label="Fuso horário por omissão" hint="As obras podem ter o seu próprio fuso.">
          {(p) => (
            <Select {...p} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
              {[...new Set([org.timezone, ...TIMEZONES])].map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div>
        <Button type="submit" variant="primary" loading={update.isPending} disabled={!dirty}>
          Guardar alterações
        </Button>
      </div>
    </form>
  )
}

export function OrganizationSettingsPage() {
  const org = useActiveOrg()
  const query = useOrganization(org.id)
  if (!atLeast(org.role, 'ADMIN')) return <Navigate to="/definicoes/conta" replace />
  return (
    <SettingsFrame>
      <Panel title="Dados da empresa">
        {query.isPending ? (
          <SkeletonRows rows={4} />
        ) : query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : (
          <OrganizationForm key={query.data.version} org={query.data} />
        )}
      </Panel>
    </SettingsFrame>
  )
}

// --- Equipa e acessos -----------------------------------------------------------------

const INVITABLE: OrgRole[] = ['ADMIN', 'MANAGER', 'FOREMAN', 'WORKER']
const ROLE_HELP: Record<OrgRole, string> = {
  OWNER: 'Controlo total, incluindo administradores.',
  ADMIN: 'Gere a empresa, os acessos e todos os módulos.',
  MANAGER: 'Gere trabalhadores, obras, planeamento e aprovações.',
  FOREMAN: 'Vê as suas equipas e obras e revê as horas da equipa.',
  WORKER: 'Vê as suas escalas e regista as suas horas e ausências.',
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const org = useActiveOrg()
  const invite = useInvite(org.id)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('MANAGER')
  const [touched, setTouched] = useState(false)
  const emailError = !EMAIL_PATTERN.test(email.trim()) ? 'Indique um email válido.' : null
  const options = INVITABLE.filter((r) => r !== 'ADMIN' || org.role === 'OWNER')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (emailError) return
    invite.mutate(
      { email: email.trim(), role },
      {
        onSuccess: () => {
          toast.success(`Convite enviado para ${email.trim()}`)
          setEmail('')
          setTouched(false)
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Convidar pessoa"
      description="A pessoa recebe um email com uma ligação válida durante 7 dias."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="convite" loading={invite.isPending}>
            Enviar convite
          </Button>
        </div>
      }
    >
      <form id="convite" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError
          message={
            isApiError(invite.error, 'already-member')
              ? 'Esta pessoa já é membro da empresa.'
              : invite.error && !isApiError(invite.error, 'validation')
                ? errorMessage(invite.error)
                : null
          }
        />
        <Field label="Email" error={(touched && emailError) || (isApiError(invite.error) ? invite.error.fieldErrors.email : undefined)}>
          {(p) => <Input {...p} type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Papel" hint={ROLE_HELP[role]}>
          {(p) => (
            <Select {...p} value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
              {options.map((r) => (
                <option key={r} value={r}>
                  {ORG_ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {role === 'WORKER' && (
          <p className="text-xs text-ink-3">Depois de a pessoa aceitar, ligue a conta à ficha de trabalhador nesta página.</p>
        )}
      </form>
    </Dialog>
  )
}

function RoleSelect({ member, actorRole, orgId }: { member: Member; actorRole: OrgRole; orgId: string }) {
  const change = useChangeMemberRole(orgId)
  const privileged = member.role === 'OWNER' || member.role === 'ADMIN'
  const canEdit = atLeast(actorRole, 'ADMIN') && member.status === 'ACTIVE' && (actorRole === 'OWNER' || !privileged)
  const options: OrgRole[] = actorRole === 'OWNER' ? ['OWNER', 'ADMIN', 'MANAGER', 'FOREMAN', 'WORKER'] : ['MANAGER', 'FOREMAN', 'WORKER']
  if (!canEdit) return <span className="text-sm text-ink-2">{ORG_ROLE_LABEL[member.role]}</span>
  return (
    <Select
      aria-label={`Papel de ${member.displayName}`}
      value={member.role}
      disabled={change.isPending}
      className="h-8 min-w-36 text-sm"
      onChange={(e) =>
        change.mutate(
          { membershipId: member.id, role: e.target.value as OrgRole, version: member.version },
          {
            onSuccess: (m) => toast.success(`${m.displayName} passa a ${ORG_ROLE_LABEL[m.role].toLowerCase()}`),
            onError: (error) =>
              toast.error(
                isApiError(error, 'last-owner')
                  ? 'A empresa precisa de pelo menos um proprietário. Promova outra pessoa primeiro.'
                  : isApiError(error, 'stale')
                    ? 'Este membro foi alterado por outra pessoa. A lista foi atualizada.'
                    : errorMessage(error),
              ),
          },
        )
      }
    >
      {options.map((r) => (
        <option key={r} value={r}>
          {ORG_ROLE_LABEL[r]}
        </option>
      ))}
    </Select>
  )
}

/** Liga a conta à ficha de trabalhador: dá ao encarregado as suas equipas e ao trabalhador os seus dados. */
function EmployeeLink({ member, orgId }: { member: Member; orgId: string }) {
  const options = useEmployeeOptions(orgId)
  const link = useLinkEmployee(orgId)
  return (
    <Select
      aria-label={`Ficha de trabalhador de ${member.displayName}`}
      value={member.employeeId ?? ''}
      disabled={link.isPending}
      className="h-8 min-w-44 text-sm"
      onChange={(e) =>
        link.mutate(
          { membershipId: member.id, employeeId: e.target.value || null },
          {
            onSuccess: () => toast.success(e.target.value ? 'Conta ligada à ficha de trabalhador' : 'Ligação removida'),
            onError: (error) => toast.error(isApiError(error, 'employee-linked') ? 'Essa ficha já está ligada a outra conta.' : errorMessage(error)),
          },
        )
      }
    >
      <option value="">Sem ficha ligada</option>
      {member.employeeId && !options.data?.items.some((e) => e.id === member.employeeId) && (
        <option value={member.employeeId}>{member.employeeName}</option>
      )}
      {options.data?.items.map((e) => (
        <option key={e.id} value={e.id}>
          {e.fullName} · n.º {e.number}
        </option>
      ))}
    </Select>
  )
}

function MembersPanel() {
  const org = useActiveOrg()
  const { me } = useSession()
  const members = useMembers(org.id)
  const deactivate = useDeactivateMember(org.id)
  const [removing, setRemoving] = useState<Member | null>(null)
  const canManage = atLeast(org.role, 'ADMIN')

  return (
    <Panel title="Membros" flush>
      {members.isPending ? (
        <SkeletonRows rows={3} />
      ) : members.isError ? (
        <ErrorState onRetry={() => void members.refetch()} />
      ) : (
        <ul className="divide-y divide-line-2">
          {members.data.map((m) => (
            <li key={m.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', m.status !== 'ACTIVE' && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">
                  {m.displayName}
                  {m.userId === me.user.id && <span className="ml-1.5 text-sm font-normal text-ink-3">(você)</span>}
                </p>
                <p className="truncate text-sm text-ink-3">{m.email}</p>
              </div>
              {m.status === 'ACTIVE' && canManage && (m.role === 'FOREMAN' || m.role === 'WORKER') && <EmployeeLink member={m} orgId={org.id} />}
              {m.status === 'ACTIVE' && !canManage && m.employeeName && <span className="text-xs text-ink-3">Ficha: {m.employeeName}</span>}
              {m.status !== 'ACTIVE' ? (
                <Badge tone="neutral">Sem acesso</Badge>
              ) : (
                <RoleSelect member={m} actorRole={org.role} orgId={org.id} />
              )}
              {canManage && m.status === 'ACTIVE' && m.userId !== me.user.id && (org.role === 'OWNER' || (m.role !== 'OWNER' && m.role !== 'ADMIN')) && (
                <Button variant="ghost" size="sm" icon={<UserX className="size-4" aria-hidden />} onClick={() => setRemoving(m)} aria-label={`Retirar acesso a ${m.displayName}`}>
                  <span className="hidden sm:inline">Retirar acesso</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Retirar acesso a ${removing?.displayName ?? ''}?`}
        description="A pessoa deixa de entrar nesta empresa. O histórico e a auditoria mantêm-se. Pode convidá-la de novo mais tarde."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={deactivate.isPending}
              onClick={() =>
                removing &&
                deactivate.mutate(removing.id, {
                  onSuccess: () => {
                    toast.success(`${removing.displayName} já não tem acesso`)
                    setRemoving(null)
                  },
                  onError: (error) => toast.error(isApiError(error, 'last-owner') ? 'A empresa precisa de pelo menos um proprietário ativo.' : errorMessage(error)),
                })
              }
            >
              Retirar acesso
            </Button>
          </div>
        }
      >
        <span />
      </Dialog>
    </Panel>
  )
}

function InvitationsPanel() {
  const org = useActiveOrg()
  const invitations = useInvitations(org.id)
  const revoke = useRevokeInvitation(org.id)
  const resend = useResendInvitation(org.id)
  const [open, setOpen] = useState(false)

  return (
    <Panel
      title="Convites pendentes"
      flush
      actions={
        <Button variant="primary" size="sm" icon={<MailPlus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
          Convidar
        </Button>
      }
    >
      {invitations.isPending ? (
        <SkeletonRows rows={2} />
      ) : invitations.isError ? (
        <ErrorState onRetry={() => void invitations.refetch()} />
      ) : invitations.data.length === 0 ? (
        <EmptyState compact title="Sem convites pendentes">
          Convide gestores, encarregados e trabalhadores para trabalharem nesta empresa.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line-2">
          {invitations.data.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{i.email}</p>
                <p className="text-sm text-ink-3">
                  {ORG_ROLE_LABEL[i.role]} · convidado por {i.invitedBy} · {i.expired ? 'expirou' : `válido até ${date.format(new Date(i.expiresAt))}`}
                </p>
              </div>
              {i.expired && <Badge tone="warn">Expirado</Badge>}
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCw className="size-4" aria-hidden />}
                loading={resend.isPending && resend.variables === i.id}
                onClick={() => resend.mutate(i.id, { onSuccess: () => toast.success(`Convite reenviado para ${i.email}`), onError: (e) => toast.error(errorMessage(e)) })}
              >
                Reenviar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="size-4" aria-hidden />}
                aria-label={`Cancelar convite de ${i.email}`}
                onClick={() => revoke.mutate(i.id, { onSuccess: () => toast.success('Convite cancelado'), onError: (e) => toast.error(errorMessage(e)) })}
              >
                <span className="hidden sm:inline">Cancelar</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <InviteDialog open={open} onOpenChange={setOpen} />
    </Panel>
  )
}

export function TeamAccessPage() {
  const org = useActiveOrg()
  if (!atLeast(org.role, 'MANAGER')) return <Navigate to="/definicoes/conta" replace />
  return (
    <SettingsFrame>
      <div className="flex flex-col gap-5">
        {atLeast(org.role, 'ADMIN') && <InvitationsPanel />}
        <MembersPanel />
      </div>
    </SettingsFrame>
  )
}

// --- A minha conta --------------------------------------------------------------------

function ProfileForm() {
  const { me } = useSession()
  const update = useUpdateProfile()
  const [displayName, setDisplayName] = useState(me.user.displayName)
  const error = displayName.trim().length < 2 ? 'Indique o seu nome.' : null
  return (
    <form
      className="flex max-w-xl flex-col gap-4 p-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!error) update.mutate({ displayName: displayName.trim(), locale: me.user.locale }, { onSuccess: () => toast.success('Perfil guardado') })
      }}
    >
      <FormError message={update.error ? errorMessage(update.error) : null} />
      <Field label="Nome" error={error}>
        {(p) => <Input {...p} autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
      </Field>
      <Field label="Email" hint="Para mudar o email contacte o suporte.">
        {(p) => <Input {...p} value={me.user.email} disabled />}
      </Field>
      <div>
        <Button type="submit" variant="primary" loading={update.isPending} disabled={displayName.trim() === me.user.displayName}>
          Guardar
        </Button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [touched, setTouched] = useState(false)
  const problem = passwordProblem(next)
  return (
    <form
      className="flex max-w-xl flex-col gap-4 p-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        setTouched(true)
        if (problem || !current) return
        change.mutate(
          { currentPassword: current, newPassword: next },
          {
            onSuccess: () => {
              toast.success('Palavra-passe alterada. As outras sessões foram terminadas.')
              setCurrent('')
              setNext('')
              setTouched(false)
            },
          },
        )
      }}
    >
      <FormError message={isApiError(change.error, 'invalid-password') ? 'A palavra-passe atual está incorreta.' : change.error ? errorMessage(change.error) : null} />
      <Field label="Palavra-passe atual">
        {(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
      </Field>
      <Field label="Nova palavra-passe" hint="Pelo menos 12 caracteres." error={touched ? problem : null}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
      </Field>
      <div>
        <Button type="submit" variant="primary" loading={change.isPending}>
          Alterar palavra-passe
        </Button>
      </div>
    </form>
  )
}

function SessionsPanel() {
  const sessions = useSessions()
  const revoke = useRevokeSession()
  const navigate = useNavigate()
  return (
    <Panel title="Sessões abertas" description="Termine sessões em dispositivos que já não usa." flush>
      {sessions.isPending ? (
        <SkeletonRows rows={2} />
      ) : sessions.isError ? (
        <ErrorState onRetry={() => void sessions.refetch()} />
      ) : (
        <ul className="divide-y divide-line-2">
          {sessions.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Monitor className="size-5 shrink-0 text-ink-3" aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-ink">
                  Iniciada a {dateTime.format(new Date(s.createdAt))}
                  {s.current && (
                    <Badge tone="ok" className="ml-2">
                      Esta sessão
                    </Badge>
                  )}
                </p>
                <p className="text-ink-3">Última atividade: {dateTime.format(new Date(s.lastAccessedAt))}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                loading={revoke.isPending && revoke.variables === s.id}
                onClick={() =>
                  revoke.mutate(s.id, {
                    onSuccess: () => (s.current ? navigate('/entrar', { replace: true }) : toast.success('Sessão terminada')),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                Terminar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function AccountSections() {
  return (
    <div className="flex flex-col gap-5">
      <Panel title="Perfil">
        <ProfileForm />
      </Panel>
      <Panel title="Palavra-passe">
        <PasswordForm />
      </Panel>
      <SessionsPanel />
    </div>
  )
}

export function AccountPage() {
  return (
    <SettingsFrame>
      <AccountSections />
    </SettingsFrame>
  )
}

// --- Auditoria ------------------------------------------------------------------------

const ACTION_LABEL: Record<string, string> = {
  'organization.created': 'Criou a empresa',
  'organization.updated': 'Alterou os dados da empresa',
  'organization.suspended': 'Suspendeu a empresa (plataforma)',
  'organization.reactivated': 'Reativou a empresa (plataforma)',
  'membership.role-changed': 'Alterou o papel de um membro',
  'membership.disabled': 'Retirou o acesso a um membro',
  'invitation.created': 'Enviou um convite',
  'invitation.resent': 'Reenviou um convite',
  'invitation.revoked': 'Cancelou um convite',
  'invitation.accepted': 'Aceitou um convite',
}

export function AuditPage() {
  const org = useActiveOrg()
  const [page, setPage] = useState(0)
  const audit = useAudit(org.id, page, atLeast(org.role, 'ADMIN'))
  if (!atLeast(org.role, 'ADMIN')) return <Navigate to="/definicoes/conta" replace />
  const totalPages = audit.data ? Math.max(1, Math.ceil(audit.data.total / audit.data.size)) : 1
  return (
    <SettingsFrame>
      <Panel title="Registo de auditoria" description="Quem fez cada alteração importante. Os registos não podem ser alterados nem apagados." flush>
        {audit.isPending ? (
          <SkeletonRows rows={5} />
        ) : audit.isError ? (
          <ErrorState onRetry={() => void audit.refetch()} />
        ) : audit.data.items.length === 0 ? (
          <EmptyState compact title="Sem registos" />
        ) : (
          <>
            <ul className="divide-y divide-line-2">
              {audit.data.items.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
                  <time className="w-36 shrink-0 text-ink-3 tabular" dateTime={e.occurredAt}>
                    {dateTime.format(new Date(e.occurredAt))}
                  </time>
                  <span className="min-w-0 flex-1 text-ink">
                    <strong className="font-medium">{e.actorName ?? 'Sistema'}</strong> · {ACTION_LABEL[e.action] ?? e.action}
                    {typeof e.changes.role === 'string' && <span className="text-ink-3"> ({ORG_ROLE_LABEL[e.changes.role as OrgRole] ?? e.changes.role})</span>}
                  </span>
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-line-2 px-4 py-2 text-sm">
                <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Anteriores
                </Button>
                <span className="text-ink-3">
                  Página {page + 1} de {totalPages}
                </span>
                <Button variant="ghost" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
                  Seguintes
                </Button>
              </div>
            )}
          </>
        )}
      </Panel>
    </SettingsFrame>
  )
}
