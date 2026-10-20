import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { WeeklyMapsPage } from './WeeklyMapsPage'

vi.mock('../../session', () => ({ useActiveOrg: () => ({ id: 'org-1', name: 'Empresa Real', role: 'OWNER', experience: 'gestor' }) }))
vi.mock('../../api/workforce', () => ({
  addDaysIso: (date: string, days: number) => {
    const value = new Date(`${date}T00:00:00Z`)
    value.setUTCDate(value.getUTCDate() + days)
    return value.toISOString().slice(0, 10)
  },
  formatDate: (date: string) => date,
  todayIso: () => '2026-10-19',
  useClients: () => ({ data: [] }),
  useEmployeeOptions: () => ({ data: { items: [] } }),
  useSites: () => ({ data: [] }),
  useTeams: () => ({ data: [] }),
}))
vi.mock('../../api/planning', () => ({ mondayOf: (date: string) => date }))
vi.mock('../../api/reporting', () => ({
  downloadWeeklyMap: vi.fn(),
  useWeeklyMap: () => ({
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    data: {
      weekStart: '2026-10-19',
      weekNumber: 43,
      days: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'],
      totals: { plannedMin: 480, employees: 1, sites: 1, vehicles: 1 },
      groups: [{
        key: 'team|site', teamId: 'team', teamName: 'Equipa Norte', teamColor: '#2a78d6',
        siteId: 'site', siteCode: 'OB-PT-001', siteName: 'Escola Central', clientName: 'Cliente', city: 'Braga', country: 'PT',
        dates: ['2026-10-19'], start: '08:00', end: '17:00', schedule: '08:00–17:00', vehicles: ['AA-42-ZZ'],
        foremanName: 'Ana Pedreira', totalMin: 480, notes: ['Montagem'], workers: [{
          employeeId: 'employee', name: 'Ana Pedreira', number: '001', category: 'Encarregada', foreman: true,
          minutesByDate: { '2026-10-19': 480 }, totalMin: 480,
        }],
      }],
    },
  }),
}))

describe('WeeklyMapsPage', () => {
  it('mostra o read model real e permite exportar', () => {
    render(<MemoryRouter><WeeklyMapsPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Mapas semanais' })).toBeInTheDocument()
    expect(screen.getByText('Equipa Norte')).toBeInTheDocument()
    expect(screen.getByText(/OB-PT-001/)).toBeInTheDocument()
    expect(screen.getByText('AA-42-ZZ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled()
  })
})
