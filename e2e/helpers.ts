import { expect, type Page } from '@playwright/test'

/** Lê o estado da demonstração (só exposto no build e2e). */
export async function state<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((src) => {
    const s = (window as unknown as { __andaime: { getState: () => unknown } }).__andaime.getState()
    return new Function('s', `return (${src})(s)`)(s)
  }, fn) as Promise<T>
}

/** Executa uma ação da store (só para preparar papéis; os fluxos usam a interface). */
export async function act(page: Page, fn: string): Promise<void> {
  await page.evaluate((src) => {
    const s = (window as unknown as { __andaime: { getState: () => unknown } }).__andaime.getState()
    new Function('s', `return (${src})(s)`)(s)
  }, fn)
}

/** Primeira abertura (cada teste corre num contexto novo: sem dados guardados). */
export async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.locator('#root')).not.toBeEmpty()
  await page.waitForFunction(() => !!(window as unknown as { __andaime?: unknown }).__andaime)
}

/** Navegação dentro da SPA, sem recarregar (o estado em memória mantém-se). */
export async function go(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState({}, '', p)
    dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await page.waitForTimeout(150)
}

export async function asRole(page: Page, role: 'gestor' | 'encarregado' | 'trabalhador', path: string) {
  await act(page, `(s) => s.setRole('${role}')`)
  await go(page, path)
}

export const personaName = (page: Page) => state<string>(page, '(s) => s.db.workers[s.session.personas.trabalhador].name')
export const nextMonday = (page: Page) =>
  state<string>(
    page,
    `(s) => { const d = new Date(s.session.today + 'T00:00:00Z'); const wd = d.getUTCDay(); d.setUTCDate(d.getUTCDate() + (wd === 0 ? 1 : 8 - wd)); return d.toISOString().slice(0, 10) }`,
  )
