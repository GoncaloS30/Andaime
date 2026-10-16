import { useEffect, useState } from 'react'

function hhmm(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Hora atual HH:MM, atualizada a cada 20 s (para cronómetros de ponto). */
export function useNow(): string {
  const [now, setNow] = useState(hhmm)
  useEffect(() => {
    const t = setInterval(() => setNow(hhmm()), 20_000)
    return () => clearInterval(t)
  }, [])
  return now
}
