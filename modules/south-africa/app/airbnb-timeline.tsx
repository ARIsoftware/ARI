'use client'

import { MapPin, Home } from 'lucide-react'

interface Airbnb {
  id: string
  name: string
  dates: string
  address: string
}

const airbnbs: Airbnb[] = [
  {
    id: '1',
    name: 'Hout Bay',
    dates: 'Dec 4-11',
    address: '20 Bokkemanskloof Road, Cape Town, Western Cape 7806, South Africa',
  },
  {
    id: '2',
    name: 'George',
    dates: 'Dec 11 - Jan 11',
    address: 'George, Western Cape, South Africa',
  },
  {
    id: '3',
    name: 'Brenton',
    dates: 'Jan 11 - Feb 14',
    address: '1 Captain W.A. Duthie Avenue, Lake Brenton Eco Estate 25 Loerie Way, Brenton, Western Cape 6571, South Africa',
  },
  {
    id: '4',
    name: 'Garden Route (Gondwana)',
    dates: 'Feb 14-16',
    address: 'Gondwana Game Reserve, Garden Route, South Africa',
  },
  {
    id: '5',
    name: 'Glencairn',
    dates: 'Feb 16-24',
    address: '40 Hopkirk Way, Cape Town, Western Cape 7975, South Africa',
  },
]

function openInGoogleMaps(address: string) {
  const encoded = encodeURIComponent(address)
  window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank')
}

export default function AirbnbTimeline() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Home className="w-5 h-5" style={{ color: '#3382cd' }} />
        <h2 className="text-xl font-medium">Stays</h2>
      </div>

      <div className="relative">
        {airbnbs.map((airbnb, index) => (
          <div key={airbnb.id} className="flex gap-4 pb-8 last:pb-0">
            {/* Timeline line and dot */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => openInGoogleMaps(airbnb.address)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer z-10"
                style={{ backgroundColor: '#3382cd' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a6ba8'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3382cd'}
                title="Open in Google Maps"
              >
                <MapPin className="w-5 h-5" />
              </button>
              {index < airbnbs.length - 1 && (
                <div className="w-0.5 flex-1 bg-gray-300 mt-2" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 pt-1">
              <p className="text-sm text-muted-foreground mb-1">{airbnb.dates}</p>
              <h3 className="font-medium text-base">{airbnb.name}</h3>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {airbnb.address}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
