import { Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { Checkbox, Field, Input, Select, Textarea } from '@/ui/Field'
import { Panel } from '@/ui/Layout'
import { ErrorState, SkeletonRows } from '@/ui/States'
import {
  useHolidayAction,
  useHolidays,
  useLaborPolicy,
  useRetentionPolicy,
  useSaveLaborPolicy,
  useSaveRetentionPolicy,
  useSupportAction,
  useSupportGrants,
  type LaborPolicy,
  type RetentionPolicy,
} from '../../api/admin'
import { errorMessage, isApiError } from '../../api/http'
import { atLeast } from '../../api/types'
import { formatDate } from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { SettingsFrame } from './SettingsPages'

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const hours = (min: number | null) => (min === null ? '' : String(Math.round((min / 60) * 100) / 100))
const minutes = (h: string) => Math.round(Number(h.replace(',', '.')) * 60)
const when = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Definições → Regras e suporte: política laboral, feriados da empresa, conservação de dados e acesso temporário do
 * suporte. Os gestores só vêem a conservação de dados, sem poder alterar.
 */
export function RulesPage() {
  const org = useActiveOrg()
  if (!atLeast(org.role, 'MANAGER')) return <Navigate to="/definicoes/conta" replace />
  const admin = atLeast(org.role, 'ADMIN')
  return (
    <SettingsFrame>
      <div className="flex flex-col gap-5">
        {admin && <PolicyPanel />}
        {admin && <HolidaysPanel />}
        <RetentionPanel readOnly={!admin} />
        {admin && <SupportPanel />}
      </div>
    </SettingsFrame>
  )
}

function PolicyPanel() {
  const org = useActiveOrg()
  const policy = useLaborPolicy(org.id)
  return (
    <Panel
      title="Política laboral"
      description="Usada para calcular horas normais e extra e a pausa automática. As alterações valem de hoje em diante; as semanas passadas mantêm as regras que estavam em vigor."
    >
      {policy.isPending ? <SkeletonRows rows={3} /> : policy.isError ? <ErrorState onRetry={() => void policy.refetch()} /> : <PolicyForm key={policy.data.version} policy={policy.data} />}
    </Panel>
  )
}

function PolicyForm({ policy }: { policy: LaborPolicy }) {
  const org = useActiveOrg()
  const save = useSaveLaborPolicy(org.id)
  const [daily, setDaily] = useState(hours(policy.dailyNormalMin))
  const [weekly, setWeekly] = useState(hours(policy.weeklyNormalMin))
  const [rest, setRest] = useState<number[]>(policy.restDays)
  const [breakAfter, setBreakAfter] = useState(hours(policy.autoBreakAfterMin))
  const [breakMin, setBreakMin] = useState(policy.autoBreakMin === null ? '' : String(policy.autoBreakMin))
  const [overnight, setOvernight] = useState(policy.overnightAttribution)
  const fe = isApiError(save.error) ? save.error.fieldErrors : {}
  return (
    <form
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault()
        // mutateAsync: o formulário volta a montar com a versão nova e as callbacks de mutate perder-se-iam.
        save
          .mutateAsync({
            ...policy,
            dailyNormalMin: minutes(daily),
            weeklyNormalMin: minutes(weekly),
            restDays: rest,
            autoBreakAfterMin: breakAfter === '' ? null : minutes(breakAfter),
            autoBreakMin: breakMin === '' ? null : Number(breakMin),
            overnightAttribution: overnight,
          })
          .then(() => toast.success('Política laboral atualizada a partir de hoje'))
          .catch((err: unknown) => toast.error(errorMessage(err)))
      }}
    >
      <Field label="Horas normais por dia" error={fe.dailyNormalMin}>{(p) => <Input {...p} inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} />}</Field>
      <Field label="Horas normais por semana" error={fe.weeklyNormalMin}>{(p) => <Input {...p} inputMode="decimal" value={weekly} onChange={(e) => setWeekly(e.target.value)} />}</Field>
      <Field label="Turnos que passam a meia-noite">
        {(p) => (
          <Select {...p} value={overnight} onChange={(e) => setOvernight(e.target.value as LaborPolicy['overnightAttribution'])}>
            <option value="START_DAY">Contam no dia em que começam</option>
            <option value="SPLIT_MIDNIGHT">Divididos à meia-noite</option>
          </Select>
        )}
      </Field>
      <Field label="Pausa automática acima de (horas)" optional error={fe.autoBreakMin}>{(p) => <Input {...p} inputMode="decimal" value={breakAfter} onChange={(e) => setBreakAfter(e.target.value)} />}</Field>
      <Field label="Duração da pausa automática (min)" optional>{(p) => <Input {...p} type="number" min={5} max={180} value={breakMin} onChange={(e) => setBreakMin(e.target.value)} />}</Field>
      <fieldset className="sm:col-span-2 lg:col-span-3">
        <legend className="mb-1.5 text-sm font-semibold text-ink">Dias de descanso (todo o trabalho conta como extra)</legend>
        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map((label, i) => (
            <Checkbox key={label} label={label} checked={rest.includes(i + 1)} onChange={(e) => setRest(e.target.checked ? [...rest, i + 1] : rest.filter((d) => d !== i + 1))} />
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2 lg:col-span-3">
        <Button type="submit" variant="primary" loading={save.isPending}>
          Guardar política
        </Button>
        {policy.effectiveFrom && <span className="ml-3 text-xs text-ink-3">Em vigor desde {formatDate(policy.effectiveFrom)}</span>}
      </div>
    </form>
  )
}

