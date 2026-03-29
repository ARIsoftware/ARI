"use client"

import { useState } from "react"
import { StickyNote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Notepad } from "./notepad"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * NotepadTopBarIcon - Renders a sticky note icon in the top bar
 * that opens the Notepad sliding panel when clicked
 */
export function NotepadTopBarIcon({ isDragMode = false }: { isDragMode?: boolean }) {
  const [isNotepadOpen, setIsNotepadOpen] = useState(false)

  // Apple-esque drag mode styling: subtle ring with glow effect
  const dragItemClass = isDragMode
    ? "ring-1 ring-white/40 shadow-[0_0_8px_rgba(255,255,255,0.15)] rounded-lg"
    : ""

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 ${dragItemClass}`}
              onClick={isDragMode ? undefined : () => setIsNotepadOpen(true)}
            >
              <StickyNote className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Notepad</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Notepad isOpen={isNotepadOpen} onClose={() => setIsNotepadOpen(false)} />
    </>
  )
}
