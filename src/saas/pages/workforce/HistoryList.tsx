import { Panel } from '@/ui/Layout'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { useEntityHistory } from '../../api/workforce'
import { useActiveOrg } from '../../session'

const dateTime = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' })

const ACTION: Record<string, string> = {
  'employee.created': 'Registou o trabalhador',
  'employee.updated': 'Alterou a ficha',
  'employee.archived': 'Arquivou a ficha',
  'employee.restored': 'Repôs a ficha',
  'employee.contract-added': 'Registou um contrato',
  'employee.contract-removed': 'Removeu um contrato',
  'team.created': 'Criou a equipa',
  'team.updated': 'Alterou a equipa',
  'team.archived': 'Arquivou a equipa',
  'team.member-added': 'Juntou um trabalhador',
  'team.member-removed': 'Retirou um trabalhador',
  'site.created': 'Criou a obra',
  'site.updated': 'Alterou a obra',
  'site.archived': 'Arquivou a obra',
  'site.restored': 'Repôs a obra',
  'site.issue-reported': 'Comunicou uma ocorrência',
  'site.issue-resolved': 'Resolveu uma ocorrência',
  'client.created': 'Criou o cliente',
  'client.updated': 'Alterou o cliente',
}

const FIELD: Record<string, string> = {
  fullName: 'nome',
  number: 'número',
  category: 'categoria',
  status: 'estado',
  phone: 'telemóvel',
  email: 'email',
  nationality: 'nacionalidade',
  homeCity: 'residência',
  hireDate: 'admissão',
  dailyCapacityMin: 'horas por dia',
  hourlyCost: 'custo por hora',
  skills: 'competências',
  sizes: 'tamanhos',
  notes: 'notas',
  name: 'nome',
  color: 'cor',
  foremanEmployeeId: 'responsável',
  hourLimitMin: 'limite de horas',
  directorUserId: 'diretor de obra',
  clientId: 'cliente',
  startDate: 'início',
  endDate: 'fim',
  timezone: 'fuso',
  latitude: 'localização',
  longitude: 'localização',
}

/** Histórico auditado de um registo (quem, quando, o quê). Valores pessoais nunca são mostrados. */
export function HistoryList({ entityType, id }: { entityType: 'employee' | 'team' | 'site' | 'client'; id: string }) {
  const org = useActiveOrg()
  const history = useEntityHistory(org.id, entityType, id)
  return (
    <Panel title="Histórico" description="Registo de auditoria: não pode ser alterado nem apagado." flush>
      {history.isPending ? (
        <SkeletonRows rows={3} />
      ) : history.isError ? (
        <ErrorState onRetry={() => void history.refetch()} />
      ) : history.data.items.length === 0 ? (
        <EmptyState compact title="Sem alterações registadas" />
      ) : (
        <ul className="divide-y divide-line-2">
          {history.data.items.map((e) => {
            const fields = [...new Set(Object.keys(e.changes).map((k) => FIELD[k]).filter(Boolean))]
            return (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
                <time className="w-36 shrink-0 text-ink-3 tabular" dateTime={e.occurredAt}>
                  {dateTime.format(new Date(e.occurredAt))}
                </time>
                <span className="min-w-0 flex-1">
                  <strong className="font-medium">{e.actorName ?? 'Sistema'}</strong> · {ACTION[e.action] ?? e.action}
                  {e.action.endsWith('.updated') && fields.length > 0 && <span className="text-ink-3"> ({fields.join(', ')})</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
