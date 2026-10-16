import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { App } from './app/App'
import { demoStore } from './store/store'

// Só em desenvolvimento e nos testes E2E: acesso à store para inspeção.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
  ;(window as unknown as { __andaime: typeof demoStore }).__andaime = demoStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
