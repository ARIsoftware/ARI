'use client'

import { Plane } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Flight, FlightLeg } from '../types'

function FlightLegDisplay({ leg, isLast }: { leg: FlightLeg; isLast: boolean }) {
  return (
    <div className="relative">
      {/* Departure */}
      <div className="flex gap-2 sm:gap-4">
        <div className="flex flex-col items-center shrink-0">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-blue-500 bg-white" />
          <div className="w-0.5 flex-1 bg-blue-500 min-h-[50px] sm:min-h-[60px]" />
        </div>
        <div className="flex-1 pb-2 min-w-0">
          <div className="flex flex-wrap items-baseline gap-1 sm:gap-2">
            <span className="font-semibold text-xs sm:text-sm">{leg.departureTime}</span>
            <span className="text-xs sm:text-sm break-words">{leg.departureLocation} ({leg.departureCode})</span>
          </div>
          <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 break-words">
            Operated by: {leg.operator}, {leg.flightNumber}
          </div>
          <div className="text-[10px] sm:text-xs text-muted-foreground">
            Aircraft: {leg.aircraft}
          </div>
          <div className="text-[10px] sm:text-xs text-muted-foreground">
            Travel class {leg.travelClass}
          </div>
        </div>
      </div>

      {/* Arrival */}
      <div className="flex gap-2 sm:gap-4">
        <div className="flex flex-col items-center shrink-0">
          <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${isLast ? 'bg-blue-500' : 'border-2 border-blue-500 bg-white'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-1 sm:gap-2">
            <span className="font-semibold text-xs sm:text-sm">{leg.arrivalTime}</span>
            {leg.arrivalDayOffset && (
              <span className="text-[10px] sm:text-xs text-muted-foreground">{leg.arrivalDayOffset}</span>
            )}
            <span className="text-xs sm:text-sm break-words">{leg.arrivalLocation} ({leg.arrivalCode})</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TransferTime({ duration }: { duration: string }) {
  return (
    <div className="flex items-center gap-2 py-2 sm:py-3 pl-1 text-[10px] sm:text-xs text-muted-foreground border-l-2 border-dashed border-blue-300 ml-[4px] sm:ml-[5px]">
      <span className="ml-3 sm:ml-4">Transfer time {duration}</span>
    </div>
  )
}

export default function FlightCards({ flights }: { flights: Flight[] }) {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {flights.map((flight) => (
        <Card key={flight.id} className="overflow-hidden">
          <CardHeader className="pb-2 px-3 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base font-semibold">
              <Plane className="w-4 h-4 shrink-0" />
              <span className="truncate">{flight.title}</span>
            </CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Trip duration: <span className="font-semibold text-foreground">{flight.duration}</span>
            </p>
          </CardHeader>
          <CardContent className="pt-2 px-3 sm:px-6">
            {flight.legs.map((leg, legIndex) => (
              <div key={legIndex}>
                <FlightLegDisplay
                  leg={leg}
                  isLast={legIndex === flight.legs.length - 1}
                />
                {flight.transfer_times && flight.transfer_times[legIndex] && (
                  <TransferTime duration={flight.transfer_times[legIndex]} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
