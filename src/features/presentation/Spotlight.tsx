import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTour } from './tourStore'

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Realça o elemento [data-tour] do passo atual com um anel Lima.
 * Não bloqueia a interface (pointer-events: none) e segue o elemento ao fazer scroll.
 */
export function Spotlight() {
  const target = useTour((s) => s.highlight)
  const [box, setBox] = useState<Box | null>(null)

  useEffect(() => {
    if (!target) return
    let raf = 0
    let scrolled = false
    const started = performance.now()
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
      if (el) {
        if (!scrolled) {
          // Alvos mais altos do que o ecrã: só o mínimo (centrar puxava também o contentor da página).
          const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6
          el.scrollIntoView({ block: tall ? 'nearest' : 'center', inline: 'nearest', behavior: 'smooth' })
          scrolled = true
        }
        const r = el.getBoundingClientRect()
        setBox((b) => (b && b.top === r.top && b.left === r.left && b.width === r.width && b.height === r.height ? b : { top: r.top, left: r.left, width: r.width, height: r.height }))
      } else {
        setBox(null)
      }
      // Segue o alvo durante 8 s (navegação, animações, scroll); depois para, para não gastar CPU.
      if (performance.now() - started < 8000) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const onScroll = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
      }
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      setBox(null)
    }
  }, [target])

  if (!target || !box) return null
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed z-[70] rounded-md ring-[3px] ring-lima transition-all duration-(--duration-slow) ease-(--ease-andaime) motion-reduce:transition-none"
      style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12, boxShadow: '0 0 0 4px rgb(19 52 42 / 0.55), 0 0 24px 6px rgb(200 226 106 / 0.55)' }}
    />,
    document.body,
  )
}
