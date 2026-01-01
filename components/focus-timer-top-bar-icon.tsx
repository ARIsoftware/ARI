"use client"

import { useState, useEffect } from "react"
import { Clock, StopCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FocusTimerDialog } from "@/modules/tasks/components/focus-timer"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// Access the global timer state
let globalTimerState = {
  isActive: false,
  timeRemaining: 0,
  listeners: [] as Array<(isActive: boolean, timeRemaining: number) => void>
}

if (typeof window !== 'undefined' && (window as any).globalTimerState) {
  globalTimerState = (window as any).globalTimerState
}

/**
 * FocusTimerTopBarIcon - Clock icon for the top bar that opens the focus timer dialog
 * Positioned to the left of the Play button in TopBarIcons
 */
export function FocusTimerTopBarIcon() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isTimerActive, setIsTimerActive] = useState(false)

  useEffect(() => {
    // Initialize state from global
    setIsTimerActive(globalTimerState.isActive)

    // Listen for global state changes
    const listener = (isActive: boolean) => {
      setIsTimerActive(isActive)
    }
    globalTimerState.listeners.push(listener)

    return () => {
      globalTimerState.listeners = globalTimerState.listeners.filter(l => l !== listener)
    }
  }, [])

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/10 hover:text-white"
            onClick={() => setIsDialogOpen(true)}
          >
            {isTimerActive ? (
              <StopCircle className="h-5 w-5" />
            ) : (
              <Clock className="h-5 w-5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isTimerActive ? "Stop Focus Timer" : "Focus Timer"}</p>
        </TooltipContent>
      </Tooltip>

      <FocusTimerDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  )
}
