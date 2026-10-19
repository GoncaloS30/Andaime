import { create } from 'zustand'
import type { WorkerTab } from '../worker-app/WorkerScreens'

/** Estado de interface do modo apresentação (não é dado de domínio, não é persistido). */
interface TourState {
  open: boolean
  chapterId: string | null
  step: number
  /** Alvo realçado (valor de data-tour). */
  highlight: string | null
  /** Palco dividido: backoffice + telemóvel do trabalhador lado a lado. */
  stage: boolean
  stageTab: WorkerTab
  /** De quem é o telemóvel no palco: do trabalhador (app) ou do encarregado (diário). */
  stageApp: 'trabalhador' | 'encarregado'
  toggle: () => void
  setOpen: (o: boolean) => void
  goTo: (chapterId: string, step: number) => void
  setHighlight: (h: string | null) => void
  setStage: (s: boolean, tab?: WorkerTab, app?: 'trabalhador' | 'encarregado') => void
  setStageTab: (t: WorkerTab) => void
}

export const useTour = create<TourState>((set) => ({
  open: false,
  chapterId: null,
  step: 0,
  highlight: null,
  stage: false,
  stageTab: 'hoje',
  stageApp: 'trabalhador',
  toggle: () => set((s) => (s.open ? { open: false, highlight: null, stage: false } : { open: true })),
  setOpen: (open) => set(open ? { open } : { open, highlight: null, stage: false }),
  goTo: (chapterId, step) => set({ chapterId, step }),
  setHighlight: (highlight) => set({ highlight }),
  setStage: (stage, tab, app) => set((s) => ({ stage, stageTab: tab ?? s.stageTab, stageApp: app ?? s.stageApp })),
  setStageTab: (stageTab) => set({ stageTab }),
}))
