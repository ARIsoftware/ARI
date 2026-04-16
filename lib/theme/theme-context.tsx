"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
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
// Stores the user's explicitly chosen font (so theme defaults don't permanently override it)
const USER_FONT_KEY = 'ari-user-font'

// Apply theme colors to document
function applyThemeColors(colors: ThemeColors) {
  const root = document.documentElement
  for (const [key, value] of Object.entries(colors)) {
    const cssVar = CSS_VAR_MAP[key as keyof ThemeColors]
    if (cssVar) {
      root.style.setProperty(cssVar, value)
    }
  }
  // Reset optional topbar vars to defaults when not set by theme
  if (!colors.topbarBackground) {
    root.style.removeProperty('--topbar-background')
  }
  if (!colors.topbarForeground) {
    root.style.removeProperty('--topbar-foreground')
  }
}

// Apply font to document
function applyFont(fontId: string) {
  const family = getFontFamily(fontId)
  document.documentElement.style.setProperty('--font-family', family)
}

// Apply or remove theme font size override on the root html element
// Setting fontSize on <html> scales all rem-based sizes (Tailwind classes etc.)
function applyFontSize(size: string | undefined) {
  if (size) {
    document.documentElement.style.fontSize = size
  } else {
    document.documentElement.style.fontSize = ''
  }
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

export function ThemeProvider({ children, isAuthenticated: isAuthProp, isAuthLoading }: { children: ReactNode; isAuthenticated: boolean; isAuthLoading: boolean }) {
  const [activeThemeId, setActiveThemeId] = useState(DEFAULT_THEME_ID)
  const [activeFont, setActiveFont] = useState(DEFAULT_FONT_ID)
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([])
  const [sidebarView, setSidebarViewState] = useState<SidebarView>('default')
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticatedState, setIsAuthenticatedState] = useState(false)

  // Get current theme object (check for customization first)
  const currentTheme: ThemePreset | CustomTheme | null =
    customThemes.find((t) => t.basePresetId === activeThemeId) ??
    getThemeById(activeThemeId) ??
    customThemes.find((t) => t.id === activeThemeId) ??
    null

  const isDarkMode = currentTheme?.category === 'dark'

  // Load from cache and handle migrations immediately on mount
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
  }, [])

  // Fetch from API only when authenticated
  useEffect(() => {
    // Wait until auth state is determined
    if (isAuthLoading) return

    // Not authenticated - skip API call and use cached/default
    if (!isAuthProp) {
      setIsAuthenticatedState(false)
      setIsLoading(false)
      return
    }

    // Fetch from API
    fetch('/api/theme')
      .then((res) => {
        if (res.ok) {
          setIsAuthenticatedState(true)
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
        // Error - use cached/default
        setIsAuthenticatedState(false)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [isAuthLoading, isAuthProp])

  // Debounce API saves so rapid theme switching doesn't spam DB connections
  const pendingSettingsRef = useRef<Partial<ThemeSettings> | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const saveSettings = useCallback(
    (settings: Partial<ThemeSettings>) => {
      // Update cache immediately (instant UI)
      const cached = localStorage.getItem(THEME_CACHE_KEY)
      const current = cached ? JSON.parse(cached) : {}
      const updated = { ...current, ...settings }
      localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(updated))

      // Merge with any pending unsaved settings
      pendingSettingsRef.current = { ...pendingSettingsRef.current, ...settings }

      // Debounce the API call — only the last change within 1.5s hits the server
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const toSave = pendingSettingsRef.current
        pendingSettingsRef.current = null
        if (isAuthenticatedState && toSave) {
          fetch('/api/theme', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toSave),
          }).catch((e) => console.error('[Theme] Failed to save to API:', e))
        }
      }, 2000)
    },
    [isAuthenticatedState]
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

      // Apply theme font size override (or clear it)
      applyFontSize(theme.defaultFontSize)

      // Handle theme default fonts:
      // - Theme with defaultFont: apply it (but remember user's manual choice)
      // - Theme without defaultFont: restore user's manual choice
      if (theme.defaultFont && getFontById(theme.defaultFont)) {
        setActiveFont(theme.defaultFont)
        applyFont(theme.defaultFont)
        saveSettings({ activeThemeId: themeId, activeFont: theme.defaultFont })
      } else {
        const userFont = localStorage.getItem(USER_FONT_KEY) || DEFAULT_FONT_ID
        setActiveFont(userFont)
        applyFont(userFont)
        saveSettings({ activeThemeId: themeId, activeFont: userFont })
      }

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

      // Remember as the user's explicit choice (restored when switching away from theme-default fonts)
      localStorage.setItem(USER_FONT_KEY, fontId)
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

// Export presets and fonts for convenience
export { THEME_PRESETS, FONTS }
