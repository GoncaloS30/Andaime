import ExcelJS from 'exceljs'
import { expect, test } from '@playwright/test'
import { act, asRole, go, nextMonday, open, personaName, state } from './helpers'

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (err) => {
    throw err
  })
})

test('Fluxo 1 — criar obra atualiza dashboard e planeamento', async ({ page }) => {
  await open(page, '/')
  const today = await state<string>(page, '(s) => s.session.today')
  const before = await state<number>(page, "(s) => Object.values(s.db.sites).filter((x) => x.status === 'em_curso').length")
  await go(page, '/obras/nova')
  await page.getByLabel('Nome da obra').fill('Armazém E2E')
  await page.getByLabel('Nome do cliente').fill('Cliente E2E, Lda.')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Início').fill(today)
  await page.getByLabel('Limite de horas').fill('2500')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('radio', { name: /Algarve/ }).check()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Criar obra' }).click()
  await expect(page.getByRole('heading', { name: 'Armazém E2E' })).toBeVisible()
  const siteId = await state<string>(page, "(s) => Object.values(s.db.sites).find((x) => x.name === 'Armazém E2E').id")
  expect(await state<number>(page, `(s) => Object.values(s.db.assignments).filter((a) => a.siteId === '${siteId}').length`)).toBeGreaterThan(0)
  await go(page, '/')
  await expect(page.getByRole('link', { name: /Obras em curso/ })).toContainText(String(before + 1))
})

test('Fluxo 2 — criar escala com verificação de conflitos', async ({ page }) => {
  await open(page, '/')
  const mon = await nextMonday(page)
  const before = await state<number>(page, '(s) => Object.keys(s.db.assignments).length')
  await go(page, `/planeamento?semana=${mon}&nova=escala`)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: /Cofragem Norte/ }).check()
  await dialog.getByRole('button', { name: 'Continuar' }).click()
  await dialog.getByRole('button', { name: 'Continuar' }).click()
  await dialog.getByRole('button', { name: 'Continuar' }).click()
  await expect(dialog.getByText(/conflitos? encontrados?|Sem conflitos/)).toBeVisible()
  await dialog.getByRole('button', { name: /Guardar/ }).click()
  await expect(page.getByText('Escala guardada')).toBeVisible()
  expect(await state<number>(page, '(s) => Object.keys(s.db.assignments).length')).toBeGreaterThan(before)
})

