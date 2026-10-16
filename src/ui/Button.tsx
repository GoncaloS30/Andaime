import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'quiet'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-pinho text-white hover:bg-pinho-2 active:bg-musgo disabled:bg-ink-4',
  secondary: 'bg-surface text-ink border border-line hover:border-ink-4 hover:bg-cal active:bg-line-2',
  ghost: 'text-ink-2 hover:bg-line-2 hover:text-ink active:bg-line',
  quiet: 'text-pinho underline-offset-2 hover:underline px-0! h-auto!',
  danger: 'bg-tijolo text-white hover:bg-tijolo-ink active:bg-tijolo-ink',
  accent: 'bg-lima text-pinho hover:bg-lima-2 active:bg-lima-2',
}

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-sm gap-1.5 rounded-sm',
  md: 'h-9 px-3.5 text-base gap-2 rounded-md',
  lg: 'h-12 px-5 text-md gap-2.5 rounded-md',
}

/** Mesmo visual do botão para ligações (react-router Link). */
export function buttonStyles(variant: Variant = 'secondary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-colors duration-(--duration-fast)',
    variants[variant],
    sizes[size],
    className,
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, iconRight, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none',
        'transition-[background-color,border-color,color,transform] duration-(--duration-fast) ease-(--ease-andaime)',
        'active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'ghost' | 'secondary' | 'onDark'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', variant = 'ghost', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-(--duration-fast)',
        size === 'sm' && 'size-7',
        size === 'md' && 'size-9',
        size === 'lg' && 'size-11',
        variant === 'ghost' && 'text-ink-2 hover:bg-line-2 hover:text-ink',
        variant === 'secondary' && 'border border-line bg-surface text-ink hover:border-ink-4',
        variant === 'onDark' && 'on-dark text-white/80 hover:bg-white/10 hover:text-white',
        'disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
