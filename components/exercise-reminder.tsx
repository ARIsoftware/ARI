"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Activity } from "lucide-react"

const COUNTDOWN_DURATION = 120 // 2 minutes in seconds

export function ExerciseReminder() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const lastNotificationRef = useRef<string>("")
  const [open, setOpen] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN_DURATION)

  const startCountdown = useCallback(() => {
    setCountdown(COUNTDOWN_DURATION)

    if (countdownRef.current) {
      clearInterval(countdownRef.current)
    }

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    const checkTime = () => {
      const now = new Date()
      const minutes = now.getMinutes()
      const hours = now.getHours()

      if (minutes === 50 || minutes === 51) {
        const timeKey = `${hours}:${minutes >= 50 ? '50-51' : minutes}`

        if (lastNotificationRef.current !== timeKey) {
          lastNotificationRef.current = timeKey
          setOpen(true)
          startCountdown()
        }
      }
    }

    checkTime()

    intervalRef.current = setInterval(checkTime, 90000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
      }
    }
  }, [startCountdown])

  const testReminder = () => {
    setOpen(true)
    startCountdown()
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const isCountdownActive = countdown > 0

  if (typeof window !== 'undefined' && (window as any).testExerciseReminder === undefined) {
    (window as any).testExerciseReminder = testReminder
  }

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      // Only allow closing via the button, not by clicking outside or pressing escape
      if (!newOpen && open) {
        return
      }
      setOpen(newOpen)
    }}>
      <DialogContent
        className="sm:max-w-2xl border-0"
        style={{ backgroundColor: '#091a32', borderRadius: '15px' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Exercise Reminder</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-12 px-8">
          <h2 className="text-white text-4xl font-semibold mb-6">
            💪 Get Moving 💪
          </h2>
          <p className="text-white text-2xl mb-10">
            Time for your 10 minute exercise break!
          </p>
          <Button
            onClick={() => setOpen(false)}
            disabled={isCountdownActive}
            className={`text-xl font-semibold px-12 py-6 rounded-lg ${
              isCountdownActive
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                : 'bg-white text-black hover:bg-gray-100'
            }`}
          >
            {isCountdownActive ? formatTime(countdown) : 'DONE'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}