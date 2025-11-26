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
      <Card className="w-full h-[200px] sm:h-[250px] md:h-[300px] flex items-center justify-center bg-muted/50 relative z-0">
        <span className="text-muted-foreground text-sm">Loading map...</span>
      </Card>
    )
  }

  // Sort activities by start_date (chronological order)
  const sortedActivities = [...activities].sort((a, b) =>
    new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  )

  // Create a map of activity ID to its order number
  const activityOrder = new Map<string, number>()
  sortedActivities.forEach((activity, index) => {
    activityOrder.set(activity.id, index + 1)
  })

  // Filter activities that have coordinates
  const activitiesWithCoords = sortedActivities.filter(a => a.lat && a.lng)

  // Dynamic import components
  const MapContent = () => {
    const L = require('leaflet')
    const { MapContainer, TileLayer, Marker, Popup } = require('react-leaflet')

    // Create custom numbered markers (responsive size)
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
    const markerSize = isMobile ? 24 : 28
    const fontSize = isMobile ? 10 : 12
    const borderWidth = isMobile ? 2 : 3

    const createNumberedIcon = (number: number, color: string) => {
      return L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="
            background-color: ${color};
            width: ${markerSize}px;
            height: ${markerSize}px;
            border-radius: 50%;
            border: ${borderWidth}px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: ${fontSize}px;
            font-weight: 600;
          ">${number}</div>
        `,
        iconSize: [markerSize, markerSize],
        iconAnchor: [markerSize / 2, markerSize / 2],
        popupAnchor: [0, -markerSize / 2]
      })
    }

    const stayColor = '#3382cd' // Blue
    const eventColor = '#22c55e' // Green

    return (
      <div className="h-[200px] sm:h-[250px] md:h-[300px]">
        <MapContainer
          center={mapCenter}
          zoom={8}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          {activitiesWithCoords.map((activity) => {
            const orderNum = activityOrder.get(activity.id) || 0
            const color = activity.activity_type === 'stay' ? stayColor : eventColor
            return (
              <Marker
                key={activity.id}
                position={[activity.lat!, activity.lng!]}
                icon={createNumberedIcon(orderNum, color)}
              >
                <Popup>
                  <strong>{orderNum}. {activity.title}</strong>
                  <br />
                  <span style={{ fontSize: '11px', color }}>
                    {activity.activity_type === 'stay' ? 'Stay' : 'Event'}
                  </span>
                  <br />
                  <span style={{ fontSize: '12px' }}>{activity.address}</span>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>
    )
  }

  return (
    <Card className="w-full overflow-hidden relative z-0">
      <MapContent />
    </Card>
  )
}
