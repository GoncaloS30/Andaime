import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ReportsPage } from './ReportsPage'

vi.mock('../../session', () => ({ useActiveOrg: () => ({ id: 'org-1', name: 'Empresa Real' }) }))
vi.mock('../../api/workforce', () => ({
  addDaysIso: () => '2026-09-23',
  formatDate: (date: string) => date,
  todayIso: () => '2026-10-20',
}))
vi.mock('../../api/reporting', () => ({
  usePlanningOverview: () => ({ isPending: false, isError: false, refetch: vi.fn(), data: { plannedMin: 960, assignments: 3, employees: 2, sites: 1, teams: 1, vehicles: 1 } }),
  useTeamDistribution: () => ({ isPending: false, isError: false, refetch: vi.fn(), data: [{ teamId: 't1', teamName: 'Equipa Norte', teamColor: '#123456', plannedMin: 960, employees: 2, sites: 1, assignmentDays: 2 }] }),
  useVehicleReport: () => ({ isPending: false, isError: false, refetch: vi.fn(), data: [{ vehicleId: 'v1', plate: 'AA-42-ZZ', make: 'Ford', model: 'Transit', status: 'OPERATIONAL', seats: 3, plannedMin: 960, employees: 2, sites: 1, assignmentDays: 2, peakRiders: 2 }] }),
  usePlannedActual: () => ({ isPending: false, isError: false, refetch: vi.fn(), data: { includesTimeEntries: false, rows: [{ siteId: 's1', siteCode: 'OB-001', siteName: 'Escola', country: 'PT', hourLimitMin: 6000, actualMin: 1200, approvedMin: 960, plannedMin: 960, remainingMin: 4080, projectedPercent: 36 }], totals: { actualMin: 1200, approvedMin: 960, plannedMin: 960 } } }),
  useHoursReport: () => ({ isPending: false, isError: false, refetch: vi.fn(), data: { groups: [{ key: 'e1', label: 'Ana Pedreira', workedMin: 480, normalMin: 420, overtimeMin: 60, entries: 1, employees: 1, sites: 1 }], totals: { workedMin: 480, normalMin: 420, overtimeMin: 60, employees: 1, sites: 1 } } }),
  useDocumentReport: () => ({ isPending: false, isError: false, refetch: vi.fn(), data: { total: 1, statuses: [{ status: 'VALID', documents: 1 }] } }),
}))

describe('ReportsPage', () => {
  it('mostra agregados do servidor sem dados fictícios', () => {
    render(<MemoryRouter><ReportsPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Relatórios' })).toBeInTheDocument()
    expect(screen.getAllByText('16 h').length).toBeGreaterThan(0)
    expect(screen.getByText('Equipa Norte')).toBeInTheDocument()
    expect(screen.getByText('AA-42-ZZ')).toBeInTheDocument()
    expect(screen.getByText('OB-001')).toBeInTheDocument()
    expect(screen.getByText('Ana Pedreira')).toBeInTheDocument()
    expect(screen.getByText('Válidos')).toBeInTheDocument()
    expect(screen.queryByText(/demonstração/i)).not.toBeInTheDocument()
  })
})