const MONTH_CHOICES = [3, 6, 12, 18, 24, 36, 48, 60, 72, 84, 96, 108, 120]
const months = (n: number) => (n === 1 ? '1 mês' : n % 12 === 0 ? `${n} meses (${n / 12} ${n === 12 ? 'ano' : 'anos'})` : `${n} meses`)
/** Garante que o valor gravado aparece nas opções, mesmo que não seja um dos prazos sugeridos. */
const choices = (values: number[], current: number | null | undefined, max: number) =>
  [...new Set([...values.filter((v) => v <= max), ...(current ? [current] : [])])].sort((a, b) => a - b)

function RetentionPanel({ readOnly }: { readOnly: boolean }) {
  const org = useActiveOrg()
  const retention = useRetentionPolicy(org.id)
  return (
    <Panel
      title="Conservação de dados"
      description="Durante quanto tempo o Andaime guarda dados pessoais que já não são precisos. A limpeza corre todas as noites. Confirme com o seu jurista ou contabilista os prazos mínimos legais (por exemplo, registos de tempo de trabalho e documentos fiscais) antes de os encurtar."
    >
      {retention.isPending ? (
        <SkeletonRows rows={2} />
      ) : retention.isError ? (
        <ErrorState onRetry={() => void retention.refetch()} />
      ) : (
        <RetentionForm key={retention.data.version} policy={retention.data} readOnly={readOnly} />
      )}
    </Panel>
  )
}

