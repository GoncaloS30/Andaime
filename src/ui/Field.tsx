import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

const control =
  'w-full rounded-md border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-4 ' +
  'transition-[border-color,box-shadow] duration-(--duration-fast) hover:border-ink-4 ' +
  'focus:outline-none focus-visible:border-pinho focus-visible:ring-2 focus-visible:ring-pinho/15 ' +
  'aria-[invalid=true]:border-tijolo aria-[invalid=true]:ring-tijolo/15 disabled:bg-line-2 disabled:text-ink-3'

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  className?: string
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode
}

/** Rótulo, ajuda e erro ligados ao controlo por id (acessível por leitor de ecrã). */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-err` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-3">(opcional)</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-tijolo-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-9', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(control, 'min-h-20 py-2 leading-snug', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, 'h-9 appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3" />
    </div>
  )
})

interface SwitchProps {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  className?: string
}

export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps) {
  const id = useId()
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-base font-medium text-ink">
          {label}
        </label>
        {description && <p className="text-sm text-ink-3">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors duration-(--duration-base)',
          checked ? 'bg-pinho' : 'bg-line',
          disabled && 'opacity-50',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-(--duration-base) ease-(--ease-andaime)',
            checked && 'translate-x-4 bg-lima',
          )}
        />
      </button>
    </div>
  )
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
}

export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-base text-ink', className)}>
      <input type="checkbox" className="size-4 rounded-xs border-line accent-pinho" {...rest} />
      {label}
    </label>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; icon?: ReactNode }[]
  label: string
  size?: 'sm' | 'md'
  className?: string
}

/** Grupo de opções exclusivas (radiogroup acessível por setas). */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', className }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex shrink-0 rounded-md border border-line bg-line-2 p-0.5', className)}
      onKeyDown={(e) => {
        const i = options.findIndex((o) => o.value === value)
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault()
          onChange(options[(i + 1) % options.length]!.value)
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          onChange(options[(i - 1 + options.length) % options.length]!.value)
        }
      }}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm font-medium whitespace-nowrap transition-colors duration-(--duration-fast)',
              size === 'sm' ? 'h-6 px-2 text-sm' : 'h-7.5 px-3 text-sm',
              active ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(19_52_42/0.1)]' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

interface ChipToggleProps {
  pressed: boolean
  onClick: () => void
  children: ReactNode
  className?: string
  disabled?: boolean
}

export function ChipToggle({ pressed, onClick, children, className, disabled }: ChipToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-(--duration-fast)',
        pressed ? 'border-pinho bg-pinho text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-4 hover:text-ink',
        disabled && 'opacity-40',
        className,
      )}
    >
      {children}
    </button>
  )
}
