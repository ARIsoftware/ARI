"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useQuickAddTask } from "@/modules/tasks/components/quick-add-task-sheet"

/**
 * TasksTopBarIcon - Plus icon for the top bar that opens the Add Task sheet
 */
export default function TasksTopBarIcon({ isDragMode = false }: { isDragMode?: boolean }) {
  const { setOpen } = useQuickAddTask()

  // Apple-esque drag mode styling: subtle ring with glow effect
  const dragItemClass = isDragMode
    ? "ring-1 ring-white/40 shadow-[0_0_8px_rgba(255,255,255,0.15)] rounded-lg"
    : ""

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
          onClick={isDragMode ? undefined : () => setOpen(true)}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Add Task</p>
      </TooltipContent>
    </Tooltip>
  )
}
