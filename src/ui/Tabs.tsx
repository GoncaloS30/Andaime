import * as RT from '@radix-ui/react-tabs'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface TabsProps {
  value: string
  onValueChange: (v: string) => void
  tabs: { value: string; label: ReactNode; count?: number; tone?: 'warn' | 'danger' }[]
  children: ReactNode
  label: string
  className?: string
  listClassName?: string
}

/** Separadores com sublinhado; setas mudam de separador (Radix). */
export function Tabs({ value, onValueChange, tabs, children, label, className, listClassName }: TabsProps) {
  return (
    <RT.Root value={value} onValueChange={onValueChange} className={className}>
      <RT.List
        aria-label={label}
        className={cn('flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]', listClassName)}
      >
        {tabs.map((t) => (
          <RT.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              'relative inline-flex h-10 shrink-0 items-center gap-1.5 px-2.5 text-sm font-medium text-ink-3 transition-colors',
              'hover:text-ink data-[state=active]:text-ink',
              'after:absolute after:inset-x-1.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-pinho',
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={cn(
                  'rounded-xs px-1 text-[11px] font-semibold tabular',
                  t.tone === 'danger' ? 'bg-tijolo-soft text-tijolo-ink' : t.tone === 'warn' ? 'bg-ambar-soft text-ambar-ink' : 'bg-line-2 text-ink-2',
                )}
              >
                {t.count}
              </span>
            )}
          </RT.Trigger>
        ))}
      </RT.List>
      {children}
    </RT.Root>
  )
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <RT.Content value={value} className={cn('pt-4 focus:outline-none', className)}>
      {children}
    </RT.Content>
  )
}
