"use client"

import { usePathname } from "next/navigation"
import { useDragDropMode } from "@/components/drag-drop-mode-context"

interface MainContentWrapperProps {
  children: React.ReactNode
}

/**
 * Wraps main content and applies opacity when drag-drop mode is active.
 * Dashboard is excluded from fade since it has its own drag targets.
 */
export function MainContentWrapper({ children }: MainContentWrapperProps) {
  const { isDragMode } = useDragDropMode()
  const pathname = usePathname()
  const isDashboardRoute = pathname === "/dashboard"
  const shouldFade = isDragMode && !isDashboardRoute

  return (
    <div className={`overflow-x-hidden ${shouldFade ? "opacity-10 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}`}>
      {children}
    </div>
  )
}
