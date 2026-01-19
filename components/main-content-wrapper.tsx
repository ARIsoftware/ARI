"use client"

import { useDragDropMode } from "@/components/drag-drop-mode-context"

interface MainContentWrapperProps {
  children: React.ReactNode
}

/**
 * Wraps main content and applies opacity when drag-drop mode is active.
 * This allows users to focus on the sidebar while reordering.
 */
export function MainContentWrapper({ children }: MainContentWrapperProps) {
  const { isDragMode } = useDragDropMode()

  return (
    <div className={isDragMode ? "opacity-10 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
      {children}
    </div>
  )
}
