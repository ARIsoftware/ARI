'use client'

import { useEffect, useState, useRef } from 'react'
import { Card } from '@/components/ui/card'

// Locations to pin
const locations = [
  { name: 'Hout Bay', lat: -34.0443, lng: 18.3539 },
  { name: 'George', lat: -33.9631, lng: 22.4617 },
  { name: 'Brenton', lat: -34.0756, lng: 23.0264 },
  { name: 'Gondwana', lat: -33.9167, lng: 21.4833 },
  { name: 'Glencairn', lat: -34.1556, lng: 18.4306 },
]

// Center the map on the Western Cape area
const mapCenter: [number, number] = [-33.9, 20.5]

export default function SouthAfricaMap() {
  const [isClient, setIsClient] = useState(false)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Handle map resize after render
  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current.invalidateSize()
      }, 100)
    }
  }, [isClient])

  if (!isClient) {
    return (
      <Card className="w-full h-[300px] flex items-center justify-center bg-muted/50">
        <span className="text-muted-foreground">Loading map...</span>
      </Card>
    )
  }

  // Dynamic import components
  const MapContent = () => {
    const L = require('leaflet')
    const { MapContainer, TileLayer, Marker, Popup } = require('react-leaflet')

    // Fix for default marker icons in Leaflet with webpack/Next.js
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    })

    return (
      <MapContainer
        center={mapCenter}
        zoom={7}
        scrollWheelZoom={false}
        style={{ height: '300px', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {locations.map((location) => (
          <Marker key={location.name} position={[location.lat, location.lng]}>
            <Popup>{location.name}</Popup>
          </Marker>
        ))}
      </MapContainer>
    )
  }

  return (
    <Card className="w-full overflow-hidden">
      <MapContent />
    </Card>
  )
}
