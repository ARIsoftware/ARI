import { PRE_SIGNIN_FONT_FAMILY } from "./fonts"
import { getThemeById } from "./presets"
import { CSS_VAR_MAP, type ThemeColors } from "./types"

// Pre-signin layouts apply theme via inline `style=` because they render
// before ThemeProvider mounts. Build the CSS-var object from the canonical
// preset so values can't drift.
function presetToStyles(id: string): React.CSSProperties {
  const preset = getThemeById(id)
  if (!preset) return {}
  return Object.fromEntries(
    Object.entries(preset.colors).map(([key, value]) => [
      CSS_VAR_MAP[key as keyof ThemeColors],
      value,
    ]),
  ) as React.CSSProperties
}

export const lightThemeStyles = presetToStyles("light")

export function LightLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...lightThemeStyles, fontFamily: PRE_SIGNIN_FONT_FAMILY }} className="light">
      {children}
    </div>
  )
}
