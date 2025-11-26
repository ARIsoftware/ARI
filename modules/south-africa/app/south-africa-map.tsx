'use client'

import { useEffect, useState, useRef } from 'react'
import { Card } from '@/components/ui/card'
import type { Activity } from '../types'

interface SouthAfricaMapProps {
  activities: Activity[]
}

// Center the map on the Western Cape area
const mapCenter: [number, number] = [-33.9, 20.5]

export default function SouthAfricaMap({ activities }: SouthAfricaMapProps) {
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
  }, [isClient, activities])

  if (!isClient) {
    return (
      <Card className="w-full h-[300px] flex items-center justify-center bg-muted/50 relative z-0">
        <span className="text-muted-foreground">Loading map...</span>
      </Card>
    )
  }

  // Filter activities that have coordinates
  const activitiesWithCoords = activities.filter(a => a.lat && a.lng)

  // Dynamic import components
  const MapContent = () => {
    const L = require('leaflet')
    const { MapContainer, TileLayer, Marker, Popup } = require('react-leaflet')

    // Create custom colored markers
    const createColoredIcon = (color: string) => {
      return L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="
            background-color: ${color};
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          "></div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      })
    }

    const stayIcon = createColoredIcon('#3382cd') // Blue
    const eventIcon = createColoredIcon('#22c55e') // Green

    return (
      <MapContainer
        center={mapCenter}
        zoom={8}
        scrollWheelZoom={false}
        style={{ height: '300px', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        {activitiesWithCoords.map((activity) => (
          <Marker
            key={activity.id}
            position={[activity.lat!, activity.lng!]}
            icon={activity.activity_type === 'stay' ? stayIcon : eventIcon}
          >
            <Popup>
              <strong>{activity.title}</strong>
              <br />
              <span style={{ fontSize: '11px', color: activity.activity_type === 'stay' ? '#3382cd' : '#22c55e' }}>
                {activity.activity_type === 'stay' ? 'Stay' : 'Event'}
              </span>
              <br />
              <span style={{ fontSize: '12px' }}>{activity.address}</span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    )
  }

  return (
    <Card className="w-full overflow-hidden relative z-0">
      <MapContent />
    </Card>
  )
}
