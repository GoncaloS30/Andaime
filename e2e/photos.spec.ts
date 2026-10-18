import { expect, test } from '@playwright/test'
import { go, open, state } from './helpers'

test('fluxo 15: carregar a foto de um trabalhador reflete-se no planeamento e persiste', async ({ page }) => {
  await open(page, '/')
  const wid = await state<string>(page, '(s) => Object.values(s.db.workers)[0].id')
  await go(page, `/trabalhadores/${wid}`)
  await page.getByLabel('Alterar foto').setInputFiles('e2e/fixtures/retrato.jpg')
  await expect(page.getByText('Foto atualizada')).toBeVisible()
  expect(await state<string>(page, `(s) => s.db.workers['${wid}'].photo.kind`)).toBe('carregada')
  await expect(page.locator('main header img').first()).toHaveAttribute('src', /^blob:/)
  // O retrato novo também aparece no quadro de planeamento.
  await go(page, '/planeamento')
  await expect(page.locator(`[data-worker="${wid}"] img`).first()).toHaveAttribute('src', /^blob:/)
  // Persiste depois de recarregar (localStorage + IndexedDB).
  await page.reload()
  await page.waitForFunction(() => !!(window as unknown as { __andaime?: unknown }).__andaime)
  expect(await state<string>(page, `(s) => s.db.workers['${wid}'].photo.kind`)).toBe('carregada')
  await expect(page.locator(`[data-worker="${wid}"] img`).first()).toHaveAttribute('src', /^blob:/)
})

test('obras em cartões com capa e alternância para tabela', async ({ page }) => {
  await open(page, '/obras')
  await expect(page.getByRole('heading', { name: 'Edifício Atlântida' })).toBeVisible()
  await expect(page.locator('main article img').first()).toHaveAttribute('srcset', /obras\/s1-s\.webp/)
  await page.getByRole('radio', { name: 'Tabela' }).click()
  await expect(page.getByRole('table')).toBeVisible()
})

test('repor a demonstração volta às fotos de banco', async ({ page }) => {
  await open(page, '/')
  await page.evaluate(() => {
    const st = (window as unknown as { __andaime: { getState: () => { setPhoto: (t: unknown, p: unknown) => void; resetDemo: () => void } } }).__andaime.getState()
    st.setPhoto({ type: 'obra', id: 's1' }, null)
    st.resetDemo()
  })
  expect(await state<string>(page, "(s) => s.db.sites.s1.photo.kind")).toBe('banco')
})
