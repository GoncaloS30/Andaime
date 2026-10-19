import type { ReactNode } from 'react'
import { Wordmark } from '@/app/shell/Logo'

/** Moldura dos ecrãs públicos (entrar, registar, recuperar, convite, onboarding). */
export function AuthLayout({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-cal">
      <header className="px-4 pt-6 sm:px-8">
        <Wordmark />
      </header>
      <main id="conteudo" className="flex flex-1 items-start justify-center px-4 pt-10 pb-16 sm:pt-16">
        <div className="w-full max-w-[420px]">
          <h1 className="font-expanded text-2xl leading-tight font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-2 text-base text-ink-3">{description}</p>}
          <div className="mt-6 rounded-lg border border-line bg-surface p-5 sm:p-6">{children}</div>
          {footer && <div className="mt-4 text-center text-sm text-ink-3">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

/** Mensagem de erro do formulário (anunciada por leitores de ecrã). */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md border border-tijolo/30 bg-tijolo-soft px-3 py-2 text-sm text-tijolo-ink">
      {message}
    </p>
  )
}

export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-md border border-ok/30 bg-ok-soft px-3 py-2 text-sm text-ok">
      {children}
    </p>
  )
}

/** Regras de palavra-passe partilhadas com o backend (12 a 128 caracteres). */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 12) return 'Use pelo menos 12 caracteres.'
  if (password.length > 128) return 'Use no máximo 128 caracteres.'
  if (email && password.toLowerCase().includes(email.split('@')[0]!.toLowerCase()) && email.split('@')[0]!.length >= 4)
    return 'Não use o seu email na palavra-passe.'
  return null
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
