import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Com globals: false a Testing Library não regista a limpeza sozinha: desmonta cada render no fim do teste.
afterEach(() => cleanup())