function RetentionForm({ policy, readOnly }: { policy: RetentionPolicy; readOnly: boolean }) {
  const org = useActiveOrg()
  const save = useSaveRetentionPolicy(org.id)
  const [anonymize, setAnonymize] = useState(policy.anonymizeAfterMonths ? String(policy.anonymizeAfterMonths) : 'off')
  const [notifications, setNotifications] = useState(String(policy.notificationsAfterMonths))
  const fe = isApiError(save.error) ? save.error.fieldErrors : {}
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        save
          .mutateAsync({
            anonymizeAfterMonths: anonymize === 'off' ? null : Number(anonymize),
            notificationsAfterMonths: Number(notifications),
            version: policy.version,
          })
          .then(() => toast.success('Conservação de dados atualizada'))
          .catch((err: unknown) => toast.error(errorMessage(err)))
      }}
    >
      <Field
        label="Anonimizar ex-trabalhadores arquivados há mais de"
        error={fe.anonymizeAfterMonths}
        hint="Apaga nome, contactos, contratos, fotografia e ficheiros dos documentos; ficam as horas e o planeamento, sem identificação. É irreversível."
      >
        {(p) => (
          <Select {...p} value={anonymize} disabled={readOnly} onChange={(e) => setAnonymize(e.target.value)}>
            <option value="off">Desligado (só manualmente)</option>
            {choices(MONTH_CHOICES, policy.anonymizeAfterMonths, 120).map((n) => (
              <option key={n} value={n}>
                {months(n)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Apagar notificações com mais de" error={fe.notificationsAfterMonths} hint="Avisos da aplicação já antigos, lidos ou não.">
        {(p) => (
          <Select {...p} value={notifications} disabled={readOnly} onChange={(e) => setNotifications(e.target.value)}>
            {choices([1, ...MONTH_CHOICES], policy.notificationsAfterMonths, 60).map((n) => (
              <option key={n} value={n}>
                {months(n)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="sm:col-span-2">
        {readOnly ? (
          <p className="text-xs text-ink-3">Só a administração da empresa pode alterar estes prazos.</p>
        ) : (
          <Button type="submit" variant="primary" loading={save.isPending}>
            Guardar conservação
          </Button>
        )}
      </div>
    </form>
  )
}

function HolidaysPanel() {
  const org = useActiveOrg()
  const [year, setYear] = useState(new Date().getFullYear())
  const holidays = useHolidays(org.id, year)
  const action = useHolidayAction(org.id)
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  return (
    <Panel
      title="Feriados da empresa"
      description="Feriados municipais ou dias de encerramento: o trabalho nesses dias conta como extra."
      actions={
        <Select aria-label="Ano" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-8 w-28">
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      }
    >
      <div className="flex flex-col gap-3">
        {(holidays.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-3">Sem feriados próprios em {year}.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-2">
            {holidays.data!.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-1.5 text-sm">
                <span>
                  <span className="font-semibold tabular">{formatDate(h.date)}</span> · {h.name}
                </span>
                <IconButton label={`Remover ${h.name}`} size="sm" onClick={() => action.mutate({ action: 'remove', id: h.id }, { onError: (e) => toast.error(errorMessage(e)) })}>
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            action.mutate(
              { action: 'add', date, name: name.trim() },
              { onSuccess: () => (toast.success('Feriado adicionado'), setName(''), setDate('')), onError: (err) => toast.error(errorMessage(err)) },
            )
          }}
        >
          <Field label="Data">{(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Nome">{(p) => <Input {...p} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Feriado municipal" />}</Field>
          <Button type="submit" icon={<Plus className="size-4" />} disabled={!date || name.trim().length < 2} loading={action.isPending}>
            Adicionar
          </Button>
        </form>
      </div>
    </Panel>
  )
}

function SupportPanel() {
  const org = useActiveOrg()
  const grants = useSupportGrants(org.id)
  const action = useSupportAction(org.id)
  const [email, setEmail] = useState('')
  const [hoursValue, setHours] = useState('4')
  const [reason, setReason] = useState('')
  return (
    <Panel
      title="Acesso de suporte"
      description="Autorize a equipa de suporte do Andaime a ver os dados da empresa durante algumas horas, para ajudar num problema. O acesso é só de leitura, pode ser revogado a qualquer momento e cada consulta fica na auditoria."
    >
      <div className="flex flex-col gap-4">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_120px]"
          onSubmit={(e) => {
            e.preventDefault()
            action.mutate(
              { action: 'grant', email: email.trim(), hours: Number(hoursValue), reason: reason.trim() },
              { onSuccess: () => (toast.success('Acesso de suporte autorizado'), setReason('')), onError: (err) => toast.error(errorMessage(err)) },
            )
          }}
        >
          <Field label="Email da pessoa do suporte">{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Field label="Duração (horas)">{(p) => <Input {...p} type="number" min={1} max={72} value={hoursValue} onChange={(e) => setHours(e.target.value)} />}</Field>
          <Field label="Motivo" className="sm:col-span-2" hint="Ex.: investigar as horas da semana 42 que não batem certo.">
            {(p) => <Textarea {...p} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" icon={<ShieldCheck className="size-4" />} disabled={!email.trim() || reason.trim().length < 10} loading={action.isPending}>
              Autorizar acesso
            </Button>
          </div>
        </form>
        {(grants.data ?? []).length > 0 && (
          <ul className="flex flex-col divide-y divide-line-2 rounded-md border border-line-2">
            {grants.data!.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-semibold">{g.platformUserName}</span> <span className="text-ink-3">({g.platformUserEmail})</span>
                  <span className="block text-xs text-ink-3">
                    “{g.reason}” · por {g.grantedBy} · até {when.format(new Date(g.expiresAt))} · {g.requests} consulta(s)
                  </span>
                </span>
                {g.active ? (
                  <Button size="sm" variant="danger" loading={action.isPending} onClick={() => action.mutate({ action: 'revoke', id: g.id }, { onSuccess: () => toast.success('Acesso revogado') })}>
                    Revogar
                  </Button>
                ) : (
                  <Badge>{g.revokedAt ? 'Revogado' : 'Expirado'}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
