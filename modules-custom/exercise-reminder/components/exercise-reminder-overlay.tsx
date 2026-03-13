"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { usePathname } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { useExerciseReminderSettings } from "@/modules/exercise-reminder/hooks/use-exercise-reminder"
import { DEFAULT_SETTINGS } from "@/modules/exercise-reminder/types"

export function ExerciseReminderOverlay() {
  const pathname = usePathname()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastNotificationRef = useRef<string>("")
  const [open, setOpen] = useState(false)
  const [isTestMode, setIsTestMode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [mounted, setMounted] = useState(false)

  const { data: savedSettings } = useExerciseReminderSettings()

  const enabled = savedSettings?.enabled ?? DEFAULT_SETTINGS.enabled
  const message = savedSettings?.message ?? DEFAULT_SETTINGS.message
  const countdownMinutes = savedSettings?.countdownDuration ?? DEFAULT_SETTINGS.countdownDuration
  const triggerMinute = savedSettings?.triggerMinute ?? DEFAULT_SETTINGS.triggerMinute
  const dismissable = savedSettings?.dismissable ?? DEFAULT_SETTINGS.dismissable

  const countdownSeconds = countdownMinutes * 60
  const isWelcomePage = pathname === "/welcome"

  useEffect(() => {
    setMounted(true)
  }, [])

  const startCountdown = useCallback(() => {
    setCountdown(countdownSeconds)
  }, [countdownSeconds])

  useEffect(() => {
    if (!open || countdown <= 0) return
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000)
    return () => clearTimeout(timer)
  }, [open, countdown])

  useEffect(() => {
    if (!enabled || isWelcomePage) return

    const checkTime = () => {
      const now = new Date()
      const minutes = now.getMinutes()
      const hours = now.getHours()

      const diff = (minutes - triggerMinute + 60) % 60
      if (diff <= 2) {
        const timeKey = `${hours}:${triggerMinute}`
        if (lastNotificationRef.current !== timeKey) {
          lastNotificationRef.current = timeKey
          setIsTestMode(false)
          setOpen(true)
          startCountdown()
        }
      }
    }

    checkTime()
    intervalRef.current = setInterval(checkTime, 45000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled, isWelcomePage, triggerMinute, startCountdown])

  const testReminder = useCallback(() => {
    setIsTestMode(true)
    setOpen(true)
    startCountdown()
  }, [startCountdown])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const isCountdownActive = countdown > 0
  const canClose = isTestMode || dismissable || !isCountdownActive

  useEffect(() => {
    (window as any).testExerciseReminder = testReminder
    return () => { delete (window as any).testExerciseReminder }
  }, [testReminder])

  if (!mounted || isWelcomePage || !enabled) return null

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen && open && !canClose) return
      setOpen(newOpen)
    }}>
      <DialogContent
        className="sm:max-w-2xl bg-background border-[3px] border-primary rounded-[15px]"
        onPointerDownOutside={(e) => { if (!canClose) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (!canClose) e.preventDefault() }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Exercise Reminder</DialogTitle>
        </DialogHeader>
        {(isTestMode || dismissable) && (
          <button
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        )}
        <div className="flex flex-col items-center justify-center py-12 px-8">
          <h2 className="text-4xl font-bold mb-4 text-primary">
            Get Moving
          </h2>
          <div className="text-6xl mb-6">💪</div>
          <p className="text-2xl mb-10 text-primary">
            {message}
          </p>
          <Button
            onClick={() => setOpen(false)}
            disabled={!canClose}
            className={`text-xl font-semibold px-12 py-6 rounded-lg ${
              !canClose
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {!canClose ? formatTime(countdown) : 'DONE'}
          </Button>
          {!isTestMode && dismissable && (
            <button
              onClick={() => setOpen(false)}
              className="mt-4 text-muted-foreground/50 hover:text-muted-foreground text-sm transition-colors"
            >
              dismiss
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
