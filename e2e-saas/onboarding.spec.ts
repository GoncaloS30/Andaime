import { expect, test, type Browser, type Page } from '@playwright/test'

const MAILPIT = process.env.ANDAIME_MAILPIT_URL ?? 'http://localhost:58035'
const API = process.env.ANDAIME_API_URL ?? 'http://localhost:8088'
const run = Date.now().toString(36)
const PASSWORD = `E2E-local-${run}-palavra`

/** Último link enviado para um endereço (lido do Mailpit, o SMTP real de desenvolvimento). */
async function linkFromMail(page: Page, to: string, path: string): Promise<string> {
  let token: string | undefined
  await expect
    .poll(
      async () => {
        const search = await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
        const { messages } = (await search.json()) as { messages: { ID: string }[] }
        // Do mais recente para o mais antigo: o primeiro email com o link pedido.
        for (const { ID } of messages) {
          const message = await page.request.get(`${MAILPIT}/api/v1/message/${ID}`)
          const { Text } = (await message.json()) as { Text: string }
          token = new RegExp(`${path}[?/](?:token=)?([A-Za-z0-9_-]{20,})`).exec(Text)?.[1]
          if (token) return token
        }
        return undefined
      },
      { message: `email para ${to}` },
    )
    .toBeTruthy()
  return token!
}

async function signUpAndVerify(page: Page, name: string, email: string) {
  await page.goto('/registar')
  await page.getByLabel('Nome').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Palavra-passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await expect(page.getByRole('heading', { name: 'Confirme o seu email' })).toBeVisible()
  const token = await linkFromMail(page, email, '/verificar-email')
  await page.goto(`/verificar-email?token=${token}`)
  await expect(page.getByText('Email confirmado. Já pode entrar.')).toBeVisible()
}

async function signIn(page: Page, email: string, next = '') {
  await page.goto(`/entrar${next}`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Palavra-passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

async function newPage(browser: Browser) {
  const context = await browser.newContext()
  return context.newPage()
}

test.beforeAll(async ({ request }) => {
  const health = await request.get(`${API}/actuator/health/readiness`).catch(() => null)
  expect(health?.ok(), `API do Andaime em ${API} (arranque: docs/backend/estado.md)`).toBeTruthy()
})

test('criar empresa, convidar um encarregado e entrar com o papel certo', async ({ browser }) => {
  const ownerEmail = `dona-${run}@andaime.test`
  const foremanEmail = `encarregado-${run}@andaime.test`
  const company = `Obras E2E ${run}`

  // 1. A dona cria conta, confirma o email, entra e cria a empresa.
  const owner = await newPage(browser)
  await signUpAndVerify(owner, 'Dona E2E', ownerEmail)
  await signIn(owner, ownerEmail)
  await expect(owner.getByRole('heading', { name: 'Criar a sua empresa' })).toBeVisible()
  await owner.getByLabel('Nome da empresa').fill(company)
  await owner.getByRole('button', { name: 'Criar empresa' }).click()
  await expect(owner.getByRole('heading', { name: 'Olá, Dona' })).toBeVisible()
  await expect(owner.getByText(company).first()).toBeVisible()

  // Os módulos por ligar dizem-no, sem dados fictícios.
  await owner.goto('/dormidas')
  await expect(owner.getByText('Ainda não ligado ao servidor')).toBeVisible()

  // 2. Convida um encarregado.
  await owner.goto('/definicoes/equipa')
  await owner.getByRole('button', { name: 'Convidar' }).click()
  const dialog = owner.getByRole('dialog')
  await dialog.getByLabel('Email').fill(foremanEmail)
  await dialog.getByLabel('Papel').selectOption('FOREMAN')
  await dialog.getByRole('button', { name: 'Enviar convite' }).click()
  await expect(owner.getByText(foremanEmail, { exact: true })).toBeVisible()

  // 3. O encarregado cria conta e aceita o convite recebido por email.
  const foreman = await newPage(browser)
  await signUpAndVerify(foreman, 'João Encarregado', foremanEmail)
  const invite = await linkFromMail(foreman, foremanEmail, '/convite')
  await foreman.goto(`/convite/${invite}`)
  await expect(foreman.getByRole('heading', { name: `Convite para ${company}` })).toBeVisible()
  await foreman.getByRole('link', { name: 'Entrar para aceitar' }).click()
  await foreman.getByLabel('Email').fill(foremanEmail)
  await foreman.getByLabel('Palavra-passe').fill(PASSWORD)
  await foreman.getByRole('button', { name: 'Entrar', exact: true }).click()
  await foreman.getByRole('button', { name: 'Aceitar convite' }).click()

  // 4. Entra na experiência de encarregado; áreas de gestor não estão acessíveis.
  await expect(foreman).toHaveURL(/\/encarregado$/)
  await expect(foreman.getByRole('heading', { name: 'Hoje' })).toBeVisible()
  await foreman.goto('/planeamento')
  await expect(foreman).toHaveURL(/\/encarregado$/)
  await foreman.goto('/definicoes')
  await expect(foreman).toHaveURL(/\/definicoes\/conta$/)

  // 5. A dona vê o novo membro, que persiste no servidor (nova sessão, dados do PostgreSQL).
  await owner.reload()
  await expect(owner.getByText('João Encarregado')).toBeVisible()
  await owner.goto('/definicoes/auditoria')
  await expect(owner.getByText('Aceitou um convite')).toBeVisible()

  // 6. Sair termina a sessão.
  await owner.getByRole('button', { name: /Conta de/ }).click()
  await owner.getByRole('menuitem', { name: 'Sair' }).click()
  await expect(owner).toHaveURL(/\/entrar$/)
  await owner.goto('/definicoes')
  await expect(owner).toHaveURL(/\/entrar\?next=/)
})
