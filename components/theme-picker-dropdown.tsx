"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Palette, Check, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme, THEME_PRESETS } from "@/lib/theme/theme-context"

// Get a preview color from theme for display
function getPreviewColors(colors: { primary: string; accent: string; background: string }) {
  // Convert HSL string to CSS color
  const toHsl = (hsl: string) => `hsl(${hsl})`
  return {
    primary: toHsl(colors.primary),
    accent: toHsl(colors.accent),
    background: toHsl(colors.background),
  }
}

export function ThemePickerDropdown({ isDragMode = false }: { isDragMode?: boolean }) {
  const router = useRouter()
  const { activeThemeId, setTheme, customThemes } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Apple-esque drag mode styling: subtle ring with glow effect
  const dragItemClass = isDragMode
    ? "ring-1 ring-white/40 shadow-[0_0_8px_rgba(255,255,255,0.15)] rounded-lg"
    : ""

  // Only render after mounting to avoid hydration issues
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 text-white hover:bg-white/10 hover:text-white ${dragItemClass}`}
      >
        <Palette className="h-5 w-5" />
      </Button>
    )
  }

  const allThemes = [...THEME_PRESETS, ...customThemes]

  // In drag mode, just render the button without dropdown functionality
  if (isDragMode) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 text-white hover:bg-white/10 hover:text-white ${dragItemClass}`}
      >
        <Palette className="h-5 w-5" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white hover:bg-white/10 hover:text-white"
        >
          <Palette className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Select Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Pre-built themes */}
        {THEME_PRESETS.map((theme) => {
          const preview = getPreviewColors(theme.colors)
          const isActive = activeThemeId === theme.id

          return (
            <DropdownMenuItem
              key={theme.id}
              onClick={() => setTheme(theme.id)}
              className="flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {/* Color preview circles */}
                <div className="flex -space-x-1">
                  <div
                    className="w-3 h-3 rounded-full border border-white/20"
                    style={{ backgroundColor: preview.background }}
                  />
                  <div
                    className="w-3 h-3 rounded-full border border-white/20"
                    style={{ backgroundColor: preview.primary }}
                  />
                  <div
                    className="w-3 h-3 rounded-full border border-white/20"
                    style={{ backgroundColor: preview.accent }}
                  />
                </div>
                <span>{theme.name}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  ({theme.category})
                </span>
              </div>
              {isActive && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          )
        })}

        {/* Custom themes (if any) */}
        {customThemes.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Custom Themes
            </DropdownMenuLabel>
            {customThemes.map((theme) => {
              const preview = getPreviewColors(theme.colors)
              const isActive = activeThemeId === theme.id

              return (
                <DropdownMenuItem
                  key={theme.id}
                  onClick={() => setTheme(theme.id)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1">
                      <div
                        className="w-3 h-3 rounded-full border border-white/20"
                        style={{ backgroundColor: preview.background }}
                      />
                      <div
                        className="w-3 h-3 rounded-full border border-white/20"
                        style={{ backgroundColor: preview.primary }}
                      />
                      <div
                        className="w-3 h-3 rounded-full border border-white/20"
                        style={{ backgroundColor: preview.accent }}
                      />
                    </div>
                    <span>{theme.name}</span>
                  </div>
                  {isActive && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              )
            })}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => router.push("/settings?tab=themes")}
          className="cursor-pointer"
        >
          <Settings2 className="mr-2 h-4 w-4" />
          Theme Editor
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
