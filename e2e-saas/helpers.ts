import { expect, type Page } from '@playwright/test'

export const MAILPIT = process.env.ANDAIME_MAILPIT_URL ?? 'http://localhost:58035'
export const run = Date.now().toString(36)
export const PASSWORD = `E2E-local-${run}-palavra`

export async function verificationLink(page: Page, to: string): Promise<string> {
  let token: string | undefined
  await expect
    .poll(async () => {
      const search = await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
      const { messages } = (await search.json()) as { messages: { ID: string }[] }
      for (const { ID } of messages) {
        const { Text } = (await (await page.request.get(`${MAILPIT}/api/v1/message/${ID}`)).json()) as { Text: string }
        token = /verificar-email\?token=([A-Za-z0-9_-]{20,})/.exec(Text)?.[1]
        if (token) return token
      }
      return undefined
    }, { timeout: 30_000, intervals: [250, 500, 1_000] })
    .toBeTruthy()
  return token!
}

/** Gestor com empresa nova, a partir do registo real. Devolve o id da empresa. */
export async function managerWithCompany(page: Page, prefix: string, company: string): Promise<string> {
  const email = `${prefix}-${run}@andaime.test`
  await page.goto('/registar')
  await page.getByLabel('Nome').fill('Gestora E2E')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Palavra-passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.goto(`/verificar-email?token=${await verificationLink(page, email)}`)
  await expect(page.getByText('Email confirmado')).toBeVisible()
  await page.goto('/entrar')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Palavra-passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByLabel('Nome da empresa').fill(company)
  await page.getByRole('button', { name: 'Criar empresa' }).click()
  await expect(page.getByRole('heading', { name: 'Olá, Gestora' })).toBeVisible()
  const me = (await (await page.request.get('/api/me')).json()) as { activeOrgId: string | null; memberships: { orgId: string }[] }
  return me.activeOrgId ?? me.memberships[0]!.orgId
}

/** Chamada à API real com a sessão e o token CSRF do navegador (para preparar dados depressa). */
export async function apiPost<T>(page: Page, path: string, body: unknown): Promise<T> {
  const cookies = await page.context().cookies()
  const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN')?.value ?? ''
  const response = await page.request.post(`/api${path}`, { data: body, headers: { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } })
  expect(response.ok(), `${path}: ${response.status()} ${await response.text()}`).toBeTruthy()
  return (await response.json()) as T
}

/** Último link com token enviado para um endereço (Mailpit), ex.: '/convite' ou '/verificar-email'. */
export async function linkFromMail(page: Page, to: string, path: string): Promise<string> {
  let token: string | undefined
  await expect
    .poll(async () => {
      const search = await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
      const { messages } = (await search.json()) as { messages: { ID: string }[] }
      for (const { ID } of messages) {
        const { Text } = (await (await page.request.get(`${MAILPIT}/api/v1/message/${ID}`)).json()) as { Text: string }
        token = new RegExp(`${path}[?/](?:token=)?([A-Za-z0-9_-]{20,})`).exec(Text)?.[1]
        if (token) return token
      }
      return undefined
    }, { timeout: 30_000, intervals: [250, 500, 1_000] })
    .toBeTruthy()
  return token!
}

/** Conta nova que aceita um convite e entra (noutro contexto do navegador). */
export async function acceptInvitation(page: Page, name: string, email: string) {
  await page.goto('/registar')
  await page.getByLabel('Nome').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Palavra-passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.goto(`/verificar-email?token=${await linkFromMail(page, email, '/verificar-email')}`)
  await expect(page.getByText('Email confirmado')).toBeVisible()
  await page.goto(`/convite/${await linkFromMail(page, email, '/convite')}`)
  await page.getByRole('link', { name: 'Entrar para aceitar' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Palavra-passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByRole('button', { name: 'Aceitar convite' }).click()
}

export async function apiPut<T>(page: Page, path: string, body: unknown): Promise<T> {
  const cookies = await page.context().cookies()
  const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN')?.value ?? ''
  const response = await page.request.put(`/api${path}`, { data: body, headers: { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } })
  expect(response.ok(), `${path}: ${response.status()} ${await response.text()}`).toBeTruthy()
  return (await response.json()) as T
}
