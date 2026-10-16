import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type { ISODate } from '@/domain/types'
import { weekStart } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import type { Perspective, Scale } from './model'

const PERSPECTIVES: Perspective[] = ['trabalhadores', 'equipas', 'obras', 'viaturas']

/** Estado do planeamento na URL: partilhável e preservado ao navegar. */
export function usePlanningParams() {
  const [sp, setSp] = useSearchParams()
  const today = useDemo((s) => s.session.today)
  const rawWeek = sp.get('semana')
  const week: ISODate = rawWeek && /^\d{4}-\d{2}-\d{2}$/.test(rawWeek) ? weekStart(rawWeek) : weekStart(today)
  const p = sp.get('vista') as Perspective | null
  const perspective: Perspective = p && PERSPECTIVES.includes(p) ? p : 'trabalhadores'
  const scale: Scale = sp.get('escala') === 'mes' ? 'mes' : 'semana'
  const panel = sp.get('painel') === 'conflitos' ? 'conflitos' : null

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSp],
  )

  return {
    week,
    perspective,
    scale,
    panel,
    team: sp.get('equipa'),
    site: sp.get('obra'),
    query: sp.get('q') ?? '',
    newSchedule: sp.get('nova') === 'escala',
    focus: sp.get('foco'),
    update,
  }
}
