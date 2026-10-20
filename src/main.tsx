import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SaasApp } from './saas/SaasApp'
import './styles/index.css'

// O protótipo com dados fictícios foi retirado em F6: remove as chaves locais que possa ter deixado neste navegador.
try {
  localStorage.removeItem('andaime:demo')
  localStorage.removeItem('andaime:guardar-localmente')
} catch {
  // armazenamento bloqueado: nada a limpar
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SaasApp />
  </StrictMode>,
)
