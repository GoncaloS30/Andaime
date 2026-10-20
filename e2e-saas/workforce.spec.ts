import { expect, test, type Page } from '@playwright/test'

const MAILPIT = process.env.ANDAIME_MAILPIT_URL ?? 'http://localhost:58035'
const run = Date.now().toString(36)
const PASSWORD = `E2E-local-${run}-palavra`

async function verificationLink(page: Page, to: string): Promise<string> {
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
    })
    .toBeTruthy()
  return token!
}

/** Gestor com empresa nova, a partir do registo real. */
async function managerWithCompany(page: Page, company: string) {
  const email = `gestora-f2-${run}@andaime.test`
  await page.goto('/registar')
  await page.getByLabel('Nome').fill('Gestora F2')
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
}

test('registar trabalhadores, formar uma equipa e criar uma obra com encarregado', async ({ page }) => {
  await managerWithCompany(page, `Obras F2 ${run}`)

  // Trabalhadores (número automático).
  for (const [name, category] of [
    ['Rui Encarregado', 'Encarregado'],
    ['Ana Pedreira', 'Pedreiro'],
  ]) {
    await page.goto('/trabalhadores')
    await page.getByRole('button', { name: 'Novo trabalhador' }).click()
    const drawer = page.getByRole('dialog')
    await drawer.getByLabel('Nome completo').fill(name!)
    await drawer.getByLabel('Categoria').selectOption(category!)
    await drawer.getByRole('button', { name: 'Registar trabalhador' }).click()
    await expect(page.getByRole('heading', { name: name! })).toBeVisible()
  }
  // Fotografia (ficha da Ana, a última criada): guardada no armazenamento e servida pela API.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
  await page.locator('input[type=file]').setInputFiles({ name: 'ana.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('button', { name: 'Mudar fotografia de Ana Pedreira' })).toBeVisible()
  const photo = page.locator('header img').first()
  await expect(photo).toHaveAttribute('src', /\/employees\/.+\/photo\?v=/)
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1)
  await page.goto('/trabalhadores')
  await expect(page.getByRole('link', { name: /Ana Pedreira/ })).toBeVisible()
  await expect(page.getByText('N.º 2')).toBeVisible()

  // Equipa com responsável e dois elementos a partir de hoje.
  await page.goto('/equipas')
  await page.getByRole('button', { name: 'Nova equipa' }).click()
  await page.getByRole('dialog').getByLabel('Nome').fill('Estrutura E2E')
  await page.getByRole('dialog').getByLabel('Responsável').selectOption({ label: 'Rui Encarregado · Encarregado' })
  await page.getByRole('dialog').getByRole('button', { name: 'Criar equipa' }).click()
  await expect(page.getByRole('heading', { name: /Estrutura E2E/ })).toBeVisible()
  for (const name of ['Rui Encarregado', 'Ana Pedreira']) {
    await page.getByRole('button', { name: 'Juntar trabalhador' }).click()
    await page.getByRole('dialog').getByLabel('Trabalhador').selectOption({ label: `${name} · ${name.startsWith('Rui') ? 'Encarregado' : 'Pedreiro'}` })
    await page.getByRole('dialog').getByRole('button', { name: 'Juntar' }).click()
    await expect(page.getByRole('link', { name })).toBeVisible()
  }
  await expect(page.getByText('2 elementos')).toBeVisible()

  // Obra com encarregado, limite e histórico importado.
  await page.goto('/obras/nova')
  await page.getByLabel('Nome da obra').fill('Edifício E2E')
  await page.getByLabel('Encarregado').selectOption({ label: 'Rui Encarregado · Encarregado' })
  await page.getByLabel('Limite de horas').fill('1000')
  await page.getByLabel('Horas já realizadas antes do Andaime').fill('900')
  await page.getByRole('button', { name: 'Criar obra' }).click()
  await expect(page.getByRole('heading', { name: 'Edifício E2E' })).toBeVisible()
  await expect(page.getByText('Atenção · 90 %')).toBeVisible()
  await expect(page.getByText('Inclui só as horas importadas')).toHaveCount(0)

  // Persistido no servidor: aparece após recarregar e o percurso em equipas da trabalhadora tem a equipa.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Edifício E2E' })).toBeVisible()
  await page.goto('/trabalhadores')
  await page.getByRole('link', { name: /Ana Pedreira/ }).click()
  await page.getByRole('tab', { name: 'Equipas' }).click()
  await expect(page.getByRole('tabpanel').getByText('Estrutura E2E')).toBeVisible()
  await page.getByRole('tab', { name: 'Histórico' }).click()
  await expect(page.getByText('Registou o trabalhador')).toBeVisible()
})
