import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar, PhotoStack } from './Avatar'

const photo = '/api/orgs/o1/employees/e1/photo'

describe('Avatar', () => {
  it('com foto mostra o retrato decorativo (o nome está ao lado)', () => {
    const { container } = render(<Avatar name="Rui Fontes" photo={photo} />)
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })
  it('sem foto mostra as iniciais', () => {
    render(<Avatar name="Rui Fontes" />)
    expect(screen.getByText('RF')).toBeInTheDocument()
  })
  it('PhotoStack mostra até 4 e o resto como +N', () => {
    const people = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, name: `Pessoa ${i}` }))
    render(<PhotoStack people={people} />)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })
})
