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
import { Input } from '@/components/ui/input'
import { Clock } from 'lucide-react'
import { Overpass_Mono } from 'next/font/google'

const overpassMono = Overpass_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
})

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
  },
  {
    name: 'New Delhi',
    timezone: 'Asia/Kolkata',
    flag: '🇮🇳'
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
          <div className="text-4xl font-mono font-bold tracking-wider mb-4">
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

function TimeConverter() {
  const [inputTime, setInputTime] = useState('12:00 PM')
  const [torontoTime, setTorontoTime] = useState('')
  const [nashvilleTime, setNashvilleTime] = useState('')
  const [newDelhiTime, setNewDelhiTime] = useState('')

  useEffect(() => {
    convertTime(inputTime)
  }, [inputTime])

  const convertTime = (timeStr: string) => {
    try {
      // Parse the input time (format: "HH:MM AM/PM")
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)

      if (!timeMatch) {
        setTorontoTime('--:-- --')
        setNashvilleTime('--:-- --')
        setNewDelhiTime('--:-- --')
        return
      }

      let hours = parseInt(timeMatch[1])
      const minutes = parseInt(timeMatch[2])
      const period = timeMatch[3].toUpperCase()

      // Convert to 24-hour format
      if (period === 'PM' && hours !== 12) {
        hours += 12
      } else if (period === 'AM' && hours === 12) {
        hours = 0
      }

      // Create a base date for today
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth()
      const day = now.getDate()

      // Create ISO string for South Africa time
      // South Africa doesn't observe DST, always UTC+2
      const saTimeString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+02:00`
      const saDate = new Date(saTimeString)

      // Format times for Toronto, Nashville, and New Delhi
      const torontoTimeStr = saDate.toLocaleTimeString('en-US', {
        timeZone: 'America/Toronto',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })

      const nashvilleTimeStr = saDate.toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })

      const newDelhiTimeStr = saDate.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })

      setTorontoTime(torontoTimeStr)
      setNashvilleTime(nashvilleTimeStr)
      setNewDelhiTime(newDelhiTimeStr)
    } catch (error) {
      console.error('Error converting time:', error)
      setTorontoTime('--:-- --')
      setNashvilleTime('--:-- --')
      setNewDelhiTime('--:-- --')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className={overpassMono.className}>Time Converter</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-lg ${overpassMono.className} flex flex-wrap items-center gap-2`}>
          <span>The time</span>
          <Input
            type="text"
            value={inputTime}
            onChange={(e) => setInputTime(e.target.value)}
            className={`w-32 text-center font-mono border-b-2 border-t-0 border-l-0 border-r-0 rounded-none px-2 py-1 focus:ring-0 focus:border-blue-500 ${overpassMono.className}`}
            placeholder="12:00 PM"
          />
          <span>in South Africa is</span>
          <span className="px-2 py-1 min-w-[100px] text-center">
            {torontoTime}
          </span>
          <span>in Toronto,</span>
          <span className="px-2 py-1 min-w-[100px] text-center">
            {nashvilleTime}
          </span>
          <span>in Nashville, and</span>
          <span className="px-2 py-1 min-w-[100px] text-center">
            {newDelhiTime}
          </span>
          <span>in New Delhi.</span>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {timeZones.map((tz) => (
          <DigitalClock key={tz.timezone} {...tz} />
        ))}
      </div>

      {/* Time Converter */}
      <TimeConverter />
    </div>
  )
}
