import type { ReactNode } from 'react'
import { useDemo } from '@/store/store'
import { EmptyState, ErrorState } from '@/ui/States'

interface Props {
  children: ReactNode
  empty: { icon: ReactNode; title: string; text: ReactNode; action?: ReactNode }
}

/** Mostra os estados vazio/erro quando a demonstração os simula (menu Demonstração). */
export function ModuleGuard({ children, empty }: Props) {
  const flags = useDemo((s) => s.session.flags)
  const setFlag = useDemo((s) => s.setFlag)
  if (flags.simulateError) {
    return (
      <div className="rounded-lg border border-line bg-surface">
        <ErrorState onRetry={() => setFlag('simulateError', false)}>
          Simulação de falha de ligação. Ao tentar de novo, os dados voltam a aparecer — nada foi perdido.
        </ErrorState>
      </div>
    )
  }
  if (flags.emptyCompany) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface">
        <EmptyState icon={empty.icon} title={empty.title} action={empty.action}>
          {empty.text}
        </EmptyState>
      </div>
    )
  }
  return <>{children}</>
}
