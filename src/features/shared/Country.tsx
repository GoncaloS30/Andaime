import { COUNTRY_NAME } from '@/domain/labels'
import type { Country } from '@/domain/types'
import { cn } from '@/lib/cn'

/** País com código ISO (sem emoji de bandeira: legível em qualquer sistema). */
export function CountryTag({ country, full, className }: { country: Country; full?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs text-ink-3', className)}>
      <span className="rounded-xs border border-line px-1 font-mono text-[10px] font-semibold text-ink-2">{country}</span>
      {full && COUNTRY_NAME[country]}
    </span>
  )
}
