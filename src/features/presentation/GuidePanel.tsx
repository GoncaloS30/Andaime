import { ChevronDown, ChevronLeft, ChevronRight, Compass, Play, Presentation, RotateCcw, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ROLE_LABEL } from '@/copy'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Button, IconButton } from '@/ui/Button'
import { CHAPTERS, type Chapter } from './chapters'
import { scenario } from './scenario'
import { Spotlight } from './Spotlight'
import { useTour } from './tourStore'

/**
 * Guião do modo apresentação. Faz parte do produto: a app continua utilizável ao lado,
 * cada passo prepara o estado de que precisa e "Explorar livremente" fecha sem repor nada.
 */
export function GuidePanel() {
  const open = useTour((s) => s.open)
  const chapterId = useTour((s) => s.chapterId)
  const step = useTour((s) => s.step)
  const stage = useTour((s) => s.stage)
  const setOpen = useTour((s) => s.setOpen)
  const goTo = useTour((s) => s.goTo)
  const setHighlight = useTour((s) => s.setHighlight)
  const setStage = useTour((s) => s.setStage)
  const reset = useDemo((s) => s.resetDemo)
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<string | null>(chapterId ?? CHAPTERS[0]!.id)
  const [busy, setBusy] = useState(false)

  const chapter = CHAPTERS.find((c) => c.id === chapterId)
  const current = chapter?.steps[step]

  const run = async (c: Chapter, i: number) => {
    const s = c.steps[i]
    if (!s) return
    setBusy(true)
    goTo(c.id, i)
    setExpanded(c.id)
    try {
      scenario.role(s.role)
      await s.run({ navigate })
      setHighlight(s.target ?? null)
      if (s.stage) setStage(true, s.stage)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível preparar este passo.')
    } finally {
      setBusy(false)
    }
  }

  const flat = CHAPTERS.flatMap((c) => c.steps.map((_, i) => ({ c, i })))
  const pos = chapter ? flat.findIndex((x) => x.c.id === chapter.id && x.i === step) : -1
  const next = () => { const n = flat[pos + 1] ?? flat[0]!; void run(n.c, n.i) }
  const prev = () => { const p = flat[Math.max(0, pos - 1)]!; void run(p.c, p.i) }

  if (!open) return null

  return (
    <>
      <Spotlight />
      <aside
        aria-label="Guião de apresentação"
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).tagName === 'INPUT') return
          if (e.key === 'ArrowRight') { e.preventDefault(); next() }
          if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
          if (e.key === 'Escape') setOpen(false)
        }}
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-[60] flex max-h-[52dvh] flex-col border-t border-line bg-surface shadow-e2 animate-sheet-in xl:inset-x-auto xl:top-14 xl:right-0 xl:bottom-0 xl:max-h-none xl:w-[360px] xl:border-t-0 xl:border-l xl:animate-drawer-in"
      >
        <header className="on-dark flex items-center gap-2 bg-pinho px-4 py-3 text-white">
          <Presentation className="size-4 text-lima" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-wide text-sm font-semibold">Modo apresentação</p>
            <p className="text-[11px] text-white/60">Cada passo prepara o que precisa. A app continua utilizável.</p>
          </div>
          <IconButton label={stage ? 'Esconder telemóvel' : 'Mostrar telemóvel do trabalhador'} variant="onDark" size="sm" aria-pressed={stage} onClick={() => setStage(!stage)}>
            <Smartphone className="size-4" />
          </IconButton>
        </header>

        {current && chapter && (
          <section aria-live="polite" className="border-b border-line-2 bg-lima-soft/40 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
              {chapter.title} · passo {step + 1} de {chapter.steps.length} · {ROLE_LABEL[current.role]}
            </p>
            <h2 className="mt-0.5 font-wide text-base font-semibold">{current.title}</h2>
            <p className="mt-1 text-sm text-ink-2">{current.narration}</p>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" icon={<ChevronLeft className="size-4" />} onClick={prev} disabled={busy || pos <= 0}>Anterior</Button>
              <Button size="sm" variant="primary" iconRight={<ChevronRight className="size-4" />} onClick={next} disabled={busy} loading={busy}>Seguinte</Button>
              <span className="ml-auto text-[11px] text-ink-3">← → no painel</span>
            </div>
          </section>
        )}

        <nav aria-label="Capítulos" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {CHAPTERS.map((c) => {
            const isOpen = expanded === c.id
            return (
              <div key={c.id} className="border-b border-line-2 last:border-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : c.id)}
                  className={cn('flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left hover:bg-cal', chapterId === c.id && 'font-semibold')}
                >
                  <ChevronDown aria-hidden className={cn('mt-0.5 size-4 shrink-0 text-ink-3 transition-transform', !isOpen && '-rotate-90')} />
                  <span className="min-w-0">
                    <span className="block text-sm">{c.title}</span>
                    {isOpen && <span className="block text-xs font-normal text-ink-3">{c.summary}</span>}
                  </span>
                </button>
                {isOpen && (
                  <ol className="mb-2 ml-6 flex flex-col gap-0.5">
                    {c.steps.map((s, i) => {
                      const active = chapterId === c.id && step === i
                      return (
                        <li key={i}>
                          <button
                            type="button"
                            onClick={() => void run(c, i)}
                            aria-current={active ? 'step' : undefined}
                            className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm', active ? 'bg-pinho text-white' : 'text-ink-2 hover:bg-line-2')}
                          >
                            <Play aria-hidden className={cn('size-3 shrink-0', active ? 'text-lima' : 'text-ink-4')} />
                            {s.title}
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
            )
          })}
        </nav>

        <footer className="flex flex-wrap gap-2 border-t border-line-2 px-4 py-3">
          <Button size="sm" variant="ghost" icon={<Compass className="size-4" />} onClick={() => setOpen(false)}>Explorar livremente</Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            icon={<RotateCcw className="size-4" />}
            onClick={() => {
              reset()
              goTo(CHAPTERS[0]!.id, 0)
              setHighlight(null)
              navigate('/')
              toast.success('Demonstração reposta', { description: 'Pronta para começar de novo.' })
            }}
          >
            Recomeçar
          </Button>
        </footer>
      </aside>
    </>
  )
}
