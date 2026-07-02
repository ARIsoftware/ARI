"use client"

interface FullscreenSlotProps {
  children: React.ReactNode
}

/**
 * Page-owned fullscreen overlay for modules with `fullscreen: true`.
 *
 * The app shell (TaskAnnouncement bar + sidebar + top bar) is rendered once by
 * app/(app)/layout.tsx and stays mounted across navigation. A fullscreen module
 * therefore can't remove the shell structurally; instead it renders its content
 * inside this overlay, which covers the shell from first paint. z-[60] sits
 * above every piece of shell chrome (max z-index in the shell is z-50:
 * TaskAnnouncement takeover/top bar, drag-mode bar, mobile sidebar sheet), and
 * bg-background guarantees the chrome underneath never shows through — so there
 * is no flash on hard load or soft navigation.
 *
 * Constraints for whoever ships the first fullscreen module:
 * - z-index: Radix portals (Dialog/Select/Dropdown/Popover/Tooltip) mount on
 *   document.body at z-50 and would render BEHIND this z-[60] overlay; a
 *   fullscreen module needing them must raise their z-index above 60. Any
 *   focus-timer / exercise-reminder takeover (also z-50) is hidden while open.
 * - scroll: scrolling happens inside this box (overflow-auto), not the window,
 *   so window.scrollY / window.scrollTo are no-ops — scroll the container.
 */
export function FullscreenSlot({ children }: FullscreenSlotProps) {
  return (
    <div className="fixed inset-0 z-[60] overflow-auto bg-background">
      {children}
    </div>
  )
}
