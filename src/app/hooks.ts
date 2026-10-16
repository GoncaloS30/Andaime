import { useMemo } from 'react'
import { useDemo } from '@/store/store'
import type { DemoState } from '@/store/types'

type Slice = Pick<DemoState, 'db' | 'session'>

/** Valor derivado de db+session, recalculado só quando um deles muda. */
export function useDerived<T>(fn: (s: Slice) => T): T {
  const db = useDemo((s) => s.db)
  const session = useDemo((s) => s.session)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => fn({ db, session }), [db, session])
}
