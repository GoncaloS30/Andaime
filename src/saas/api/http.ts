/**
 * Cliente HTTP do Andaime. Mesma origem (proxy do Vite em desenvolvimento, reverse proxy em produção):
 * a sessão vive num cookie HttpOnly que o JavaScript não lê; nunca há tokens no localStorage.
 * Mutações levam o cabeçalho X-XSRF-TOKEN com o valor do cookie XSRF-TOKEN.
 */

export interface FieldProblem {
  field: string
  code: string
  message: string
}

/** Erro da API em formato RFC 9457 (application/problem+json), com `code` estável. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: Record<string, string>
  readonly requestId?: string
  readonly retryAfter?: number
  /** Propriedades extra do problema (ex.: `conflicts` num 409 de planeamento). */
  readonly details: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    message: string,
    extra: { fieldErrors?: FieldProblem[]; requestId?: string; retryAfter?: number; details?: Record<string, unknown> } = {},
  ) {
    super(message)
    this.details = extra.details ?? {}
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = extra.requestId
    this.retryAfter = extra.retryAfter
    this.fieldErrors = Object.fromEntries((extra.fieldErrors ?? []).map((f) => [f.field, f.message]))
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}

/** Mensagem para o utilizador a partir de qualquer erro. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'Não foi possível contactar o servidor. Verifique a ligação e tente de novo.'
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

function readCookie(name: string): string | undefined {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined
}

async function refreshCsrf(): Promise<void> {
  await fetch('/api/auth/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
}

async function toApiError(response: Response): Promise<ApiError> {
  const retryAfter = Number(response.headers.get('Retry-After')) || undefined
  let body: { code?: string; detail?: string; title?: string; errors?: FieldProblem[]; requestId?: string; [key: string]: unknown } = {}
  try {
    body = await response.json()
  } catch {
    // corpo vazio ou não JSON (ex.: proxy em baixo)
  }
  const fallback =
    response.status === 401
      ? 'A sessão terminou. Entre novamente.'
      : response.status === 403
        ? 'Não tem permissão para esta operação.'
        : response.status === 404
          ? 'Não encontrado.'
          : response.status === 429
            ? 'Demasiadas tentativas. Aguarde um pouco e tente de novo.'
            : response.status >= 500
              ? 'O servidor teve um problema. Tente de novo dentro de momentos.'
              : 'O pedido não pôde ser processado.'
  return new ApiError(response.status, body.code ?? `http-${response.status}`, body.detail ?? fallback, {
    fieldErrors: body.errors,
    requestId: body.requestId,
    retryAfter,
    details: body,
  })
}

/** Ouvintes de sessão expirada (o cache de queries e o router reagem). */
const unauthorizedListeners = new Set<() => void>()
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

export async function api<T>(path: string, options: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const unsafe = UNSAFE.has(method)

  const send = async () => {
    if (unsafe && !readCookie('XSRF-TOKEN')) await refreshCsrf()
    const headers: Record<string, string> = { Accept: 'application/json' }
    const multipart = options.body instanceof FormData
    if (options.body !== undefined && !multipart) headers['Content-Type'] = 'application/json'
    const token = unsafe ? readCookie('XSRF-TOKEN') : undefined
    if (token) headers['X-XSRF-TOKEN'] = token
    return fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: multipart ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  }

  let response = await send()
  if (response.status === 403 && unsafe) {
    const error = await toApiError(response.clone())
    if (error.code === 'csrf') {
      // Token CSRF em falta ou rodado: obtém um novo e repete uma única vez.
      await refreshCsrf()
      response = await send()
    }
  }
  if (!response.ok) {
    const error = await toApiError(response)
    if (response.status === 401 && path !== '/me' && !path.startsWith('/auth/')) unauthorizedListeners.forEach((l) => l())
    throw error
  }
  if (response.status === 204 || response.headers.get('Content-Length') === '0') return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}
