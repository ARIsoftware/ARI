'use client'

import { Plane } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface FlightLeg {
  departureTime: string
  departureLocation: string
  departureCode: string
  arrivalTime: string
  arrivalDayOffset?: string
  arrivalLocation: string
  arrivalCode: string
  operator: string
  flightNumber: string
  aircraft: string
  travelClass: string
}

interface Flight {
  title: string
  duration: string
  legs: FlightLeg[]
  transferTimes?: string[]
}

const flights: Flight[] = [
  {
    title: 'Toronto to Cape Town',
    duration: '24h05',
    legs: [
      {
        departureTime: '10:45 p.m.',
        departureLocation: 'Toronto, Pearson International Airport',
        departureCode: 'YYZ',
        arrivalTime: '12:10 p.m.',
        arrivalDayOffset: '+1',
        arrivalLocation: 'Paris, Paris-Charles de Gaulle airport',
        arrivalCode: 'CDG',
        operator: 'Air France',
        flightNumber: 'KL2443',
        aircraft: 'Boeing 777-200',
        travelClass: 'Economy Class'
      },
      {
        departureTime: '5:00 p.m.',
        departureLocation: 'Paris, Paris-Charles de Gaulle airport',
        departureCode: 'CDG',
        arrivalTime: '5:50 a.m.',
        arrivalDayOffset: '+2',
        arrivalLocation: 'Cape Town, Cape Town International Airport',
        arrivalCode: 'CPT',
        operator: 'Air France',
        flightNumber: 'KL2150',
        aircraft: 'Airbus A350-900',
        travelClass: 'Economy Class'
      }
    ],
    transferTimes: ['4h50']
  },
  {
    title: 'Cape Town to Paris',
    duration: '15h40',
    legs: [
      {
        departureTime: '3:20 p.m.',
        departureLocation: 'Cape Town, Cape Town International Airport',
        departureCode: 'CPT',
        arrivalTime: '5:25 p.m.',
        arrivalLocation: 'Johannesburg, O.R. Tambo International Airport',
        arrivalCode: 'JNB',
        operator: 'South African Airlink',
        flightNumber: 'AF7139',
        aircraft: 'Embraer 190',
        travelClass: 'M'
      },
      {
        departureTime: '7:20 p.m.',
        departureLocation: 'Johannesburg, O.R. Tambo International Airport',
        departureCode: 'JNB',
        arrivalTime: '6:00 a.m.',
        arrivalDayOffset: '+1',
        arrivalLocation: 'Paris, Paris-Charles de Gaulle airport',
        arrivalCode: 'CDG',
        operator: 'Air France',
        flightNumber: 'AF995',
        aircraft: 'Airbus A350-900',
        travelClass: 'Economy Class'
      }
    ],
    transferTimes: ['1h55']
  },
  {
    title: 'Paris to Toronto',
    duration: '8h25',
    legs: [
      {
        departureTime: '6:10 p.m.',
        departureLocation: 'Paris, Paris-Charles de Gaulle airport',
        departureCode: 'CDG',
        arrivalTime: '8:35 p.m.',
        arrivalLocation: 'Toronto, Pearson International Airport',
        arrivalCode: 'YYZ',
        operator: 'Air France',
        flightNumber: 'AF358',
        aircraft: 'Boeing 777-200',
        travelClass: 'Economy Class'
      }
    ]
  }
]

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

export default function FlightCards() {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {flights.map((flight, flightIndex) => (
        <Card key={flightIndex} className="overflow-hidden">
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
                {flight.transferTimes && flight.transferTimes[legIndex] && (
                  <TransferTime duration={flight.transferTimes[legIndex]} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
