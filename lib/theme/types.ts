/**
 * Theme System Types
 * All color values are in HSL format: "H S% L%" (e.g., "240 10% 3.9%")
 */

export interface ThemeColors {
  // Core colors
  background: string
  foreground: string

  // Card colors
  card: string
  cardForeground: string

  // Popover colors
  popover: string
  popoverForeground: string

  // Primary colors
  primary: string
  primaryForeground: string

  // Secondary colors
  secondary: string
  secondaryForeground: string

  // Muted colors
  muted: string
  mutedForeground: string

  // Accent colors
  accent: string
  accentForeground: string

  // Destructive colors
  destructive: string
  destructiveForeground: string

  // Border/Input/Ring
  border: string
  input: string
  ring: string

  // Chart colors
  chart1: string
  chart2: string
  chart3: string
  chart4: string
  chart5: string

  // Sidebar colors
  sidebarBackground: string
  sidebarForeground: string
  sidebarPrimary: string
  sidebarPrimaryForeground: string
  sidebarAccent: string
  sidebarAccentForeground: string
  sidebarBorder: string
  sidebarRing: string

  // Border radius
  radius: string
}

export type ThemeCategory = 'light' | 'dark'

export interface ThemePreset {
  id: string
  name: string
  category: ThemeCategory
  colors: ThemeColors
}

export interface CustomTheme extends ThemePreset {
  createdAt: string
  updatedAt: string
  // For preset customizations, this tracks which preset was customized
  basePresetId?: string
}

export interface ThemeSettings {
  activeThemeId: string
  activeFont: string
  customThemes: CustomTheme[]
}

export interface FontOption {
  id: string
  name: string
  family: string
}

// CSS variable name mapping
export const CSS_VAR_MAP: Record<keyof ThemeColors, string> = {
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  cardForeground: '--card-foreground',
  popover: '--popover',
  popoverForeground: '--popover-foreground',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  destructive: '--destructive',
  destructiveForeground: '--destructive-foreground',
  border: '--border',
  input: '--input',
  ring: '--ring',
  chart1: '--chart-1',
  chart2: '--chart-2',
  chart3: '--chart-3',
  chart4: '--chart-4',
  chart5: '--chart-5',
  sidebarBackground: '--sidebar-background',
  sidebarForeground: '--sidebar-foreground',
  sidebarPrimary: '--sidebar-primary',
  sidebarPrimaryForeground: '--sidebar-primary-foreground',
  sidebarAccent: '--sidebar-accent',
  sidebarAccentForeground: '--sidebar-accent-foreground',
  sidebarBorder: '--sidebar-border',
  sidebarRing: '--sidebar-ring',
  radius: '--radius',
}

// Helper to convert theme colors to CSS variables
export function themeToCssVars(colors: ThemeColors): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(colors)) {
    const cssVar = CSS_VAR_MAP[key as keyof ThemeColors]
    if (cssVar) {
      vars[cssVar] = value
    }
  }
  return vars
}
