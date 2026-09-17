"use client"

import { useSyncExternalStore } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  isTaskSoundMuted,
  setTaskSoundMuted,
  subscribeTaskSoundMuted,
  playTaskSound,
} from "@/modules/tasks/lib/task-sounds"

/**
 * Icon toggle for the tactile task sound effects. Persists the choice via the
 * task-sounds helper (localStorage) and stays in sync across mounts. Starts
 * from a stable server value (unmuted) and takes the persisted preference on
 * the client via useSyncExternalStore, so there is no hydration mismatch.
 */
export function TaskSoundToggle() {
  // Server snapshot is always "unmuted"; React swaps in the persisted value on
  // the client without a hydration mismatch or an extra render.
  const muted = useSyncExternalStore(subscribeTaskSoundMuted, isTaskSoundMuted, () => false)

  const toggle = () => {
    const next = !muted
    setTaskSoundMuted(next)
    // Play a little tap when turning sound back on so the change is audible.
    if (!next) playTaskSound("tap")
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={toggle}
            aria-label={muted ? "Unmute task sounds" : "Mute task sounds"}
            aria-pressed={muted}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{muted ? "Task sounds off" : "Task sounds on"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
