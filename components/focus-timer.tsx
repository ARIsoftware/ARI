"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Clock, StopCircle } from "lucide-react"

let globalTimerState = {
  isActive: false,
  timeRemaining: 0,
  listeners: [] as Array<(isActive: boolean, timeRemaining: number) => void>
}

export function FocusTimerDisplay() {
  const [state, setState] = useState(globalTimerState)
  
  useEffect(() => {
    const listener = (isActive: boolean, timeRemaining: number) => {
      setState({ ...globalTimerState, isActive, timeRemaining })
    }
    globalTimerState.listeners.push(listener)
    
    return () => {
      globalTimerState.listeners = globalTimerState.listeners.filter(l => l !== listener)
    }
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (!state.isActive) return null

  return (
    <div className="w-full bg-black flex items-center justify-center" style={{ height: '80vh' }}>
      <div className="text-center">
        <h1 className="text-white text-6xl font-bold">
          FOCUS TIME {formatTime(state.timeRemaining)}
        </h1>
      </div>
    </div>
  )
}

export function FocusTimer() {
  const [isSelectOpen, setIsSelectOpen] = useState(false)
  const [isTimerActive, setIsTimerActive] = useState(globalTimerState.isActive)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const updateGlobalState = (isActive: boolean, timeRemaining: number) => {
    globalTimerState.isActive = isActive
    globalTimerState.timeRemaining = timeRemaining
    globalTimerState.listeners.forEach(listener => listener(isActive, timeRemaining))
    setIsTimerActive(isActive)
  }

  useEffect(() => {
    if (globalTimerState.isActive && globalTimerState.timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        const newTime = globalTimerState.timeRemaining - 1
        if (newTime <= 0) {
          updateGlobalState(false, 0)
        } else {
          updateGlobalState(true, newTime)
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
  }, [globalTimerState.isActive])

  const startTimer = (minutes: number) => {
    updateGlobalState(true, minutes * 60)
    setIsSelectOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const stopTimer = () => {
    updateGlobalState(false, 0)
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

      <Dialog open={isSelectOpen} onOpenChange={setIsSelectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">
              Select Focus Time
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
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
        </DialogContent>
      </Dialog>
    </>
  )
}