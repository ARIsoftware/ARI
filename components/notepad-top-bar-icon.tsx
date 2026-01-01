"use client"

import { useState } from "react"
import { StickyNote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Notepad } from "@/components/notepad"
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
export function NotepadTopBarIcon() {
  const [isNotepadOpen, setIsNotepadOpen] = useState(false)

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={() => setIsNotepadOpen(true)}
            >
              <StickyNote className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Open Notepad</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Notepad isOpen={isNotepadOpen} onClose={() => setIsNotepadOpen(false)} />
    </>
  )
}
