import { create } from 'zustand'

/** Estado de interface do modo apresentação (não é dado de domínio, não é persistido). */
interface TourState {
  open: boolean
  chapterId: string | null
  step: number
  /** Alvo realçado (valor de data-tour). */
  highlight: string | null
  /** Palco dividido: backoffice + telemóvel do trabalhador lado a lado. */
  stage: boolean
  toggle: () => void
  setOpen: (o: boolean) => void
  goTo: (chapterId: string, step: number) => void
  setHighlight: (h: string | null) => void
  setStage: (s: boolean) => void
}

export const useTour = create<TourState>((set) => ({
  open: false,
  chapterId: null,
  step: 0,
  highlight: null,
  stage: false,
  toggle: () => set((s) => ({ open: !s.open, highlight: s.open ? null : s.highlight, stage: s.open ? false : s.stage })),
  setOpen: (open) => set(open ? { open } : { open, highlight: null, stage: false }),
  goTo: (chapterId, step) => set({ chapterId, step }),
  setHighlight: (highlight) => set({ highlight }),
  setStage: (stage) => set({ stage }),
}))
