import { expect, test } from '@playwright/test'
import { go, open, state } from './helpers'

test('fluxo 12: férias aprovadas aparecem no mapa do ano e na agenda; o Google sincroniza sem duplicar', async ({ page }) => {
  await open(page, '/')
  // Pedido de férias em novembro, feito pelo trabalhador (persona da app)
  const id = await page.evaluate(() => {
    const st = (window as unknown as { __andaime: { getState: () => { requestAbsence: (i: object) => string } } }).__andaime.getState()
    return st.requestAbsence({ type: 'ferias', start: '2026-11-16', end: '2026-11-20', reason: 'Férias de novembro' })
  })
  const name = await state<string>(page, '(s) => s.db.workers[s.session.personas.trabalhador].name')
  await go(page, `/ausencias?id=${id}`)
  await page.getByRole('article', { name: `Pedido de ${name}` }).filter({ hasText: 'Férias de novembro' }).getByRole('button', { name: 'Aprovar' }).click()

  await go(page, '/ausencias?vista=ano')
  await expect(page.getByRole('button', { name: /Férias de 16 nov a 20 nov, aprovad/ })).toBeVisible()

  await go(page, '/agenda?mes=2026-11')
  await expect(page.getByRole('button', { name: new RegExp(`${name} · Férias`) }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Ligar conta Google' }).click()
  await page.getByRole('button', { name: 'Sincronizar férias' }).click()
  await expect(page.getByText('Férias sincronizadas com o Google')).toBeVisible()
  const synced = await state<number>(page, `(s) => Object.values(s.db.events).filter((e) => e.syncKey === 'ferias:${id}').length`)
  expect(synced).toBe(1)
  await page.getByRole('button', { name: 'Sincronizar férias' }).click()
  expect(await state<number>(page, `(s) => Object.values(s.db.events).filter((e) => e.syncKey === 'ferias:${id}').length`)).toBe(1)
})