test('Fluxo 3 — transferir trabalhador', async ({ page }) => {
  await open(page, '/')
  const wid = await state<string>(page, '(s) => s.db.teams.t1.memberIds[3]')
  const mon = await nextMonday(page)
  await go(page, `/trabalhadores/${wid}`)
  await page.getByRole('button', { name: 'Transferir', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nova obra').selectOption('s3')
  await dialog.getByRole('button', { name: /Confirmar transferência|Transferir com/ }).click()
  await expect(page.getByText(/transferido para OB-25-012/)).toBeVisible()
  expect(await state<boolean>(page, `(s) => Object.values(s.db.assignments).some((a) => a.workerId === '${wid}' && a.siteId === 's3' && a.date === '${mon}')`)).toBe(true)
  await page.getByRole('tab', { name: 'Histórico' }).click()
  await expect(page.getByText(/transferiu .* para OB-25-012/i).first()).toBeVisible()
})

test('Fluxo 4 — viatura com conflito e alternativa', async ({ page }) => {
  await open(page, '/viaturas')
  await page.getByRole('button', { name: 'Atribuir viatura' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Viatura').selectOption('v2')
  await dialog.getByLabel('Equipa').selectOption('t4')
  await expect(dialog.getByText(/Esta atribuição cria/)).toBeVisible()
  await dialog.getByRole('button', { name: /Usar esta/ }).first().click()
  await expect(page.getByText(/atribuída a Algarve/)).toBeVisible()
  const v = await state<string>(page, '(s) => s.db.teams.t4.vehicleId')
  expect(['v2', 'v4']).not.toContain(v)
})

test('Fluxo 5 — ponto, revisão e aprovação atualizam a obra', async ({ page }) => {
  await open(page, '/')
  const name = await personaName(page)
  const approvedBefore = await state<number>(page, "(s) => Object.values(s.db.entries).filter((e) => e.siteId === 's1' && e.status === 'aprovado').length")
  await asRole(page, 'trabalhador', '/app')
  await page.getByRole('button', { name: 'Registar entrada' }).click()
  await page.getByRole('button', { name: 'Registar saída' }).click()
  await expect(page.getByText(/Dia registado/)).toBeVisible()
  await asRole(page, 'encarregado', '/encarregado/horas')
  await page.locator('li', { hasText: name }).getByRole('button', { name: 'Validar' }).first().click()
  await expect(page.getByText(/registos? revistos/)).toBeVisible()
  await asRole(page, 'gestor', '/horas')
  await page.locator('li', { hasText: name }).getByRole('button', { name: 'Aprovar' }).first().click()
  await expect(page.getByText(/registos? aprovados/)).toBeVisible()
  const today = await state<string>(page, '(s) => s.session.today')
  expect(await state<string>(page, `(s) => Object.values(s.db.entries).find((e) => e.workerId === s.session.personas.trabalhador && e.date === '${today}').status`)).toBe('aprovado')
  expect(await state<number>(page, "(s) => Object.values(s.db.entries).filter((e) => e.siteId === 's1' && e.status === 'aprovado').length")).toBeGreaterThan(approvedBefore)
})

test('Fluxo 6 — pedido de ausência aprovado cria conflito no planeamento', async ({ page }) => {
  await open(page, '/')
  const name = await personaName(page)
  const mon = await nextMonday(page)
  await asRole(page, 'trabalhador', '/app/ausencias')
  await page.getByRole('button', { name: 'Enviar pedido' }).click()
  await expect(page.getByText('Pedido enviado')).toBeVisible()
  await asRole(page, 'gestor', '/ausencias')
  await page.locator('article', { hasText: name }).getByRole('button', { name: 'Aprovar' }).click()
  await go(page, `/planeamento?semana=${mon}&painel=conflitos`)
  await expect(page.getByText(`${name} tem férias e trabalho atribuído`)).toBeVisible()
})

test('Fluxo 7 — entrega de equipamento com tamanho da ficha', async ({ page }) => {
  await open(page, '/')
  const wid = await state<string>(page, '(s) => s.session.personas.trabalhador')
  await go(page, `/trabalhadores/${wid}?tab=fardamento`)
  const rows = page.locator('tr', { hasText: 'Parka impermeável' })
  // Contar só depois de o separador estar desenhado (sob carga, contava 0 linhas).
  await expect(page.getByRole('button', { name: 'Registar entrega' }).first()).toBeVisible()
  await expect(page.getByRole('tabpanel')).toBeVisible()
  const before = await rows.count()
  await page.getByRole('button', { name: 'Registar entrega' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Artigo').selectOption('eq-parka')
  await dialog.getByRole('button', { name: 'Registar entrega' }).click()
  await expect(page.getByText(/Entrega registada/)).toBeVisible()
  await expect(rows).toHaveCount(before + 1)
  await page.getByRole('tab', { name: 'Histórico' }).click()
  await expect(page.getByText(/entregou Parka impermeável/i).first()).toBeVisible()
})

test('Fluxo 8 — mapa semanal exportado para Excel', async ({ page }) => {
  await open(page, '/mapas')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar Excel' }).click()])
  expect(download.suggestedFilename()).toMatch(/^Mapa por equipa - Semana \d+\.xlsx$/)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile((await download.path())!)
  const ws = wb.worksheets[0]!
  expect(String(ws.getCell(1, 1).value)).toContain('Mapa de trabalhos')
  expect(ws.rowCount).toBeGreaterThan(10)
})

test('Fluxo 9 — documento renovado tira o alerta do dashboard', async ({ page }) => {
  await open(page, '/')
  const kpi = page.getByRole('link', { name: /Documentos a tratar/ })
  const read = async () => Number(await kpi.locator('.font-expanded').textContent())
  await page.waitForTimeout(400)
  const before = await read()
  await go(page, '/documentos')
  await page.locator('tr', { hasText: 'Certificado A1' }).filter({ hasText: 'A expirar' }).first().getByRole('button', { name: 'Atualizar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar nova versão' }).click()
  await expect(page.getByText(/A1 de .* atualizado/)).toBeVisible()
  await go(page, '/')
  await page.waitForTimeout(500)
  expect(await read()).toBe(before - 1)
})

test('Modo apresentação: todos os passos correm sem erros', async ({ page }) => {
  test.setTimeout(240_000)
  await open(page, '/')
  await page.getByRole('button', { name: 'Apresentar' }).click()
  const guide = page.getByRole('complementary', { name: 'Guião de apresentação' })
  const chapters = await guide.locator('nav > div > button').count()
  for (let c = 0; c < chapters; c++) {
    const header = guide.locator('nav > div > button').nth(c)
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
    const steps = guide.locator('nav > div').nth(c).locator('ol button')
    const n = await steps.count()
    for (let i = 0; i < n; i++) {
      await steps.nth(i).click()
      await page.waitForTimeout(350)
      await expect(page.getByText('Não foi possível preparar este passo.')).toHaveCount(0)
    }
  }
  await act(page, '(s) => s')
})

test('Planeamento: arrastar a pega altera o período', async ({ page }) => {
  await open(page, '/')
  const mon = await nextMonday(page)
  const wid = await state<string>(page, '(s) => s.db.teams.t2.memberIds[2]')
  const aid = await state<string>(page, `(s) => Object.values(s.db.assignments).find((a) => a.workerId === '${wid}' && a.date === '${mon}').id`)
  const wed = await state<string>(page, `() => { const d = new Date('${mon}T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10) }`)
  await go(page, `/planeamento?semana=${mon}&equipa=t2`)
  const chip = page.locator(`[data-assignment="${aid}"]`)
  await chip.hover()
  const handle = page.locator(`[data-resize="${aid}"]`)
  const from = (await handle.boundingBox())!
  const to = (await page.locator(`[data-cell="wd:${wid}:${wed}"]`).boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + ((to.x + to.width / 2 - from.x) * i) / 12, to.y + to.height / 2)
  await page.mouse.up()
  await expect(page.getByText(/Período de .* a /)).toBeVisible()
  const days = await state<string[]>(page, `(s) => Object.values(s.db.assignments).filter((a) => a.workerId === '${wid}' && a.siteId === 's2' && a.date >= '${mon}' && a.date <= '${mon}'.replace(/..$/, (x) => String(Number(x) + 6).padStart(2, '0'))).map((a) => a.date).sort()`)
  expect(days).toHaveLength(3)
})

test('Planeamento: arrastar um bloco para outro trabalhador move a atribuição', async ({ page }) => {
  await open(page, '/')
  const mon = await nextMonday(page)
  const [a, b] = await state<string[]>(page, '(s) => [s.db.teams.t2.memberIds[2], s.db.teams.t2.memberIds[4]]')
  const aid = await state<string>(page, `(s) => Object.values(s.db.assignments).find((x) => x.workerId === '${a}' && x.date === '${mon}').id`)
  await go(page, `/planeamento?semana=${mon}&equipa=t2`)
  const from = (await page.locator(`[data-assignment="${aid}"]`).boundingBox())!
  const to = (await page.locator(`[data-cell="wd:${b}:${mon}"]`).boundingBox())!
  await page.mouse.move(from.x + 20, from.y + from.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + 20 + ((to.x + 30 - from.x - 20) * i) / 12, from.y + ((to.y + to.height / 2 - from.y) * i) / 12)
  await page.mouse.up()
  await expect(page.getByText(/Movido para/)).toBeVisible()
  expect(await state<string>(page, `(s) => s.db.assignments['${aid}'].workerId`)).toBe(b)
  // Duas atribuições no mesmo dia, mesmo horário: o Andaime avisa da sobreposição
  await expect(page.getByText(/Criou (um conflito|\d+ conflitos)/)).toBeVisible()
})
