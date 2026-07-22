/**
 * Tests for lib/theme/index.ts
 *
 * This is a barrel file that re-exports from:
 *   - ./types   (ThemeColors, ThemePreset, CSS_VAR_MAP, etc.)
 *   - ./presets (THEME_PRESETS, getThemeById, DEFAULT_THEME_ID)
 *   - ./fonts   (excluded from coverage — next/font, no logic)
 *   - ./theme-context (ThemeProvider, useTheme — React context, excluded here)
 *
 * We verify that the public API is importable and has the expected shape.
 * Detailed behaviour tests live in presets.test.ts and types is types-only.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock theme-context to avoid needing a DOM/React rendering environment
vi.mock('@/lib/theme/theme-context', () => ({
  ThemeProvider: () => null,
  useTheme: () => ({}),
}))

// Mock fonts to avoid next/font side effects
vi.mock('@/lib/theme/fonts', () => ({
  FONTS: [],
  DEFAULT_FONT_ID: 'dm-sans',
  getFontById: vi.fn(),
  getFontFamily: vi.fn(),
}))

// Re-export passthrough: import from the barrel
import { THEME_PRESETS, getThemeById, DEFAULT_THEME_ID, CSS_VAR_MAP } from '@/lib/theme/index'

describe('lib/theme/index — barrel exports', () => {
  it('re-exports THEME_PRESETS', () => {
    expect(Array.isArray(THEME_PRESETS)).toBe(true)
    expect(THEME_PRESETS.length).toBeGreaterThan(0)
  })

  it('re-exports getThemeById', () => {
    expect(typeof getThemeById).toBe('function')
    expect(getThemeById('default')).toBeDefined()
  })

  it('re-exports DEFAULT_THEME_ID', () => {
    expect(typeof DEFAULT_THEME_ID).toBe('string')
    expect(DEFAULT_THEME_ID).toBe('default')
  })

  it('re-exports CSS_VAR_MAP with core color keys', () => {
    expect(typeof CSS_VAR_MAP).toBe('object')
    expect(CSS_VAR_MAP.background).toBe('--background')
    expect(CSS_VAR_MAP.foreground).toBe('--foreground')
    expect(CSS_VAR_MAP.primary).toBe('--primary')
    expect(CSS_VAR_MAP.sidebarBackground).toBe('--sidebar-background')
    expect(CSS_VAR_MAP.radius).toBe('--radius')
  })

  it('CSS_VAR_MAP optional topbar keys are present', () => {
    expect(CSS_VAR_MAP.topbarBackground).toBe('--topbar-background')
    expect(CSS_VAR_MAP.topbarForeground).toBe('--topbar-foreground')
  })
})
