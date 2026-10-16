import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Photo } from './Photo'

const banco = { kind: 'banco' as const, src: 'obras/s1', credit: 'c', alt: 'Obra Edifício Atlântida', w: 1280, h: 720 }

describe('<Photo>', () => {
  it('foto de banco com srcset, lazy, medidas e tratamento de cor', () => {
    render(<Photo photo={banco} format="capa" sizes="320px" fallback={<span>sem foto</span>} />)
    const img = screen.getByRole('img', { name: 'Obra Edifício Atlântida' })
    expect(img).toHaveAttribute('srcset', '/fotos/obras/s1-s.webp 320w, /fotos/obras/s1-m.webp 1280w')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('width', '1280')
    expect(img.parentElement).toHaveClass('photo-grade')
  })
  it('sem foto mostra a alternativa', () => {
    render(<Photo photo={undefined} format="retrato" fallback={<span>AB</span>} />)
    expect(screen.getByText('AB')).toBeInTheDocument()
  })
  it('se a imagem falhar, volta à alternativa', () => {
    render(<Photo photo={banco} format="capa" fallback={<span>sem foto</span>} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('sem foto')).toBeInTheDocument()
  })
  it('alt vazio torna a foto decorativa', () => {
    const { container } = render(<Photo photo={banco} format="capa" alt="" fallback={null} />)
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })
})
