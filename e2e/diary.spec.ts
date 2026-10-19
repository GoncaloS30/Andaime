import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import JSZip from 'jszip'
import { asRole, go, open, state } from './helpers'

test('fluxo 11: o encarregado regista o dia com 2 fotos; a obra mostra-o e o Word leva as fotos', async ({ page }) => {
  await open(page, '/')
  await asRole(page, 'encarregado', '/encarregado/diario')
  await page.getByRole('button', { name: 'Novo registo' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Novo registo no diário' })
  await dialog.getByLabel('Título').fill('Betonagem do piso 3')
  await dialog.getByLabel('O que se fez').fill('Laje betonada.\nSem incidentes.')
  await dialog.getByLabel('Tirar ou escolher fotos').setInputFiles(['e2e/fixtures/retrato.jpg', 'e2e/fixtures/retrato.jpg'])
  await expect(dialog.getByText('2 de 20 fotos')).toBeVisible()
  await dialog.getByRole('button', { name: 'Guardar registo' }).click()
  await expect(page.getByText('Registo guardado no diário')).toBeVisible()

  const siteId = await state<string>(page, "(s) => Object.values(s.db.diary).find((e) => e.title === 'Betonagem do piso 3').siteId")
  await asRole(page, 'gestor', `/obras/${siteId}?tab=diario`)
  await page.getByLabel('Procurar no diário').fill('betonagem do piso 3')
  const entry = page.locator('article', { hasText: 'Betonagem do piso 3' })
  await expect(entry).toBeVisible()
  await entry.getByRole('button', { name: /Ver foto 2/ }).click()
  await expect(page.getByRole('dialog', { name: 'Betonagem do piso 3' })).toContainText('Foto 2 de 2')
  await page.keyboard.press('Escape')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Word' }).click()
  const file = await (await download).path()
  const zip = await JSZip.loadAsync(await readFile(file))
  const doc = await zip.file('word/document.xml')!.async('string')
  expect(doc).toContain('Betonagem do piso 3')
  expect(doc.match(/<wp:inline/g)).toHaveLength(2)
  await go(page, '/')
  await expect(page.getByRole('link', { name: /Betonagem do piso 3/ })).toBeVisible()
})
