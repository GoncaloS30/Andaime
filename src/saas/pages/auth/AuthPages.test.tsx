import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './AuthPages'

const ME = {
  user: { id: 'u1', email: 'ana@andaime.test', displayName: 'Ana', locale: 'pt-PT' },
  memberships: [],
  activeOrgId: null,
  platformAdmin: false,
  twoFactorEnabled: true,
  twoFactorSetupRequired: false,
}

function reply(status: number, body?: unknown) {
  const text = body === undefined ? '' : JSON.stringify(body)
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => JSON.parse(text),
    text: async () => text,
    clone: () => response,
  }
  return response
}

/** Servidor falso: o login pede o segundo passo; o código certo é 123456. */
function fakeServer() {
  const calls: { path: string; body: unknown }[] = []
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = input.replace(/^\/api/, '')
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ path, body })
    if (path === '/auth/csrf') return reply(200, { token: 't' })
    if (path === '/auth/login') return reply(200, { twoFactorRequired: true })
    if (path === '/auth/login/2fa') {
      return body?.code === '123456' ? reply(200, ME) : reply(401, { code: 'invalid-code', detail: 'O código não é válido ou já foi usado.' })
    }
    return reply(404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/entrar']}>
        <Routes>
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/" element={<p>Início</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

afterEach(() => vi.unstubAllGlobals())

describe('LoginPage com verificação em dois passos', () => {
  it('pede o código depois da palavra-passe e só entra com o código certo', async () => {
    const calls = fakeServer()
    const user = userEvent.setup()
    const client = renderLogin()

    await user.type(screen.getByLabelText('Email'), 'ana@andaime.test')
    await user.type(screen.getByLabelText('Palavra-passe'), 'uma-palavra-passe-longa')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Verificação em dois passos' })).toBeInTheDocument()
    // O pedido do segundo passo não é tratado como sessão iniciada.
    expect(client.getQueryData(['me'])).toBeUndefined()

    await user.type(screen.getByLabelText('Código'), '654321')
    await user.click(screen.getByRole('button', { name: 'Verificar e entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido ou já usado')

    await user.type(screen.getByLabelText('Código'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verificar e entrar' }))
    expect(await screen.findByText('Início')).toBeInTheDocument()
    expect(client.getQueryData(['me'])).toEqual(ME)
    expect(calls.filter((c) => c.path === '/auth/login/2fa').map((c) => c.body)).toEqual([{ code: '654321' }, { code: '123456' }])
  })

  it('permite usar um código de recuperação', async () => {
    const calls = fakeServer()
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'ana@andaime.test')
    await user.type(screen.getByLabelText('Palavra-passe'), 'uma-palavra-passe-longa')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    await user.click(await screen.findByRole('button', { name: 'Usar código de recuperação' }))

    await user.type(screen.getByLabelText('Código de recuperação'), 'abcd-efgh-jkmn')
    await user.click(screen.getByRole('button', { name: 'Verificar e entrar' }))
    await screen.findByRole('alert')
    expect(calls.at(-1)).toEqual({ path: '/auth/login/2fa', body: { recoveryCode: 'abcd-efgh-jkmn' } })
  })
})
