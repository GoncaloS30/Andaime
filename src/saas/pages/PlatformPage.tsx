import { Navigate } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { PageHeader, Panel } from '@/ui/Layout'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { usePlatformOrganizations, useSetOrganizationStatus } from '../api/hooks'
import { errorMessage } from '../api/http'
import { useSession } from '../session'

const date = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium' })

/** Administração da plataforma: empresas clientes, estado e suspensão. */
export function PlatformPage() {
  const { me } = useSession()
  const orgs = usePlatformOrganizations()
  const setStatus = useSetOrganizationStatus()
  if (!me.platformAdmin) return <Navigate to="/" replace />
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Empresas clientes" description="Suspender uma empresa impede o acesso de todos os seus membros. A ação fica auditada na empresa." />
      <Panel flush>
        {orgs.isPending ? (
          <SkeletonRows rows={4} />
        ) : orgs.isError ? (
          <ErrorState onRetry={() => void orgs.refetch()} />
        ) : orgs.data.length === 0 ? (
          <EmptyState compact title="Ainda não há empresas" />
        ) : (
          <ul className="divide-y divide-line-2">
            {orgs.data.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{o.name}</p>
                  <p className="text-sm text-ink-3">
                    {o.country} · {o.members} {o.members === 1 ? 'membro' : 'membros'} · desde {date.format(new Date(o.createdAt))}
                  </p>
                </div>
                <Badge tone={o.status === 'ACTIVE' ? 'ok' : 'danger'} dot>
                  {o.status === 'ACTIVE' ? 'Ativa' : 'Suspensa'}
                </Badge>
                <Button
                  size="sm"
                  variant={o.status === 'ACTIVE' ? 'ghost' : 'secondary'}
                  loading={setStatus.isPending && setStatus.variables?.orgId === o.id}
                  onClick={() =>
                    setStatus.mutate(
                      { orgId: o.id, suspend: o.status === 'ACTIVE' },
                      { onSuccess: () => toast.success(o.status === 'ACTIVE' ? `${o.name} suspensa` : `${o.name} reativada`), onError: (e) => toast.error(errorMessage(e)) },
                    )
                  }
                >
                  {o.status === 'ACTIVE' ? 'Suspender' : 'Reativar'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
