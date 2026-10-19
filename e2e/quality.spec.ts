import { expect, test } from '@playwright/test'
import { asRole, go, open } from './helpers'

/** Quality gate: capturas em 5 larguras, overflow, landmarks, foco, movimento reduzido. Corre com --grep @quality. */
const WIDTHS = [1440, 1024, 768, 390, 360]
const PAGES: { path: string; role: 'gestor' | 'encarregado' | 'trabalhador'; name: string }[] = [
  { path: '/', role: 'gestor', name: 'dashboard' },
  { path: '/planeamento?painel=conflitos', role: 'gestor', name: 'planeamento' },
  { path: '/obras/s8?tab=horas', role: 'gestor', name: 'obra-horas' },
  { path: '/horas', role: 'gestor', name: 'horas' },
  { path: '/mapas', role: 'gestor', name: 'mapas' },
  { path: '/encarregado', role: 'encarregado', name: 'encarregado' },
  { path: '/app', role: 'trabalhador', name: 'app-trabalhador' },
  // Ecrãs com fotos (bloco 1)
  { path: '/obras', role: 'gestor', name: 'obras' },
  { path: '/trabalhadores/w-0001', role: 'gestor', name: 'trabalhador' },
  { path: '/viaturas/v11', role: 'gestor', name: 'viatura' },
  { path: '/equipas', role: 'gestor', name: 'equipas' },
  // V3.1
  { path: '/obras/s1?tab=diario', role: 'gestor', name: 'diario' },
  { path: '/dormidas', role: 'gestor', name: 'dormidas' },
  { path: '/agenda', role: 'gestor', name: 'agenda' },
  { path: '/horas?vista=grelha', role: 'gestor', name: 'horas-grelha' },
  { path: '/definicoes', role: 'gestor', name: 'definicoes' },
]

test.describe('@quality', () => {
  test('capturas, overflow e conteúdo cortado em 5 larguras', async ({ page }) => {
    test.setTimeout(480_000)
    const problems: string[] = []
    await open(page, '/')
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: w >= 1024 ? 900 : 844 })
      for (const p of PAGES) {
        await asRole(page, p.role, p.path)
        await page.waitForTimeout(600)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        if (overflow > 1) problems.push(`${p.name}@${w}: overflow horizontal de ${overflow}px`)
        // Texto cortado: elementos com texto cuja largura de conteúdo excede a caixa sem truncar de propósito
        const clipped = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('main h1, main h2, main button, header button')]
            .filter((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== 'ellipsis' && getComputedStyle(el).overflow !== 'visible')
            .slice(0, 3)
            .map((el) => el.textContent?.trim().slice(0, 30)),
        )
        if (clipped.length) problems.push(`${p.name}@${w}: texto cortado em ${clipped.join(' | ')}`)
        await page.screenshot({ path: `docs/review/screens/${p.name}-${w}.png`, fullPage: false })
      }
    }
    expect(problems).toEqual([])
  })

  test('landmarks, um h1 por página e imagens com alt', async ({ page }) => {
    await open(page, '/')
    for (const p of ['/', '/planeamento', '/trabalhadores', '/obras/s1', '/relatorios']) {
      await go(page, p)
      await page.waitForTimeout(400)
      expect(await page.locator('main').count(), p).toBe(1)
      expect(await page.locator('nav').count(), p).toBeGreaterThan(0)
      expect(await page.locator('main h1').count(), p).toBe(1)
      expect(await page.locator('img:not([alt])').count(), p).toBe(0)
    }
  })

  test('teclado: saltar para o conteúdo e foco visível', async ({ page }) => {
    await open(page, '/')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Saltar para o conteúdo' })).toBeFocused()
    await page.keyboard.press('Enter')
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab')
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const cs = getComputedStyle(el)
      return { tag: el.tagName, outline: cs.outlineStyle, width: cs.outlineWidth }
    })
    expect(outline.outline).not.toBe('none')
  })

  test('formulário: erros de validação aparecem e são anunciados', async ({ page }) => {
    await open(page, '/obras/nova')
    await page.getByLabel('Nome da obra').fill('X')
    await page.getByLabel('Nome do cliente').fill('Cliente X')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByLabel('Fim previsto').fill('2020-01-01')
    await expect(page.getByRole('alert').filter({ hasText: 'O fim tem de ser depois do início.' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  })

  test('prefers-reduced-motion desliga as animações', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '/')
    await page.getByRole('button', { name: 'Apresentar' }).click()
    // O guião é carregado a pedido: espera que exista antes de ler o estilo.
    await expect(page.locator('aside[aria-label="Guião de apresentação"]')).toBeVisible()
    const dur = await page.evaluate(() => getComputedStyle(document.querySelector('aside[aria-label="Guião de apresentação"]')!).animationDuration)
    expect(['0.001s', '1e-06s', '0s']).toContain(dur)
  })

  test('JavaScript lento: estado de carregamento aparece antes do módulo', async ({ page }) => {
    await page.route('**/assets/PlanningPage-*.js', async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })
    await open(page, '/')
    await go(page, '/planeamento')
    await expect(page.getByRole('status', { name: 'A carregar' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Planeamento' })).toBeVisible({ timeout: 15_000 })
  })
})
