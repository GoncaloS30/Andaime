import * as RM from '@radix-ui/react-dropdown-menu'
import * as RP from '@radix-ui/react-popover'
import * as RTip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  hint?: string
}

interface MenuProps {
  trigger: ReactNode
  items: (MenuItem | 'separator' | { heading: string })[]
  align?: 'start' | 'end'
}

export function Menu({ trigger, items, align = 'end' }: MenuProps) {
  return (
    <RM.Root>
      <RM.Trigger asChild>{trigger}</RM.Trigger>
      <RM.Portal>
        <RM.Content
          align={align}
          sideOffset={4}
          className="z-50 min-w-48 rounded-md border border-line bg-surface p-1 shadow-e1 animate-pop-in"
        >
          {items.map((it, i) =>
            it === 'separator' ? (
              <RM.Separator key={i} className="my-1 h-px bg-line-2" />
            ) : 'heading' in it ? (
              <RM.Label key={i} className="px-2 pt-1.5 pb-1 text-xs font-semibold text-ink-3">
                {it.heading}
              </RM.Label>
            ) : (
              <RM.Item
                key={i}
                disabled={it.disabled}
                onSelect={it.onSelect}
                className={cn(
                  'flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm outline-none select-none',
                  'data-[highlighted]:bg-line-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40',
                  it.danger ? 'text-tijolo-ink' : 'text-ink',
                )}
              >
                <span className="text-ink-3 [&>svg]:size-4">{it.icon}</span>
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="text-xs text-ink-4">{it.hint}</span>}
              </RM.Item>
            ),
          )}
        </RM.Content>
      </RM.Portal>
    </RM.Root>
  )
}

interface PopoverProps {
  trigger: ReactNode
  children: ReactNode
  open?: boolean
  onOpenChange?: (o: boolean) => void
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  label?: string
}

export function Popover({ trigger, children, open, onOpenChange, align = 'start', side = 'bottom', className, label }: PopoverProps) {
  return (
    <RP.Root open={open} onOpenChange={onOpenChange}>
      <RP.Trigger asChild>{trigger}</RP.Trigger>
      <RP.Portal>
        <RP.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
          className={cn('z-50 w-80 rounded-md border border-line bg-surface p-3 shadow-e1 animate-pop-in focus:outline-none', className)}
        >
          {children}
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  )
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTip.Root delayDuration={250}>
      <RTip.Trigger asChild>{children}</RTip.Trigger>
      <RTip.Portal>
        <RTip.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-64 rounded-sm bg-pinho px-2 py-1.5 text-xs leading-snug text-white shadow-e1 animate-fade-in"
        >
          {content}
        </RTip.Content>
      </RTip.Portal>
    </RTip.Root>
  )
}

export const TooltipProvider = RTip.Provider
