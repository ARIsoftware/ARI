"use client"

import { useState, useEffect } from "react"
import { Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme, THEME_PRESETS } from "@/lib/theme/theme-context"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function ThemePickerDropdown({ isDragMode = false }: { isDragMode?: boolean }) {
  const { activeThemeId, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Apple-esque drag mode styling: subtle ring with glow effect
  const dragItemClass = isDragMode
    ? "ring-1 ring-white/40 shadow-[0_0_8px_rgba(255,255,255,0.15)] rounded-lg"
    : ""

  // Only render after mounting to avoid hydration issues
  useEffect(() => {
    setMounted(true)
  }, [])

  // Cycle to next theme on click
  const handleClick = () => {
    if (isDragMode) return

    const currentIndex = THEME_PRESETS.findIndex((t) => t.id === activeThemeId)
    const nextIndex = (currentIndex + 1) % THEME_PRESETS.length
    setTheme(THEME_PRESETS[nextIndex].id)
  }

  // Get current theme name for tooltip
  const currentTheme = THEME_PRESETS.find((t) => t.id === activeThemeId)
  const tooltipText = mounted && currentTheme
    ? `Theme: ${currentTheme.name}`
    : "Theme"

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
      >
        <Palette className="h-5 w-5" />
      </Button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClick}
          className={`h-8 w-8 text-topbar-foreground hover:bg-white/10 hover:text-topbar-foreground ${dragItemClass}`}
        >
          <Palette className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  )
}
