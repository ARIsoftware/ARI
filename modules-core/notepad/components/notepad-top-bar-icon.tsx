"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { StickyNote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Notepad } from "./notepad"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * NotepadTopBarIcon - Renders a sticky note icon in the top bar
 * that opens the Notepad sliding panel when clicked
 */
export default function NotepadTopBarIcon({ isDragMode = false }: { isDragMode?: boolean }) {
  const [isNotepadOpen, setIsNotepadOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Apple-esque drag mode styling: subtle ring with glow effect
  const dragItemClass = isDragMode
    ? "ring-1 ring-white/40 shadow-[0_0_8px_rgba(255,255,255,0.15)] rounded-lg"
    : ""

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
            onClick={isDragMode ? undefined : () => setIsNotepadOpen(true)}
          >
            <StickyNote className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Notepad</p>
        </TooltipContent>
      </Tooltip>

      {mounted && createPortal(
        <Notepad isOpen={isNotepadOpen} onClose={() => setIsNotepadOpen(false)} />,
        document.body
      )}
    </>
  )
}
