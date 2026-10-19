import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'

/**
 * Duas aplicações, nunca misturadas:
 * - por omissão (desenvolvimento e produção), o Andaime real ligado à API;
 * - nos modos `e2e` e `prototipo`, o protótipo antigo com dados fictícios locais, usado só pelos
 *   testes E2E dos módulos ainda não migrados. Este código não entra no build de produção.
 */
const PROTOTYPE = import.meta.env.MODE === 'e2e' || import.meta.env.MODE === 'prototipo'

async function load(): Promise<ComponentType> {
  if (PROTOTYPE) {
    const [{ App }, { demoStore }] = await Promise.all([import('./app/App'), import('./store/store')])
    ;(window as unknown as { __andaime: typeof demoStore }).__andaime = demoStore
    return App
  }
  // Limpa os dados fictícios que uma versão anterior do protótipo tenha deixado neste navegador.
  try {
    localStorage.removeItem('andaime:demo')
    localStorage.removeItem('andaime:guardar-localmente')
  } catch {
    // armazenamento bloqueado: nada a limpar
  }
  return (await import('./saas/SaasApp')).SaasApp
}

void load().then((Root) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  ),
)
