import { ArrowLeftRight, Smartphone } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { ROLE_HOME } from '@/copy'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/States'
import { WorkerApp } from './WorkerApp'
import type { WorkerTab } from './WorkerScreens'

const VALID: WorkerTab[] = ['hoje', 'proximas', 'semana', 'ausencias', 'documentos', 'notificacoes', 'perfil']

/** Rota /app: a app do trabalhador numa coluna de telemóvel (ecrã inteiro no telemóvel). */
export function WorkerRoute() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const role = useDemo((s) => s.session.role)
  const setRole = useDemo((s) => s.setRole)
  const current: WorkerTab = VALID.includes(tab as WorkerTab) ? (tab as WorkerTab) : 'hoje'

  if (role !== 'trabalhador') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cal p-4">
        <EmptyState
          icon={<Smartphone />}
          title="Esta é a app do trabalhador"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => setRole('trabalhador')}>Ver como trabalhador</Button>
              <Button variant="ghost" onClick={() => navigate(ROLE_HOME[role])}>Voltar ao início</Button>
            </div>
          }
        >
          Está a ver o Andaime como {role}. Nesta demonstração as permissões são simuladas.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#e9eae4] md:flex md:items-start md:justify-center md:py-6">
      <div className="relative mx-auto w-full md:w-[400px] md:overflow-hidden md:rounded-[28px] md:border-[6px] md:border-pinho md:shadow-e2">
        <WorkerApp tab={current} onTabChange={(t) => navigate(t === 'hoje' ? '/app' : `/app/${t}`)} />
      </div>
      <div className="fixed right-4 bottom-24 hidden md:block">
        <Button icon={<ArrowLeftRight className="size-4" />} onClick={() => { setRole('gestor'); navigate('/') }}>
          Voltar ao backoffice
        </Button>
      </div>
    </div>
  )
}
