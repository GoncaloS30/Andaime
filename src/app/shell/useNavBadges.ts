import { useMemo } from 'react'
import { selectConflicts, selectDashboard, selectForemanScope, sheets } from '@/store/selectors'
import { useDemo } from '@/store/store'

export function useNavBadges() {
  const db = useDemo((s) => s.db)
  const session = useDemo((s) => s.session)
  return useMemo(() => {
    const s = { db, session }
    const k = selectDashboard(s)
    const conflicts = selectConflicts(s)
    let approvals = k.pendingApprovals
    if (session.role === 'encarregado') {
      const scope = new Set(selectForemanScope(s).workerIds)
      approvals = sheets(Object.values(db.entries).filter((e) => scope.has(e.workerId)), 'submetido')
    }
    return {
      conflicts: conflicts.length,
      conflictsCritical: conflicts.some((c) => c.severity === 'critico'),
      approvals,
      absences: k.absencesPending,
      documents: k.docsAttention,
    }
  }, [db, session])
}
