import { useMemo } from 'react'
import { useDemo } from '@/store/store'
import type { DemoState } from '@/store/types'

type Slice = Pick<DemoState, 'db' | 'session'>

/**
 * Valor derivado de db+session. Recalcula quando db, session ou qualquer valor
 * em `deps` muda — passe em `deps` tudo o que a função usa além do estado (ex.: a semana visível).
 */
export function useDerived<T>(fn: (s: Slice) => T, deps: (string | number | boolean | null | undefined)[] = []): T {
  const db = useDemo((s) => s.db)
  const session = useDemo((s) => s.session)
  const depsKey = deps.map(String).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => fn({ db, session }), [db, session, depsKey])
}
