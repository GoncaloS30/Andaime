import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ROLE_HOME, ROLE_LABEL } from '@/copy'
import type { Role } from '@/domain/types'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/States'

/** Âmbitos simulados: uma rota fora do papel ativo mostra "Sem acesso" em vez do conteúdo. */
export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const role = useDemo((s) => s.session.role)
  const setRole = useDemo((s) => s.setRole)
  const navigate = useNavigate()
  if (roles.includes(role)) return <>{children}</>
  const target = roles[0]!
  return (
    <EmptyState
      icon={<Lock />}
      title={`Sem acesso como ${ROLE_LABEL[role].toLowerCase()}`}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => setRole(target)}>
            Ver como {ROLE_LABEL[target].toLowerCase()}
          </Button>
          <Button variant="ghost" onClick={() => navigate(ROLE_HOME[role])}>
            Voltar ao início
          </Button>
        </div>
      }
    >
      Esta área pertence à experiência de {roles.map((r) => ROLE_LABEL[r].toLowerCase()).join(' e ')}. Nesta demonstração as permissões são
      simuladas.
    </EmptyState>
  )
}
