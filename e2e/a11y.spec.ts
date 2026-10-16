import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { asRole, go, open, state } from './helpers'

const GESTOR = ['/', '/planeamento', '/planeamento?vista=obras', '/planeamento?escala=mes', '/trabalhadores', '/equipas', '/equipas/t1', '/obras', '/obras/s1?tab=horas', '/obras/nova', '/viaturas', '/viaturas/v4', '/horas', '/ausencias', '/mapas', '/documentos', '/equipamentos', '/relatorios', '/definicoes', '/design']

const found: string[] = []

async function audit(page: import('@playwright/test').Page, label: string) {
  await page.waitForTimeout(500)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.leaflet-container')
    .analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  found.push(...serious.map((v) => `${label}: ${v.id} — ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`))
}

test('acessibilidade — gestor', async ({ page }) => {
  found.length = 0
  test.setTimeout(180_000)
  await open(page, '/')
  for (const p of GESTOR) {
    await go(page, p)
    await audit(page, p)
  }
  const wid = await state<string>(page, '(s) => s.session.personas.trabalhador')
  for (const tab of ['visao', 'horas', 'documentos', 'fardamento']) {
    await go(page, `/trabalhadores/${wid}?tab=${tab}`)
    await audit(page, `ficha ${tab}`)
  }
  expect(found).toEqual([])
})

test('acessibilidade — encarregado e trabalhador', async ({ page }) => {
  found.length = 0
  test.setTimeout(120_000)
  await open(page, '/')
  for (const p of ['/encarregado', '/encarregado/semana', '/encarregado/horas', '/encarregado/documentos', '/encarregado/problemas']) {
    await asRole(page, 'encarregado', p)
    await audit(page, p)
  }
  for (const p of ['/app', '/app/semana', '/app/ausencias', '/app/documentos', '/app/perfil']) {
    await asRole(page, 'trabalhador', p)
    await audit(page, p)
  }
  expect(found).toEqual([])
})

test('teclado: o quadro tem alternativa ao arrastar (atribuir pelo +)', async ({ page }) => {
  await open(page, '/planeamento')
  const add = page.getByRole('button', { name: /^Atribuir .* em \d{4}-\d{2}-\d{2}$/ }).first()
  await add.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Atribuir trabalho' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('@responsive sem deslocamento horizontal da página', async ({ page }) => {
  await open(page, '/')
  for (const p of ['/', '/planeamento', '/obras/s1', '/horas', '/trabalhadores']) {
    await go(page, p)
    await page.waitForTimeout(400)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, p).toBeLessThanOrEqual(1)
  }
})

test('@mobile app do trabalhador e planeamento por dia', async ({ page }) => {
  await open(page, '/')
  await go(page, '/planeamento')
  await expect(page.getByRole('tablist', { name: 'Dia' })).toBeVisible()
  await asRole(page, 'trabalhador', '/app')
  await expect(page.getByRole('button', { name: 'Registar entrada' })).toBeVisible()
  const box = await page.getByRole('button', { name: 'Registar entrada' }).boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(48)
})
