"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Palette,
  Type,
  Check,
  Sun,
  Moon,
} from "lucide-react"
import { useTheme, THEME_PRESETS, FONTS } from "@/lib/theme/theme-context"

export function ThemesTab(): React.ReactElement {
  const {
    activeThemeId,
    activeFont,
    setTheme,
    setFont,
  } = useTheme()

  // Get preview colors for a theme
  const getPreviewColors = (colors: { background: string; primary: string; accent: string; foreground: string }) => ({
    background: `hsl(${colors.background})`,
    primary: `hsl(${colors.primary})`,
    accent: `hsl(${colors.accent})`,
    foreground: `hsl(${colors.foreground})`,
  })

  return (
    <div className="space-y-6">
      {/* Theme Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5 text-primary" />
            Theme Selection
          </CardTitle>
          <CardDescription>
            Choose a theme for the application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {THEME_PRESETS.map((preset) => {
              const preview = getPreviewColors(preset.colors)
              const isActive = activeThemeId === preset.id

              return (
                <button
                  key={preset.id}
                  onClick={() => setTheme(preset.id)}
                  className={`relative p-3 rounded-lg border-2 transition-all hover:scale-105 ${
                    isActive
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                  style={{ backgroundColor: preview.background }}
                >
                  {/* Theme preview */}
                  <div className="flex items-center gap-1 mb-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: preview.primary }}
                    />
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: preview.accent }}
                    />
                    {preset.category === "dark" ? (
                      <Moon className="w-3 h-3 ml-auto text-gray-400" />
                    ) : (
                      <Sun className="w-3 h-3 ml-auto text-gray-600" />
                    )}
                  </div>
                  <span
                    className="text-xs font-medium truncate block"
                    style={{ color: preview.foreground }}
                  >
                    {preset.name}
                  </span>
                  {isActive && (
                    <div className="absolute top-1 right-1">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Font Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Type className="h-5 w-5 text-primary" />
            Font Selection
          </CardTitle>
          <CardDescription>
            Choose the font family used throughout the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Select value={activeFont} onValueChange={setFont}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder="Select a font" />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((font) => (
                  <SelectItem
                    key={font.id}
                    value={font.id}
                    style={{ fontFamily: font.family }}
                  >
                    {font.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Font preview */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <p className="text-sm text-muted-foreground mb-2">Preview:</p>
            <p className="text-lg">
              The quick brown fox jumps over the lazy dog.
            </p>
            <p className="text-sm mt-1">
              ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
