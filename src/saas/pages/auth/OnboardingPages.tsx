import { Building2, MailOpen } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, buttonStyles } from '@/ui/Button'
import { Field, Input, Select } from '@/ui/Field'
import { SkeletonRows } from '@/ui/States'
import { useAcceptInvitation, useCreateOrganization, useInvitationPreview, useLogout, useMe, useSelectOrganization } from '../../api/hooks'
import { errorMessage, isApiError } from '../../api/http'
import { ORG_ROLE_LABEL } from '../../api/types'
import { AuthLayout, FormError } from './AuthLayout'

/** Países sugeridos no onboarding (o país define o fuso por omissão e a política laboral inicial). */
export const COUNTRIES: { code: string; name: string; timezone: string }[] = [
  { code: 'PT', name: 'Portugal', timezone: 'Europe/Lisbon' },
  { code: 'ES', name: 'Espanha', timezone: 'Europe/Madrid' },
  { code: 'FR', name: 'França', timezone: 'Europe/Paris' },
  { code: 'BE', name: 'Bélgica', timezone: 'Europe/Brussels' },
  { code: 'LU', name: 'Luxemburgo', timezone: 'Europe/Luxembourg' },
  { code: 'NL', name: 'Países Baixos', timezone: 'Europe/Amsterdam' },
  { code: 'DE', name: 'Alemanha', timezone: 'Europe/Berlin' },
  { code: 'CH', name: 'Suíça', timezone: 'Europe/Zurich' },
  { code: 'GB', name: 'Reino Unido', timezone: 'Europe/London' },
  { code: 'IE', name: 'Irlanda', timezone: 'Europe/Dublin' },
]

export const TIMEZONES = [
  'Europe/Lisbon',
  'Atlantic/Madeira',
  'Atlantic/Azores',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Brussels',
  'Europe/Luxembourg',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Zurich',
  'Europe/London',
  'Europe/Dublin',
]

export function OnboardingPage() {
  const me = useMe()
  const navigate = useNavigate()
  const create = useCreateOrganization()
  const logout = useLogout()
  const [form, setForm] = useState({ name: '', legalName: '', taxId: '', country: 'PT', timezone: 'Europe/Lisbon' })
  const [touched, setTouched] = useState(false)
  const nameError = form.name.trim().length < 2 ? 'Indique o nome da empresa.' : null
  const server = create.error && isApiError(create.error) ? create.error.fieldErrors : {}

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (nameError) return
    create.mutate(
      { name: form.name.trim(), legalName: form.legalName.trim() || undefined, taxId: form.taxId.trim() || undefined, country: form.country, timezone: form.timezone },
      { onSuccess: () => navigate('/', { replace: true }) },
    )
  }

  const hasOrgs = (me.data?.memberships.length ?? 0) > 0

  return (
    <AuthLayout
      title="Criar a sua empresa"
      description="Fica como proprietário e pode convidar gestores, encarregados e trabalhadores a seguir."
      footer={
        hasOrgs ? (
          <Link to="/" className="font-medium text-pinho hover:underline">
            Voltar à empresa atual
          </Link>
        ) : (
          <>
            Recebeu um convite? Abra a ligação do email.{' '}
            <button type="button" className="font-medium text-pinho hover:underline" onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/entrar') })}>
              Sair
            </button>
          </>
        )
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError message={create.error && !Object.keys(server).length ? errorMessage(create.error) : null} />
        <Field label="Nome da empresa" error={(touched && nameError) || server.name}>
          {(p) => <Input {...p} autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Construções Ribeira, Lda." />}
        </Field>
        <Field label="Denominação social" optional error={server.legalName}>
          {(p) => <Input {...p} value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />}
        </Field>
        <Field label="NIF / número de contribuinte" optional error={server.taxId}>
          {(p) => <Input {...p} inputMode="numeric" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="País da sede" hint="Define a política laboral inicial.">
            {(p) => (
              <Select
                {...p}
                value={form.country}
                onChange={(e) => {
                  const country = COUNTRIES.find((c) => c.code === e.target.value)!
                  setForm({ ...form, country: country.code, timezone: country.timezone })
                }}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Fuso horário">
            {(p) => (
              <Select {...p} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace('_', ' ')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <p className="text-xs text-ink-3">
          As regras de horas (normal diário e semanal, descansos, horas extra) começam com valores sugeridos para o país e devem ser revistas por quem trata
          dos assuntos laborais da empresa.
        </p>
        <Button type="submit" variant="primary" size="lg" loading={create.isPending} icon={<Building2 className="size-4" aria-hidden />}>
          Criar empresa
        </Button>
      </form>
    </AuthLayout>
  )
}

const STATUS_MESSAGE = {
  EXPIRED: 'Este convite expirou. Peça a quem o convidou que envie um novo.',
  ACCEPTED: 'Este convite já foi aceite.',
  REVOKED: 'Este convite foi cancelado.',
  SUSPENDED: 'A empresa deste convite está suspensa.',
} as const

export function InvitePage() {
  const { token = '' } = useParams()
  const preview = useInvitationPreview(token)
  const me = useMe()
  const accept = useAcceptInvitation()
  const select = useSelectOrganization()
  const navigate = useNavigate()

  if (preview.isPending || me.isPending) {
    return (
      <AuthLayout title="Convite">
        <SkeletonRows rows={3} />
      </AuthLayout>
    )
  }
  if (preview.isError) {
    return (
      <AuthLayout title="Convite não encontrado">
        <div className="flex flex-col gap-4">
          <FormError message={isApiError(preview.error, 'not-found') ? 'A ligação do convite é inválida. Confirme que abriu a ligação completa do email.' : errorMessage(preview.error)} />
          <Link to="/" className={buttonStyles('secondary')}>
            Ir para o Andaime
          </Link>
        </div>
      </AuthLayout>
    )
  }

  const invitation = preview.data
  const next = encodeURIComponent(`/convite/${token}`)
  const onAccept = () =>
    accept.mutate(token, {
      onSuccess: (result) => select.mutate(result.orgId, { onSettled: () => navigate('/', { replace: true }) }),
    })

  return (
    <AuthLayout title={`Convite para ${invitation.organizationName}`}>
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex items-start gap-3">
          <MailOpen className="mt-0.5 size-5 shrink-0 text-pinho" aria-hidden />
          <p className="text-ink-2">
            Foi convidado como <strong>{ORG_ROLE_LABEL[invitation.role].toLowerCase()}</strong> para o endereço <strong>{invitation.emailMasked}</strong>.
          </p>
        </div>
        {invitation.status !== 'VALID' ? (
          <FormError message={STATUS_MESSAGE[invitation.status]} />
        ) : me.data ? (
          <>
            <FormError message={accept.error ? errorMessage(accept.error) : null} />
            <Button variant="primary" size="lg" loading={accept.isPending || select.isPending} onClick={onAccept}>
              Aceitar convite
            </Button>
            <p className="text-xs text-ink-3">Tem sessão iniciada como {me.data.user.email}. O convite só pode ser aceite pela conta do endereço convidado.</p>
          </>
        ) : (
          <>
            <Link to={`/entrar?next=${next}`} className={buttonStyles('primary', 'lg')}>
              Entrar para aceitar
            </Link>
            <Link to="/registar" className={buttonStyles('secondary')}>
              Criar conta
            </Link>
            <p className="text-xs text-ink-3">Depois de criar a conta e confirmar o email, volte a abrir esta ligação.</p>
          </>
        )}
      </div>
    </AuthLayout>
  )
}
