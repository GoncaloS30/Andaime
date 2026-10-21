import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './http'

/** Contratos F8.4: dormidas e hotéis. Datas em ISO (AAAA-MM-DD); a semana é sempre a segunda-feira. */

const base = (orgId: string) => `/orgs/${orgId}`

export type Away = 'FAR' | 'NEAR' | 'UNKNOWN'

export interface Hotel {
  id: string
  siteId: string
  name: string
  address: string | null
  contact: string | null
  notes: string | null
  /** Uso do hotel: estadias, noites levadas e a última entrada. */
  stays: number
  nights: number
  lastCheckIn: string | null
  version: number
}

export interface HotelInput {
  siteId?: string
  name: string
  address?: string
  contact?: string
  notes?: string
  version?: number
}

export interface Stay {
  id: string
  employeeId: string
  employeeName: string
  siteId: string
  siteCode: string
  siteName: string
  siteColor: string
  week: string
  /** null = hotel por definir. */
  hotelId: string | null
  hotelName: string | null
  hotelAddress: string | null
  hotelContact: string | null
  checkIn: string
  checkOut: string
  nights: number
  notes: string | null
  version: number
}

export interface StayInput {
  employeeId: string
  siteId: string
  week: string
  hotelId: string | null
  checkIn: string
  checkOut: string
  notes?: string | null
}

export interface BoardLine {
  employeeId: string
  employeeName: string
  employeeNumber: string
  homeCity: string | null
  photoUrl: string | null
  siteId: string
  siteCode: string
  siteName: string
  siteColor: string
  /** Dias em que a pessoa está mesmo na obra (sem ausências aprovadas). */
  days: string[]
  proposedCheckIn: string
  proposedCheckOut: string
  proposedNights: number
  away: Away
  distanceKm: number | null
  stay: Stay | null
  hotels: { id: string; name: string }[]
}

export interface WeekBoard {
  week: string
  lines: BoardLine[]
  summary: { peopleAway: number; nights: number; undefinedHotel: number; withoutSchedule: number }
  staysWithoutSchedule: Stay[]
}

/** Noites entre duas datas (entrar segunda e sair sexta são 4). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0
  return Math.max(0, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000))
}

export const nightsLabel = (n: number) => (n === 1 ? '1 noite' : `${n} noites`)

function useInvalidate(orgId: string) {
  const qc = useQueryClient()
  return () => Promise.all(['lodging', 'audit'].map((s) => qc.invalidateQueries({ queryKey: ['org', orgId, s] })))
}

export const useLodgingWeek = (orgId: string, week: string) =>
  useQuery({
    queryKey: ['org', orgId, 'lodging', 'week', week],
    queryFn: () => api<WeekBoard>(`${base(orgId)}/lodging/week?week=${week}`),
    placeholderData: keepPreviousData,
  })

export const useHotels = (orgId: string, siteId: string, enabled = true) =>
  useQuery({
    queryKey: ['org', orgId, 'lodging', 'hotels', siteId],
    queryFn: () => api<Hotel[]>(`${base(orgId)}/lodging/hotels?siteId=${siteId}`),
    enabled,
  })

export const useMyStays = (orgId: string, week: string, enabled = true) =>
  useQuery({
    queryKey: ['org', orgId, 'lodging', 'mine', week],
    queryFn: () => api<Stay[]>(`${base(orgId)}/me/stays?week=${week}`),
    enabled,
  })

export const useEmployeeStays = (orgId: string, employeeId: string, enabled = true) =>
  useQuery({
    queryKey: ['org', orgId, 'lodging', 'employee', employeeId],
    queryFn: () => api<Stay[]>(`${base(orgId)}/employees/${employeeId}/stays`),
    enabled,
  })

export function useSaveHotel(orgId: string, id?: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (input: HotelInput) =>
      id
        ? api<Hotel>(`${base(orgId)}/lodging/hotels/${id}`, { method: 'PATCH', body: input })
        : api<Hotel>(`${base(orgId)}/lodging/hotels`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  })
}

export function useRemoveHotel(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (id: string) => api<void>(`${base(orgId)}/lodging/hotels/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useSaveStay(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (input: StayInput) => api<Stay>(`${base(orgId)}/lodging/stays`, { method: 'PUT', body: input }),
    onSuccess: invalidate,
  })
}

export function useRemoveStay(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (id: string) => api<void>(`${base(orgId)}/lodging/stays/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

/**
 * Cidades com coordenadas para sugerir a residência (sem serviço externo; RGPD limitado à cidade). Ponto de partida
 * da tabela do protótipo V3.1, alargada a França, Bélgica e Alemanha, onde há obras e residentes.
 */
