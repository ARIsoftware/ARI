"use client"

import { StickyNote } from "lucide-react"

/**
 * Notepad Module Page
 *
 * The notepad is primarily accessed via the top bar icon.
 * This page serves as a fallback if someone navigates directly to /notepad.
 */
export default function NotepadPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <StickyNote className="w-16 h-16 text-muted-foreground" />
      <h1 className="text-2xl font-medium">Notepad</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Access your notepad by clicking the sticky note icon in the top bar.
      </p>
    </div>
  )
}
