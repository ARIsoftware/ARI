"use client"

import { useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Activity } from "lucide-react"

export function ExerciseReminder() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastNotificationRef = useRef<string>("")
  const [open, setOpen] = useState(false)

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
        }
      }
    }

    checkTime()
    
    intervalRef.current = setInterval(checkTime, 90000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  const testReminder = () => {
    setOpen(true)
  }

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
            className="bg-white text-black hover:bg-gray-100 text-xl font-semibold px-12 py-6 rounded-lg"
          >
            DONE
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}