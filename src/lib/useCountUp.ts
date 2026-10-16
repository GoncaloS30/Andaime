import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}

/**
 * Contagem curta (260 ms) quando um número muda — feedback de que uma ação teve efeito.
 * Sem animação no primeiro render nem com movimento reduzido.
 */
export function useCountUp(target: number, duration = 260): number {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = from.current
    from.current = target
    if (start === target || prefersReducedMotion()) {
      setValue(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - (1 - p) ** 3
      setValue(start + (target - start) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}
