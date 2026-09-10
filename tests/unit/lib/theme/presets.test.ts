import { describe, it, expect } from 'vitest'
import { THEME_PRESETS, getThemeById, DEFAULT_THEME_ID } from '@/lib/theme/presets'
import { scanThemesDirectory, sortThemes, toPreset } from '@/scripts/generate-theme-registry.js'
import type { ThemePreset } from '@/lib/theme/types'

// The shipped theme set, read straight from themes-core/ so these assertions
// hold regardless of any local themes-custom/ additions or overrides (which
// merge into THEME_PRESETS and are allowed to change names, orders, fonts —
// a user customizing a theme must not fail the suite).
const coreScan = sortThemes(scanThemesDirectory('themes-core').themes)
const CORE_PRESETS: ThemePreset[] = coreScan.map((t: { theme: unknown }) =>
  toPreset(t.theme),
) as ThemePreset[]

// Upgrade-safety lock: users' saved theme choices (module_settings +
// localStorage) reference these ids, and the picker cycles the array by
// index, so both the ids and their display order are user-visible contract.
// A themes-core/ rename or reorder must be a deliberate, reviewed change.
const CORE_THEME_IDS = [
  'default',
  'dark',
  'blueprint',
  'light',
  'evening-light',
  'rose-quartz',
  'terminal',
  'terminal-amber',
  'nord',
  'dracula',
  'catppuccin-mocha',
  'github-dark',
  'rose-pine',
  'solarized-dark',
  'grayscale',
  '8-bit',
  'sovereign',
  'sovereign-day',
]

describe('themes-core — shipped data integrity', () => {
  it('scans without errors', () => {
    expect(scanThemesDirectory('themes-core').errors).toEqual([])
  })

  it('contains every core theme id in the canonical display order', () => {
    expect(CORE_PRESETS.map((p) => p.id)).toEqual(CORE_THEME_IDS)
  })

  it('every preset has an id, name, and category', () => {
    for (const preset of CORE_PRESETS) {
      expect(typeof preset.id).toBe('string')
      expect(preset.id.length).toBeGreaterThan(0)
      expect(typeof preset.name).toBe('string')
      expect(['light', 'dark']).toContain(preset.category)
    }
  })

  it('every preset has required color tokens', () => {
    const required = [
      'background',
      'foreground',
      'primary',
      'primaryForeground',
      'secondary',
      'secondaryForeground',
      'muted',
      'mutedForeground',
      'accent',
      'accentForeground',
      'destructive',
      'destructiveForeground',
      'border',
      'input',
      'ring',
      'chart1',
      'chart2',
      'chart3',
      'chart4',
      'chart5',
      'sidebarBackground',
      'sidebarForeground',
      'sidebarPrimary',
      'sidebarPrimaryForeground',
      'sidebarAccent',
      'sidebarAccentForeground',
      'sidebarBorder',
      'sidebarRing',
      'radius',
    ] as const

    for (const preset of CORE_PRESETS) {
      for (const key of required) {
        expect(preset.colors[key], `${preset.id} missing ${key}`).toBeTruthy()
      }
    }
  })

  it('contains the default preset', () => {
    const def = CORE_PRESETS.find((p) => p.id === 'default')
    expect(def).toBeDefined()
    expect(def?.name).toBe('Pastel')
    expect(def?.category).toBe('light')
  })

  it('contains dark themes', () => {
    expect(CORE_PRESETS.filter((p) => p.category === 'dark').length).toBeGreaterThan(0)
  })

  it('contains light themes', () => {
    expect(CORE_PRESETS.filter((p) => p.category === 'light').length).toBeGreaterThan(0)
  })

  it('8-bit preset has defaultFont and defaultFontSize', () => {
    const eightBit = CORE_PRESETS.find((p) => p.id === '8-bit')
    expect(eightBit).toBeDefined()
    expect(eightBit?.defaultFont).toBe('press-start-2p')
    expect(eightBit?.defaultFontSize).toBe('11px')
  })

  it('evening-light preset has topbarBackground and topbarForeground', () => {
    const eveningLight = CORE_PRESETS.find((p) => p.id === 'evening-light')
    expect(eveningLight).toBeDefined()
    expect(eveningLight?.colors.topbarBackground).toBeDefined()
    expect(eveningLight?.colors.topbarForeground).toBeDefined()
  })

  it('most presets do NOT have topbarBackground', () => {
    const withTopbar = CORE_PRESETS.filter((p) => p.colors.topbarBackground !== undefined)
    // Only evening-light, sovereign, and sovereign-day are expected to have it
    expect(withTopbar.length).toBeLessThan(CORE_PRESETS.length)
  })
})

// THEME_PRESETS (the generated registry) merges local themes-custom/ themes in,
// so assertions here must hold for ANY valid theme set — never pin shipped
// names/orders/contents against it.
describe('THEME_PRESETS — registry integrity', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(THEME_PRESETS)).toBe(true)
    expect(THEME_PRESETS.length).toBeGreaterThan(0)
  })

  it('preset IDs are unique', () => {
    const ids = THEME_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('contains every shipped core id', () => {
    for (const id of CORE_THEME_IDS) {
      expect(
        THEME_PRESETS.some((p) => p.id === id),
        `missing core id ${id}`,
      ).toBe(true)
    }
  })
})

describe('getThemeById', () => {
  it('returns the correct preset for a known ID', () => {
    const theme = getThemeById('dark')
    expect(theme).toBeDefined()
    expect(theme?.id).toBe('dark')
  })

  it('returns undefined for an unknown ID', () => {
    expect(getThemeById('nonexistent-theme')).toBeUndefined()
  })

  it('can find each preset by its own id', () => {
    for (const preset of THEME_PRESETS) {
      const found = getThemeById(preset.id)
      expect(found).toBe(preset)
    }
  })

  it('returns undefined for empty string', () => {
    expect(getThemeById('')).toBeUndefined()
  })
})

describe('DEFAULT_THEME_ID', () => {
  it('is a string', () => {
    expect(typeof DEFAULT_THEME_ID).toBe('string')
  })

  it('matches an existing preset', () => {
    expect(getThemeById(DEFAULT_THEME_ID)).toBeDefined()
  })

  it('is "sovereign-day"', () => {
    expect(DEFAULT_THEME_ID).toBe('sovereign-day')
  })
})
