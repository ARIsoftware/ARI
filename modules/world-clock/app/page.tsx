/**
 * World Clock Module - Main Page
 *
 * Displays digital clocks for South Africa, Toronto, and Nashville
 *
 * Route: /world-clock
 */

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock } from 'lucide-react'

interface TimeZoneInfo {
  name: string
  timezone: string
  flag: string
}

const timeZones: TimeZoneInfo[] = [
  {
    name: 'South Africa',
    timezone: 'Africa/Johannesburg',
    flag: '🇿🇦'
  },
  {
    name: 'Toronto',
    timezone: 'America/Toronto',
    flag: '🇨🇦'
  },
  {
    name: 'Nashville',
    timezone: 'America/Chicago',
    flag: '🇺🇸'
  }
]

function DigitalClock({ name, timezone, flag }: TimeZoneInfo) {
  const [time, setTime] = useState<string>('')
  const [date, setDate] = useState<string>('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()

      // Format time as HH:MM:SS
      const timeString = now.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })

      // Format date
      const dateString = now.toLocaleDateString('en-US', {
        timeZone: timezone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })

      setTime(timeString)
      setDate(dateString)
    }

    // Update immediately
    updateTime()

    // Update every second
    const interval = setInterval(updateTime, 1000)

    return () => clearInterval(interval)
  }, [timezone])

  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <span className="text-2xl">{flag}</span>
          {name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-8">
          <div className="text-6xl font-mono font-bold tracking-wider mb-4">
            {time || '--:--:--'}
          </div>
          <div className="text-lg text-muted-foreground">
            {date || 'Loading...'}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function WorldClockPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2">
          <Clock className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-medium">World Clock</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          View current time across different time zones
        </p>
      </div>

      {/* Clocks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {timeZones.map((tz) => (
          <DigitalClock key={tz.timezone} {...tz} />
        ))}
      </div>
    </div>
  )
}
