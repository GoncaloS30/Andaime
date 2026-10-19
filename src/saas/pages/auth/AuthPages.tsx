import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button, buttonStyles } from '@/ui/Button'
import { Field, Input } from '@/ui/Field'
import { useForgotPassword, useLogin, useResetPassword, useSignup, useVerifyEmail } from '../../api/hooks'
import { errorMessage, isApiError } from '../../api/http'
import { AuthLayout, EMAIL_PATTERN, FormError, FormNotice, passwordProblem } from './AuthLayout'

function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate({ email: email.trim(), password }, { onSuccess: () => navigate(safeNext(params.get('next')), { replace: true }) })
  }

  const error = login.error
  const message = isApiError(error, 'rate-limited')
    ? `Demasiadas tentativas. Tente de novo dentro de ${Math.ceil((error.retryAfter ?? 60) / 60)} min.`
    : isApiError(error, 'unauthenticated')
      ? 'Email ou palavra-passe inválidos. Se acabou de criar a conta, confirme primeiro o email.'
      : error
        ? errorMessage(error)
        : null

  return (
    <AuthLayout
      title="Entrar no Andaime"
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/registar" className="font-medium text-pinho hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {params.get('sessao') === 'expirada' && <FormNotice>A sessão terminou. Entre novamente para continuar.</FormNotice>}
        <FormError message={message} />
        <Field label="Email">
          {(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
        </Field>
        <Field label="Palavra-passe">
          {(p) => (
            <Input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={login.isPending} disabled={!email || !password}>
          Entrar
        </Button>
        <Link to="/recuperar" className="self-center text-sm text-pinho hover:underline">
          Esqueci-me da palavra-passe
        </Link>
      </form>
    </AuthLayout>
  )
}

export function SignupPage() {
  const signup = useSignup()
  const [params] = useSearchParams()
  const [form, setForm] = useState({ displayName: '', email: params.get('email') ?? '', password: '' })
  const [touched, setTouched] = useState(false)

  const errors = {
    displayName: form.displayName.trim().length < 2 ? 'Indique o seu nome.' : null,
    email: !EMAIL_PATTERN.test(form.email.trim()) ? 'Indique um email válido.' : null,
    password: passwordProblem(form.password, form.email),
  }
  const server = signup.error && isApiError(signup.error) ? signup.error.fieldErrors : {}
  const valid = !errors.displayName && !errors.email && !errors.password

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (valid) signup.mutate({ displayName: form.displayName.trim(), email: form.email.trim(), password: form.password })
  }

  if (signup.isSuccess) {
    return (
      <AuthLayout title="Confirme o seu email" description={`Enviámos uma ligação de confirmação para ${form.email.trim()}.`}>
        <div className="flex flex-col gap-3 text-sm text-ink-2">
          <p>Abra o email e carregue na ligação para ativar a conta. A ligação é válida durante 24 horas.</p>
          <p className="text-ink-3">Se não encontrar o email, veja na pasta de spam.</p>
          <Link to="/entrar" className={buttonStyles('secondary', 'md', 'mt-2')}>
            Voltar a entrar
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Criar conta"
      description="Crie a sua conta e, a seguir, a sua empresa ou aceite um convite."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/entrar" className="font-medium text-pinho hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError message={signup.error && !Object.keys(server).length ? errorMessage(signup.error) : null} />
        <Field label="Nome" error={(touched && errors.displayName) || server.displayName}>
          {(p) => <Input {...p} autoComplete="name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />}
        </Field>
        <Field label="Email" error={(touched && errors.email) || server.email}>
          {(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field label="Palavra-passe" hint="Pelo menos 12 caracteres. Uma frase fácil de lembrar é uma boa opção." error={(touched && errors.password) || server.password}>
          {(p) => (
            <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={signup.isPending}>
          Criar conta
        </Button>
      </form>
    </AuthLayout>
  )
}

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const verify = useVerifyEmail()
  const { mutate } = verify
  const started = useRef(false)
  useEffect(() => {
    // O token é de uso único: garante um só pedido, mesmo com o duplo efeito do StrictMode.
    if (token && !started.current) {
      started.current = true
      mutate(token)
    }
  }, [token, mutate])

  return (
    <AuthLayout title="Confirmação de email">
      <div className="flex flex-col gap-4 text-sm">
        {!token && <FormError message="A ligação não tem código de confirmação. Abra-a novamente a partir do email." />}
        {verify.isPending && <p role="status">A confirmar o seu email…</p>}
        {verify.isSuccess && <FormNotice>Email confirmado. Já pode entrar.</FormNotice>}
        {verify.isError && (
          <FormError
            message={isApiError(verify.error, 'invalid-token') ? 'A ligação é inválida ou expirou. Registe-se de novo para receber outra.' : errorMessage(verify.error)}
          />
        )}
        <Link to="/entrar" className={buttonStyles(verify.isSuccess ? 'primary' : 'secondary', 'md')}>
          Entrar
        </Link>
      </div>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const forgot = useForgotPassword()
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const invalid = !EMAIL_PATTERN.test(email.trim())

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!invalid) forgot.mutate(email.trim())
  }

  return (
    <AuthLayout title="Recuperar palavra-passe" description="Indique o email da sua conta. Enviamos uma ligação para definir uma nova palavra-passe.">
      {forgot.isSuccess ? (
        <div className="flex flex-col gap-4 text-sm">
          <FormNotice>Se existir uma conta com esse email, receberá a ligação dentro de momentos. A ligação é válida durante 1 hora.</FormNotice>
          <Link to="/entrar" className={buttonStyles('secondary')}>
            Voltar a entrar
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormError message={forgot.error ? errorMessage(forgot.error) : null} />
          <Field label="Email" error={touched && invalid ? 'Indique um email válido.' : null}>
            {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={forgot.isPending}>
            Enviar ligação
          </Button>
          <Link to="/entrar" className="self-center text-sm text-pinho hover:underline">
            Voltar a entrar
          </Link>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const reset = useResetPassword()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const problem = passwordProblem(password) ?? (confirm !== password ? 'As palavras-passe não coincidem.' : null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!problem) reset.mutate({ token, password })
  }

  if (reset.isSuccess) {
    return (
      <AuthLayout title="Palavra-passe alterada">
        <div className="flex flex-col gap-4 text-sm">
          <FormNotice>A nova palavra-passe está ativa. Por segurança, terminámos todas as sessões abertas.</FormNotice>
          <Link to="/entrar" className={buttonStyles('primary')}>
            Entrar
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Nova palavra-passe">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {!token && <FormError message="A ligação não tem código. Abra-a novamente a partir do email." />}
        <FormError
          message={
            reset.error ? (isApiError(reset.error, 'invalid-token') ? 'A ligação é inválida ou expirou. Peça uma nova.' : errorMessage(reset.error)) : null
          }
        />
        <Field label="Nova palavra-passe" hint="Pelo menos 12 caracteres." error={touched ? passwordProblem(password) : null}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Repetir palavra-passe" error={touched && confirm !== password ? 'As palavras-passe não coincidem.' : null}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={reset.isPending} disabled={!token}>
          Guardar palavra-passe
        </Button>
        {isApiError(reset.error, 'invalid-token') && (
          <Link to="/recuperar" className="self-center text-sm text-pinho hover:underline">
            Pedir nova ligação
          </Link>
        )}
      </form>
    </AuthLayout>
  )
}
