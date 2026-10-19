import { expect, test } from '@playwright/test'
import { asRole, go, open, state } from './helpers'

test('fluxo 10: marcar o hotel de quem está em Munique reflete-se na ficha e na app do trabalhador', async ({ page }) => {
  await open(page, '/')
  // Um trabalhador escalado em Munique sem estadia marcada: usa-se a persona da app para ver o efeito lá.
  const wid = await state<string>(page, "(s) => { const ws = s.session.today; const a = Object.values(s.db.assignments).find((x) => x.siteId === 's8'); return a.workerId }")
  await page.evaluate((id) => {
    const st = (window as unknown as { __andaime: { getState: () => { setPersona: (r: string, id: string) => void; db: { stays: Record<string, { workerId: string }> }; removeStay: (id: string) => void } } }).__andaime.getState()
    for (const s of Object.values(st.db.stays)) if (s.workerId === id) st.removeStay((s as unknown as { id: string }).id)
    st.setPersona('trabalhador', id)
  }, wid)
  const name = await state<string>(page, `(s) => s.db.workers['${wid}'].name`)
  await go(page, '/dormidas')
  const line = page.locator('li', { hasText: name }).filter({ hasText: 'OB-26-002' })
  await line.getByLabel('Hotel').selectOption({ label: 'Pension Isarblick' })
  await line.getByRole('button', { name: 'Marcar' }).click()
  await expect(page.getByText('Estadia marcada')).toBeVisible()
  await go(page, `/trabalhadores/${wid}?tab=alojamento`)
  await expect(page.getByRole('cell', { name: 'Pension Isarblick' })).toBeVisible()
  await asRole(page, 'trabalhador', '/app')
  await expect(page.getByRole('region', { name: 'Onde durmo esta semana' })).toContainText('Pension Isarblick')
})
