"use client"

import { useState, useEffect } from "react"
import { Clock, StopCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FocusTimerDialog } from "@/modules/focus-timer/components/focus-timer-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getGlobalTimerState } from "@/lib/focus-timer-state"

const globalTimerState = getGlobalTimerState()

/**
 * FocusTimerTopBarIcon - Clock icon for the top bar that opens the focus timer dialog
 */
export default function FocusTimerTopBarIcon({ isDragMode = false }: { isDragMode?: boolean }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isTimerActive, setIsTimerActive] = useState(false)

  // Apple-esque drag mode styling: subtle ring with glow effect
  const dragItemClass = isDragMode
    ? "ring-1 ring-white/40 shadow-[0_0_8px_rgba(255,255,255,0.15)] rounded-lg"
    : ""

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
            className={`h-8 w-8 text-white hover:bg-white/10 hover:text-white ${dragItemClass}`}
            onClick={isDragMode ? undefined : () => setIsDialogOpen(true)}
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
