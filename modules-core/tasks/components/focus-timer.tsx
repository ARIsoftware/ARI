"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Clock, StopCircle } from "lucide-react"

// Use global window object to ensure state is shared across components
let globalTimerState = {
  isActive: false,
  timeRemaining: 0,
  listeners: [] as Array<(isActive: boolean, timeRemaining: number) => void>
}

// Make sure we're using the same global state across components
if (typeof window !== 'undefined') {
  if ((window as any).globalTimerState) {
    globalTimerState = (window as any).globalTimerState
  } else {
    (window as any).globalTimerState = globalTimerState
  }
}

/**
 * Helper function to update global timer state and notify listeners
 */
function updateGlobalState(isActive: boolean, timeRemaining: number, setIsTimerActive?: (active: boolean) => void) {
  globalTimerState.isActive = isActive
  globalTimerState.timeRemaining = timeRemaining
  globalTimerState.listeners.forEach(listener => listener(isActive, timeRemaining))
  if (setIsTimerActive) {
    setIsTimerActive(isActive)
  }
}

/**
 * FocusTimerDialog - Controlled dialog component for selecting focus time
 * Used by both the FocusTimer button and FocusTimerTopBarIcon
 */
export function FocusTimerDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const [isTimerActive, setIsTimerActive] = useState(globalTimerState.isActive)

  useEffect(() => {
    if (isTimerActive && globalTimerState.timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        const newTime = globalTimerState.timeRemaining - 1
        if (newTime <= 0) {
          updateGlobalState(false, 0, setIsTimerActive)
        } else {
          updateGlobalState(true, newTime, setIsTimerActive)
        }
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isTimerActive])

  const startTimer = (minutes: number) => {
    updateGlobalState(true, minutes * 60, setIsTimerActive)
    onOpenChange(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const stopTimer = () => {
    updateGlobalState(false, 0, setIsTimerActive)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            {isTimerActive ? "Focus Timer Active" : "Select Focus Time"}
          </DialogTitle>
        </DialogHeader>
        {isTimerActive ? (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-center text-muted-foreground">
              Timer is currently running. You can stop it from here.
            </p>
            <Button
              onClick={stopTimer}
              className="w-full py-6 text-lg"
              variant="destructive"
            >
              <StopCircle className="w-5 h-5 mr-2" />
              Stop Focus Timer
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-4">
            <Button
              onClick={() => startTimer(10/60)}
              className="w-full py-6 text-lg"
              variant="outline"
            >
              10 seconds
            </Button>
            <Button
              onClick={() => startTimer(5)}
              className="w-full py-6 text-lg"
              variant="outline"
            >
              5 minutes
            </Button>
            <Button
              onClick={() => startTimer(10)}
              className="w-full py-6 text-lg"
              variant="outline"
            >
              10 minutes
            </Button>
            <Button
              onClick={() => startTimer(20)}
              className="w-full py-6 text-lg"
              variant="outline"
            >
              20 minutes
            </Button>
            <Button
              onClick={() => startTimer(30)}
              className="w-full py-6 text-lg"
              variant="outline"
            >
              30 minutes
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * FocusTimer - Button component that shows the focus timer dialog
 * Used in the tasks page header
 */
export function FocusTimer() {
  const [isSelectOpen, setIsSelectOpen] = useState(false)
  const [isTimerActive, setIsTimerActive] = useState(globalTimerState.isActive)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Listen for global state changes
    const listener = (isActive: boolean) => {
      setIsTimerActive(isActive)
    }
    globalTimerState.listeners.push(listener)

    return () => {
      globalTimerState.listeners = globalTimerState.listeners.filter(l => l !== listener)
    }
  }, [])

  useEffect(() => {
    if (isTimerActive && globalTimerState.timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        const newTime = globalTimerState.timeRemaining - 1
        if (newTime <= 0) {
          updateGlobalState(false, 0, setIsTimerActive)
        } else {
          updateGlobalState(true, newTime, setIsTimerActive)
        }
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isTimerActive])

  const stopTimer = () => {
    updateGlobalState(false, 0, setIsTimerActive)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
  }

  return (
    <>
      {!isTimerActive ? (
        <Button
          variant="outline"
          onClick={() => setIsSelectOpen(true)}
          className="bg-white"
        >
          <Clock className="w-4 h-4 mr-2" />
          Focus Time
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={stopTimer}
          className="bg-white"
        >
          <StopCircle className="w-4 h-4 mr-2" />
          Stop Focus
        </Button>
      )}

      <FocusTimerDialog
        open={isSelectOpen}
        onOpenChange={setIsSelectOpen}
      />
    </>
  )
}
