import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { ID, Site } from '@/domain/types'
import { cn } from '@/lib/cn'

/** Só o que o mapa precisa, a partir dos dados da API. */
export type MapSite = Pick<Site, 'id' | 'code' | 'name' | 'color' | 'lat' | 'lng'> & { photo?: Site['photo'] }

export interface MapPin {
  site: MapSite
  /** Estado de risco para o contorno do pino. */
  risk?: 'normal' | 'atencao' | 'excede' | 'sem_limite'
}

function pinIcon(site: MapSite, selected: boolean, risk?: MapPin['risk']) {
  const ring = risk === 'excede' ? '#b03a2e' : risk === 'atencao' ? '#c98a12' : '#ffffff'
  // Miniatura da capa da obra (servida pela API, só para quem tem acesso; o HTML do pino não passa pelo React).
  const thumb = site.photo
    ? `<img src="${encodeURI(site.photo)}" width="20" height="20" alt="" style="width:20px;height:20px;object-fit:cover;border-radius:3px;margin-right:5px">`
    : ''
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">
      <div style="background:${selected ? '#13342a' : '#fff'};color:${selected ? '#fff' : '#1f2421'};border:2px solid ${ring === '#ffffff' ? site.color : ring};border-radius:6px;padding:2px 6px 2px ${thumb ? 2 : 6}px;font:600 11px 'JetBrains Mono Variable',monospace;white-space:nowrap;box-shadow:0 2px 8px rgb(19 52 42/.25);display:flex;align-items:center">${thumb}${site.code.slice(3)}</div>
      <div style="width:2px;height:8px;background:${site.color}"></div>
      <div style="width:8px;height:8px;border-radius:50%;background:${site.color};border:2px solid #fff;margin-top:-2px"></div>
    </div>`,
  })
}

function FitBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap()
  const key = pins.map((p) => p.site.id).join(',')
  useEffect(() => {
    if (pins.length === 0) return
    // Sem animação: navegar a meio de uma animação do Leaflet desmontava o mapa e gerava erros.
    if (pins.length === 1) map.setView([pins[0]!.site.lat, pins[0]!.site.lng], 12, { animate: false })
    else map.fitBounds(L.latLngBounds(pins.map((p) => [p.site.lat, p.site.lng])), { padding: [40, 40], animate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(Math.round(e.latlng.lat * 1e5) / 1e5, Math.round(e.latlng.lng * 1e5) / 1e5) })
  return null
}

interface Props {
  pins: MapPin[]
  selected?: ID | null
  onSelect?: (id: ID) => void
  onPick?: (lat: number, lng: number) => void
  picked?: { lat: number; lng: number } | null
  className?: string
  label: string
}

/** Mapa de obras. Os mosaicos (OpenStreetMap) precisam de internet; sem eles mostra um aviso. */
export function SiteMap({ pins, selected, onSelect, onPick, picked, className, label }: Props) {
  const [tileError, setTileError] = useState(false)
  const center = useMemo<[number, number]>(() => (pins[0] ? [pins[0].site.lat, pins[0].site.lng] : [41.5, -1]), [pins])
  return (
    <div className={cn('relative overflow-hidden rounded-md border border-line', className)} role="region" aria-label={label}>
      <MapContainer center={center} zoom={5} scrollWheelZoom={false} zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false} className="h-full w-full" attributionControl>
        <TileLayer
          className="andaime-tiles"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setTileError(true) }}
        />
        <FitBounds pins={pins} />
        {pins.map((p) => (
          <Marker
            key={p.site.id}
            position={[p.site.lat, p.site.lng]}
            icon={pinIcon(p.site, selected === p.site.id, p.risk)}
            title={`${p.site.code} ${p.site.name}`}
            alt={`${p.site.code} ${p.site.name}`}
            keyboard
            eventHandlers={{ click: () => onSelect?.(p.site.id) }}
          />
        ))}
        {onPick && <ClickToPick onPick={onPick} />}
        {picked && (
          <Marker
            position={[picked.lat, picked.lng]}
            icon={L.divIcon({ className: '', iconSize: [0, 0], html: '<div style="transform:translate(-50%,-50%);width:16px;height:16px;border-radius:50%;background:#c8e26a;border:3px solid #13342a"></div>' })}
          />
        )}
      </MapContainer>
      {tileError && (
        <p role="status" className="absolute inset-x-2 bottom-2 z-[500] rounded-sm bg-surface/95 px-2 py-1 text-xs text-ink-3 shadow-e1">
          Sem ligação ao serviço de mapas. As obras continuam marcadas pelas coordenadas.
        </p>
      )}
    </div>
  )
}