export const CITY_COORDS: { name: string; country: string; lat: number; lng: number }[] = [
  { name: 'Braga', country: 'PT', lat: 41.5454, lng: -8.4265 },
  { name: 'Guimarães', country: 'PT', lat: 41.4425, lng: -8.2918 },
  { name: 'Barcelos', country: 'PT', lat: 41.5388, lng: -8.6151 },
  { name: 'Vila Verde', country: 'PT', lat: 41.6503, lng: -8.4356 },
  { name: 'Famalicão', country: 'PT', lat: 41.4078, lng: -8.5198 },
  { name: 'Póvoa de Lanhoso', country: 'PT', lat: 41.5763, lng: -8.2697 },
  { name: 'Amares', country: 'PT', lat: 41.6303, lng: -8.3517 },
  { name: 'Fafe', country: 'PT', lat: 41.4508, lng: -8.1704 },
  { name: 'Viana do Castelo', country: 'PT', lat: 41.6932, lng: -8.8329 },
  { name: 'Porto', country: 'PT', lat: 41.1579, lng: -8.6291 },
  { name: 'Aveiro', country: 'PT', lat: 40.6405, lng: -8.6538 },
  { name: 'Coimbra', country: 'PT', lat: 40.2033, lng: -8.4103 },
  { name: 'Leiria', country: 'PT', lat: 39.7436, lng: -8.8071 },
  { name: 'Lisboa', country: 'PT', lat: 38.7223, lng: -9.1393 },
  { name: 'Setúbal', country: 'PT', lat: 38.5244, lng: -8.8882 },
  { name: 'Évora', country: 'PT', lat: 38.5714, lng: -7.9135 },
  { name: 'Faro', country: 'PT', lat: 37.0194, lng: -7.9304 },
  { name: 'Paris', country: 'FR', lat: 48.8566, lng: 2.3522 },
  { name: 'Lyon', country: 'FR', lat: 45.764, lng: 4.8357 },
  { name: 'Bordéus', country: 'FR', lat: 44.8378, lng: -0.5792 },
  { name: 'Toulouse', country: 'FR', lat: 43.6047, lng: 1.4442 },
  { name: 'Lille', country: 'FR', lat: 50.6292, lng: 3.0573 },
  { name: 'Bruxelas', country: 'BE', lat: 50.8503, lng: 4.3517 },
  { name: 'Antuérpia', country: 'BE', lat: 51.2194, lng: 4.4025 },
  { name: 'Liège', country: 'BE', lat: 50.6326, lng: 5.5797 },
  { name: 'Gante', country: 'BE', lat: 51.0543, lng: 3.7174 },
  { name: 'Berlim', country: 'DE', lat: 52.52, lng: 13.405 },
  { name: 'Munique', country: 'DE', lat: 48.1351, lng: 11.582 },
  { name: 'Hamburgo', country: 'DE', lat: 53.5511, lng: 9.9937 },
  { name: 'Colónia', country: 'DE', lat: 50.9375, lng: 6.9603 },
  { name: 'Frankfurt', country: 'DE', lat: 50.1109, lng: 8.6821 },
  { name: 'Estugarda', country: 'DE', lat: 48.7758, lng: 9.1829 },
  { name: 'Düsseldorf', country: 'DE', lat: 51.2277, lng: 6.7735 },
]

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()

/** Coordenadas de uma cidade da lista (sem olhar a acentos nem maiúsculas), ou undefined. */
export function cityCoords(name: string): { lat: number; lng: number } | undefined {
  const key = fold(name)
  return key ? CITY_COORDS.find((c) => fold(c.name) === key) : undefined
}
