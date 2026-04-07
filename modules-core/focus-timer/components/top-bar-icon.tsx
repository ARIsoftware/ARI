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
import {
  getGlobalTimerState,
  useFocusTimerListener,
} from "@/modules/focus-timer/lib/focus-timer-state"

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
    setIsTimerActive(globalTimerState.isActive)
  }, [])
  useFocusTimerListener((isActive) => setIsTimerActive(isActive))

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
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
