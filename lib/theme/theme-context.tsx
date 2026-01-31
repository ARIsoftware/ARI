"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { ThemeSettings, ThemeColors, CustomTheme, ThemePreset, SidebarView } from './types'
import { THEME_PRESETS, DEFAULT_THEME_ID, getThemeById } from './presets'
import { FONTS, DEFAULT_FONT_ID, getFontById, getFontFamily } from './fonts'
import { CSS_VAR_MAP } from './types'

interface ThemeContextValue {
  // Theme state
  activeThemeId: string
  activeFont: string
  customThemes: CustomTheme[]
  sidebarView: SidebarView
  isLoading: boolean

  // Current theme details
  currentTheme: ThemePreset | CustomTheme | null
  isDarkMode: boolean

  // Actions
  setTheme: (themeId: string) => void
  setFont: (fontId: string) => void
  setSidebarView: (view: SidebarView) => void
  addCustomTheme: (theme: CustomTheme) => void
  updateCustomTheme: (theme: CustomTheme) => void
  deleteCustomTheme: (themeId: string) => void

  // Backward compatibility
  toggleTheme: () => void
  toggleDarkMode: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

// Local storage key for caching theme settings (for instant load)
const THEME_CACHE_KEY = 'ari-theme-cache'

// Apply theme colors to document
function applyThemeColors(colors: ThemeColors) {
  const root = document.documentElement
  for (const [key, value] of Object.entries(colors)) {
    const cssVar = CSS_VAR_MAP[key as keyof ThemeColors]
    if (cssVar) {
      root.style.setProperty(cssVar, value)
    }
  }
}

// Apply font to document
function applyFont(fontId: string) {
  const family = getFontFamily(fontId)
  document.documentElement.style.setProperty('--font-family', family)
}

// Apply dark mode class and theme identifier
function applyDarkModeClass(isDark: boolean, themeId?: string) {
  const root = document.documentElement
  // Remove all theme classes
  root.classList.remove('dark', 'blueprint', 'light')

  if (isDark) {
    root.classList.add('dark')
  }

  // Set theme ID as data attribute for CSS targeting
  if (themeId) {
    root.dataset.theme = themeId
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [activeThemeId, setActiveThemeId] = useState(DEFAULT_THEME_ID)
  const [activeFont, setActiveFont] = useState(DEFAULT_FONT_ID)
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([])
  const [sidebarView, setSidebarViewState] = useState<SidebarView>('default')
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Get current theme object (check for customization first)
  const currentTheme: ThemePreset | CustomTheme | null =
    customThemes.find((t) => t.basePresetId === activeThemeId) ??
    getThemeById(activeThemeId) ??
    customThemes.find((t) => t.id === activeThemeId) ??
    null

  const isDarkMode = currentTheme?.category === 'dark'

  // Load from cache immediately, then fetch from API
  useEffect(() => {
    // Try to load from localStorage cache first (for instant load)
    const cached = localStorage.getItem(THEME_CACHE_KEY)
    if (cached) {
      try {
        const settings: ThemeSettings = JSON.parse(cached)
        setActiveThemeId(settings.activeThemeId || DEFAULT_THEME_ID)
        setActiveFont(settings.activeFont || DEFAULT_FONT_ID)
        setCustomThemes(settings.customThemes || [])
        setSidebarViewState(settings.sidebarView || 'default')

        // Apply immediately from cache (check for customization first)
        const customization = settings.customThemes?.find((t) => t.basePresetId === settings.activeThemeId)
        const theme = customization ?? getThemeById(settings.activeThemeId) ??
          settings.customThemes?.find((t) => t.id === settings.activeThemeId)
        if (theme) {
          applyThemeColors(theme.colors)
          applyDarkModeClass(theme.category === 'dark', settings.activeThemeId)
        }
        applyFont(settings.activeFont || DEFAULT_FONT_ID)
      } catch (e) {
        console.error('[Theme] Failed to parse cache:', e)
      }
    }

    // Migrate from old theme system
    const oldTheme = localStorage.getItem('theme')
    if (oldTheme && !cached) {
      const migrationMap: Record<string, string> = {
        pastel: 'default',
        default: 'default',
        dark: 'dark',
        blueprint: 'blueprint',
        light: 'light',
      }
      const mappedTheme = migrationMap[oldTheme]
      if (mappedTheme) {
        setActiveThemeId(mappedTheme)
        const theme = getThemeById(mappedTheme)
        if (theme) {
          applyThemeColors(theme.colors)
          applyDarkModeClass(theme.category === 'dark', mappedTheme)
        }
      }
    }

    // Migrate from old font system
    const oldFont = localStorage.getItem('ari-font-preference')
    if (oldFont && !cached) {
      const fontMap: Record<string, string> = {
        'Overpass Mono': 'overpass-mono',
        'Outfit': 'outfit',
        'Open Sans': 'open-sans',
        'Science Gothic': 'science-gothic',
      }
      const mappedFont = fontMap[oldFont] || DEFAULT_FONT_ID
      setActiveFont(mappedFont)
      applyFont(mappedFont)
    }

    // Fetch from API
    fetch('/api/theme')
      .then((res) => {
        if (res.ok) {
          setIsAuthenticated(true)
          return res.json()
        }
        throw new Error('Not authenticated')
      })
      .then((settings: ThemeSettings) => {
        setActiveThemeId(settings.activeThemeId || DEFAULT_THEME_ID)
        setActiveFont(settings.activeFont || DEFAULT_FONT_ID)
        setCustomThemes(settings.customThemes || [])
        setSidebarViewState(settings.sidebarView || 'default')

        // Apply from API data (check for customization first)
        const apiCustomization = settings.customThemes?.find((t) => t.basePresetId === settings.activeThemeId)
        const theme = apiCustomization ?? getThemeById(settings.activeThemeId) ??
          settings.customThemes?.find((t) => t.id === settings.activeThemeId)
        if (theme) {
          applyThemeColors(theme.colors)
          applyDarkModeClass(theme.category === 'dark', settings.activeThemeId)
        }
        applyFont(settings.activeFont || DEFAULT_FONT_ID)

        // Cache the settings
        localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(settings))
      })
      .catch(() => {
        // Not authenticated or error - use cached/default
        setIsAuthenticated(false)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  // Save settings to API and cache
  const saveSettings = useCallback(
    async (settings: Partial<ThemeSettings>) => {
      // Update cache immediately
      const cached = localStorage.getItem(THEME_CACHE_KEY)
      const current = cached ? JSON.parse(cached) : {}
      const updated = { ...current, ...settings }
      localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(updated))

      // Save to API if authenticated
      if (isAuthenticated) {
        try {
          await fetch('/api/theme', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
          })
        } catch (e) {
          console.error('[Theme] Failed to save to API:', e)
        }
      }
    },
    [isAuthenticated]
  )

  // Set theme
  const setTheme = useCallback(
    (themeId: string) => {
      // Check for a customization of a preset first
      const customization = customThemes.find((t) => t.basePresetId === themeId)
      const theme = customization ?? getThemeById(themeId) ?? customThemes.find((t) => t.id === themeId)
      if (!theme) return

      setActiveThemeId(themeId)
      applyThemeColors(theme.colors)
      applyDarkModeClass(theme.category === 'dark', themeId)
      saveSettings({ activeThemeId: themeId })

      // Also update old localStorage for backward compat
      localStorage.setItem('theme', themeId)
    },
    [customThemes, saveSettings]
  )

  // Set font
  const setFont = useCallback(
    (fontId: string) => {
      const font = getFontById(fontId)
      if (!font) return

      setActiveFont(fontId)
      applyFont(fontId)
      saveSettings({ activeFont: fontId })

      // Also update old localStorage for backward compat
      localStorage.setItem('ari-font-preference', font.name)
    },
    [saveSettings]
  )

  // Set sidebar view
  const setSidebarView = useCallback(
    (view: SidebarView) => {
      setSidebarViewState(view)
      saveSettings({ sidebarView: view })
    },
    [saveSettings]
  )

  // Add custom theme
  const addCustomTheme = useCallback(
    (theme: CustomTheme) => {
      setCustomThemes((prev) => {
        const updated = [...prev, theme]
        saveSettings({ customThemes: updated })
        return updated
      })
    },
    [saveSettings]
  )

  // Update custom theme
  const updateCustomTheme = useCallback(
    (theme: CustomTheme) => {
      setCustomThemes((prev) => {
        const updated = prev.map((t) => (t.id === theme.id ? theme : t))
        saveSettings({ customThemes: updated })
        return updated
      })
    },
    [saveSettings]
  )

  // Delete custom theme
  const deleteCustomTheme = useCallback(
    (themeId: string) => {
      // If deleting active theme, switch to default
      if (activeThemeId === themeId) {
        setTheme(DEFAULT_THEME_ID)
      }
      setCustomThemes((prev) => {
        const updated = prev.filter((t) => t.id !== themeId)
        saveSettings({ customThemes: updated })
        return updated
      })
    },
    [activeThemeId, setTheme, saveSettings]
  )

  // Backward compatibility: toggle through themes
  const toggleTheme = useCallback(() => {
    const allThemes = [...THEME_PRESETS, ...customThemes]
    const currentIndex = allThemes.findIndex((t) => t.id === activeThemeId)
    const nextIndex = (currentIndex + 1) % allThemes.length
    setTheme(allThemes[nextIndex].id)
  }, [activeThemeId, customThemes, setTheme])

  // Backward compatibility: toggle dark mode
  const toggleDarkMode = useCallback(() => {
    if (isDarkMode) {
      setTheme('default')
    } else {
      setTheme('dark')
    }
  }, [isDarkMode, setTheme])

  return (
    <ThemeContext.Provider
      value={{
        activeThemeId,
        activeFont,
        customThemes,
        sidebarView,
        isLoading,
        currentTheme,
        isDarkMode,
        setTheme,
        setFont,
        setSidebarView,
        addCustomTheme,
        updateCustomTheme,
        deleteCustomTheme,
        toggleTheme,
        toggleDarkMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Hook to access theme context
 */
export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }
  return context
}

/**
 * Backward-compatible hook (alias for useTheme with legacy interface)
 */
export function useDarkMode() {
  const { activeThemeId, isDarkMode, toggleTheme, toggleDarkMode } = useTheme()

  // Map activeThemeId to the old Theme type
  type LegacyTheme = 'pastel' | 'dark' | 'blueprint' | 'light'
  const legacyThemeMap: Record<string, LegacyTheme> = {
    default: 'pastel',
    pastel: 'pastel',
    dark: 'dark',
    blueprint: 'blueprint',
    light: 'light',
  }
  const theme: LegacyTheme = legacyThemeMap[activeThemeId] || 'pastel'

  return {
    theme,
    isDarkMode,
    toggleTheme,
    toggleDarkMode,
  }
}

// Export presets and fonts for convenience
export { THEME_PRESETS, FONTS }
